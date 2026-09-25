/*
// https://insiders.vscode.dev/github/mykhai1o/engcorbot/blob/feature/language-detection/doc/multilingual_implementation_plan.md#L110

// Створимо або оновимо функції для розбиття тексту та аналізу мовних сегментів.

//     Для ** Гібридного підходу Б ** код у файлі `src/index.js` буде виглядати так:

// ```javascript

//   Визначає групу символів (скрипт) для окремого слова.
//   Підтримує Кирилицю (uk/ru) та Латиницю з діакритичними знаками (en/de/fr/es).

function getWordScript(word) {
    const cleanWord = word.trim().replace(/[.,!?;:()"']/g, "");

    if (!cleanWord) {
        return "punctuation";
    }

    // Перевірка на кирилицю (українська, тощо)
    if (/[\u0400-\u04FF]/i.test(cleanWord)) {
        return "cyrillic"; // Українська, тощо
    }

    // Перевірка на латиницю (англійська, німецька, французька, іспанська з діакритикою)
    if (/^[a-zà-öø-ÿā-žßäöüñéèàçíó]+$/i.test(cleanWord)) {
        return "latin"; // Англійська, Німецька, Французька, Іспанська
    }

    return "unknown";
}

// 
//   Розбиває текст на сегменти за мовною групою (скриптом).
//   Об'єднує послідовні слова однієї групи.
//  
function segmentTextByScript(text) {
    const words = text.split(/(\s+)/); // зберігаємо пробіли для точного відновлення фраз
    const segments = [];
    let currentSegment = null;

    for (const token of words) {
        if (!token.trim()) {
            // Якщо це просто пробіли, додаємо їх до поточного сегменту
            if (currentSegment) {
                currentSegment.text += token;
            }
            continue;
        }

        const alphabet = getWordScript(token);

        if (!currentSegment) {
            currentSegment = { alphabet: alphabet, text: token };
        } else if (currentSegment.alphabet === alphabet || alphabet === "punctuation") {
            // Пунктуацію приєднуємо до поточного активного сегменту
            currentSegment.text += token;
        } else {
            segments.push(currentSegment);
            currentSegment = { alphabet: alphabet, text: token };
        }
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}
// ```

//     * Приклад роботи сегментатора:*
//         Вхідний рядок: `"Привіт, мої друзі! Напишіть мені, please, or write a letter сьогодні."`
// Результат:
// ```json
// [
//   { "script": "cyrillic", "text": "Привіт, мої друзі! Напишіть мені, " },
//   { "script": "latin", "text": "please, or write a letter " },
//   { "script": "cyrillic", "text": "сьогодні." }
// ]
// ```

// ---

// ### Крок 3. Налаштування системного промпту Gemini під багатомовність
// Оскільки ми тепер можемо надсилати латинські сегменти(які можуть містити англійські, німецькі, французькі або іспанські фрази), ми маємо розширити системний промпт Gemini.Він повинен:
// 1. Визначити, якою саме мовою написаний сегмент.
// 2. Якщо це англійська, німецька, французька або іспанська мова — виконати перевірку граматики та орфографії.
// 3. Повернути відповідь у структурованому форматі JSON.

// Оновимо константи `MAIN_PROMPT` та `PROMPT_SCHEMA` у `src/index.js`:

// ```javascript
const MAIN_PROMPT = `
        You are an expert multilingual linguistic assistant.Your task is to analyze the provided text segment and perform grammar and vocabulary checks.

        Supported languages for verification: English, German, French, Spanish.

        Instructions:
            1. Determine the language of the input text segment.
            2. If the text is in English, German, French, or Spanish:
                - Scan for any real grammar, spelling, or vocabulary errors.
                - Ignore stylistic preferences, informal language, slang, contractions, capitalization (including proper nouns and abbreviations), or punctuation - only changes.
                - Do not correct proper names, usernames, URLs, code, commands, or quoted text.
            3. If there are errors, set "has_error" to true, and provide the "correction"(the fully corrected segment) and a short "explanation" in its original language.
            4. If the text is in another language(e.g., Ukrainian) or contains no errors, set "has_error" to false, with empty string values for other fields.

            Return strictly a JSON object matching the provided schema.No markdown wrapping.
`;

const PROMPT_SCHEMA = {
    type: "object",
    properties: {
        detected_language: { type: "string", description: "The ISO 2-letter language code of the detected segment (e.g. en, de, fr, es, uk)" },
        has_error: { type: "boolean" },
        specific_error: { type: "string", description: "A specific error that needs to be corrected in text segment in its original language, or empty if no error" },
        correction: { type: "string", description: "The corrected text segment in its original language, or empty if no error" },
        explanation: { type: "string", description: "A brief, clear explanation of the errors and recommendations written in its original language" }
    },
    required: ["detected_language", "has_error", "specific_error", "correction", "explanation"]
};


const GROUP_TEST_ID = -1004467291256;
const THREAD_TEST_ID = 121;
const GROUP_ID_proj = -1003927786565;
const THREAD_ID_proj = 2;



// 1. Функція для прямого виклику Gemini API без важких бібліотек
async function askGemini(text, apiKey) {
    const model = "gemini-3.6-flash"; // Cloudflare Workers чудово працює з цією моделлю
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            systemInstruction: {
                parts: [{ text: MAIN_PROMPT }]
            },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: PROMPT_SCHEMA
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    try {
        const rawText = data.candidates[0].content.parts[0].text;
        return JSON.parse(rawText);
    } catch (e) {
        throw new Error("Не вдалося розпарсити відповідь від Gemini: " + e.message);
    }
}


async function sendMessage(chatId, text, replyToMessageId, botToken) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
            reply_parameters: {
                message_id: replyToMessageId
            }
        })
    });

    const data = await response.json();
    if (!data.ok) {
        console.error("Помилка відправки в Telegram:", data.description);
    }
}

// ```

// ---

// ### Крок 4. Оновлення логіки обробки повідомлень у`handleUpdate`
// Модифікуємо функцію`handleUpdate`, щоб вона інтегрувала сегментацію:

// ```javascript
async function handleUpdate(update, env) {
    const message = update.message;

    if (!message || typeof message.text !== "string") {
        return;
    }

    // Перевірка тредів (залишається без змін)
    if (message.chat.id === GROUP_TEST_ID && message.message_thread_id !== THREAD_TEST_ID) {
        return;
    }
    if (message.chat.id === GROUP_ID_proj && message.message_thread_id !== THREAD_ID_proj) {
        return;
    }
    if (message.forward_origin) {
        return;
    }

    try {

        console.log(message.chat.id);
        console.log(message.message_id);
        console.log(message.message_thread_id);

        console.log(message.from.first_name);
        console.log(message.text);
        console.log("---");

        const geminiKey = env.GEMINI_API_KEY;
        const botToken = env.TELEGRAM_BOT_TOKEN;

        if (!geminiKey || !botToken) {
            console.error("Відсутні змінні оточення GEMINI_API_KEY або TELEGRAM_BOT_TOKEN");
            return;
        }

        // 1. Розбиваємо повідомлення на сегменти
        const segments = segmentTextByScript(message.text);

        // 2. Фільтруємо лише сегменти з латинським скриптом (англійська, німецька, французька, іспанська)
        const latinSegments = segments.filter(seg => seg.alphabet === "latin");

        // Якщо немає іншомовних сегментів, ігноруємо повідомлення
        if (latinSegments.length === 0) {
            return;
        }

        //Накопичення помилок
        const errors = [];

        // 3. Перевіряємо кожен іншомовний сегмент окремо
        for (const segment of latinSegments) {
            const cleanSegmentText = segment.text.trim();

            // Ігноруємо занадто короткі сегменти (наприклад, 1-2 літери), які часто є абревіатурами або помилками
            if (cleanSegmentText.length < 3) {
                continue;
            }

            const answer = await askGemini(cleanSegmentText, geminiKey);
            console.log(`Аналіз сегменту "${cleanSegmentText}": `, JSON.stringify(answer));

            // Якщо виявлено помилку і мова входить до переліку підтримуваних

            // const enabledLanguages = ["en", "de", "fr", "es"];
            const enabledLanguages = ["en"];

            if (answer.has_error && enabledLanguages.includes(answer.detected_language)) {
                errors.push({
                    language: answer.detected_language,
                    segment: cleanSegmentText,
                    specificError: answer.specific_error,
                    correction: answer.correction,
                    explanation: answer.explanation
                });
            }

            // if (answer.has_error && ["en", "de", "fr", "es"].includes(answer.detected_language)) {
            //     let langLabel = "";
            //     switch (answer.detected_language) {
            //         case "en": langLabel = "🇬🇧 English"; break;
            //         case "de": langLabel = "🇩🇪 Deutsch"; break;
            //         case "fr": langLabel = "🇫🇷 Français"; break;
            //         case "es": langLabel = "🇪🇸 Español"; break;
            //     }

            // await sendMessage(
            //     message.chat.id,
            //     `< b > [${langLabel}]</ > для сегменту < i > "${cleanSegmentText}"</ >: \n\n` +
            //     `Maybe you mean: \n✅ <b>${answer.correction}</b>\n\n` +
            //     `📝 <i>${answer.explanation}</i>`,
            //     message.message_id,
            //     botToken
            // );
            //     errors.push({
            //         language: langLabel,
            //         segment: cleanSegmentText,
            //         specific_error: answer.specific_error,
            //         correction: answer.correction,
            //         explanation: answer.explanation
            //     });
            // }
        }

        // 5. Якщо помилок немає — нічого не відправляємо 
        if (errors.length === 0) {
            return;
        }

        // 6. Формуємо одне повідомлення з усіма помилками 
        let responseText = "";

        for (const error of errors) {
            responseText +=
                // `<b>[${error.language}]</b>\n` +
                // `Сегмент: <i>"${error.segment}"</i>\n\n` +
                // `Maybe you mean:\n` +
                `<b><s>${error.specificError}</s></b> ➩ <b>${error.correction}</b>`
            // + `✅ <i>${error.explanation}</i>\n\n` +
            // `────────────\n\n`;
        }

        // 7. Відправляємо ОДНУ відповідь 
        await sendMessage(
            message.chat.id,
            responseText,
            message.message_id,
            botToken
        );
    } catch (e) {
        console.error("Помилка під час обробки повідомлення:", e.message);
    }
}


// ```

// ---

// ### Крок 5. Створення Unit - тестів для перевірки
// Щоб переконатися, що логіка сегментації працює ідеально, додамо тести у`test/index.spec.js`(або окремий тестовий файл).

// Рекомендовані тест - кейси для покриття:
// 1. Суто український текст(не має створювати латинських сегментів).
// 2. Суто англійський текст(має створити 1 латинський сегмент).
// 3. Змішаний текст: `"Привіт, my name is Петро"`.Має створити 3 сегменти(Кирилиця, Латиниця, Кирилиця).
// 4. Багатомовний текст європейськими мовами: `"Hallo, comment ça va?"`.Має виділити один латинський сегмент(оскільки і німецькі, і французькі літери належать до латинського скрипту).

// Приклад коду тесту для `vitest`:

// ```javascript
// import { describe, it, expect } from "vitest";
// import { segmentTextByScript, getWordScript } from "../src/index.js"; // якщо експортувати ці функції

// describe("Якість сегментації тексту", () => {
//     it("правильно визначає скрипт для слів різних мов", () => {
//         expect(getWordScript("Привіт")).toBe("cyrillic");
//         expect(getWordScript("Hello")).toBe("latin");
//         expect(getWordScript("Mädchen")).toBe("latin"); // німецька з умлаутом
//         expect(getWordScript("garçon")).toBe("latin"); // французька з седілем
//         expect(getWordScript("!?,.")).toBe("punctuation");
//     });

//     it("коректно розбиває змішаний українсько-англійський рядок", () => {
//         const result = segmentTextByScript("Привіт, my name is Петро");

//         expect(result).toHaveLength(3);
//         expect(result[0].script).toBe("cyrillic");
//         expect(result[0].text.trim()).toBe("Привіт,");

//         expect(result[1].script).toBe("latin");
//         expect(result[1].text.trim()).toBe("my name is");

//         expect(result[2].script).toBe("cyrillic");
//         expect(result[2].text.trim()).toBe("Петро");
//     });
// });
// ```

// // ---

// // ## 5. Висновок та рекомендації для розробника

// // 1. ** Відмова від важких сторонніх NPM - бібліотек **: Оптимальним рішенням для Cloudflare Workers є ** Гібридний підхід Б **.Він дозволяє уникнути роздування бандлу(Bundle Bloat), не порушує обмежень пам'яті Workers і забезпечує 100% швидкість роботи завдяки регулярним виразам.
// // 2. ** Передача мовного аналізу на Gemini **: ШІ чудово справляється з розрізненням тонкощів європейських мов(відрізняє німецьку від французької чи англійської) навіть у межах короткого латинського сегменту, що вирішує головну проблему статистичних бібліотек на кшталт`franc`.
// // 3. ** Збереження контексту **: Щоб уникнути хибних граматичних виправлень фрагментів слів, системний промпт Gemini розроблений так, щоб ігнорувати стилістичну незавершеність і фокусуватися суто на фундаментальних помилках орфографії та граматики.


// 4. Експорт обробника запитів Cloudflare Worker
export default {
    async fetch(request, env, ctx) {
        // Приймаємо лише POST запити (Telegram надсилає оновлення через POST)
        if (request.method !== "POST") {
            return new Response("Бот працює! Webhook активний.", {
                status: 200,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }

        try {
            // Парсимо JSON, який надіслав Telegram
            const update = await request.json();

            // Запускаємо асинхронну обробку повідомлення. 
            // Використовуємо ctx.waitUntil, щоб Worker не завершував роботу завчасно, 
            // поки відправляється запит до Gemini та Telegram.
            ctx.waitUntil(handleUpdate(update, env));

            // Миттєво повертаємо Telegram статус 200 OK, щоб уникнути повторного надсилання того ж повідомлення
            return new Response("OK", { status: 200 });
        } catch (err) {
            console.error("Помилка обробника вебхука:", err.message);
            return new Response("Internal Server Error", { status: 500 });
        }
    }
};


*/






function getWordScript(word) {
    const cleanWord = word.trim().replace(/[.,!?;:()"']/g, "");

    if (!cleanWord) {
        return "punctuation";
    }

    // Перевірка на кирилицю (українська, тощо)
    if (/[\u0400-\u04FF]/i.test(cleanWord)) {
        return "cyrillic"; // Українська, тощо
    }

    // Перевірка на латиницю (англійська, німецька, французька, іспанська з діакритикою)
    if (/^[a-zà-öø-ÿā-žßäöüñéèàçíó]+$/i.test(cleanWord)) {
        return "latin"; // Англійська, Німецька, Французька, Іспанська
    }

    return "unknown";
}


function segmentTextByScript(text) {
    const words = text.split(/(\s+)/); // зберігаємо пробіли для точного відновлення фраз
    const segments = [];
    let currentSegment = null;

    for (const token of words) {
        if (!token.trim()) {
            // Якщо це просто пробіли, додаємо їх до поточного сегменту
            if (currentSegment) {
                currentSegment.text += token;
            }
            continue;
        }

        const alphabet = getWordScript(token);

        if (!currentSegment) {
            currentSegment = { alphabet: alphabet, text: token };
        } else if (currentSegment.alphabet === alphabet || alphabet === "punctuation") {
            // Пунктуацію приєднуємо до поточного активного сегменту
            currentSegment.text += token;
        } else {
            segments.push(currentSegment);
            currentSegment = { alphabet: alphabet, text: token };
        }
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

const MAIN_PROMPT = `
        You are an expert multilingual linguistic assistant.Your task is to analyze the provided text segment and perform grammar and vocabulary checks.

        Supported languages for verification: English, German, French, Spanish.

        Instructions:
            1. Determine the language of the input text segment.
            2. If the text is in English, German, French, or Spanish:
                - Scan for any real grammar, spelling, or vocabulary errors.
                - Ignore stylistic preferences, informal language, slang, contractions, capitalization (including proper nouns and abbreviations), or punctuation - only changes.
                - Do not correct proper names, usernames, URLs, code, commands, or quoted text.
            3. If there are errors, set "has_error" to true, and provide the "correction"(the fully corrected segment) and a short "explanation" in its original language.
            4. If the text is in another language(e.g., Ukrainian) or contains no errors, set "has_error" to false, with empty string values for other fields.

            Return strictly a JSON object matching the provided schema.No markdown wrapping.
`;

const PROMPT_SCHEMA = {
    type: "object",
    properties: {
        detected_language: { type: "string", description: "The ISO 2-letter language code of the detected segment (e.g. en, de, fr, es, uk)" },
        has_error: { type: "boolean" },
        specific_error: { type: "string", description: "A specific error that needs to be corrected in text segment in its original language, or empty if no error" },
        correction: { type: "string", description: "The corrected text segment in its original language, or empty if no error" },
        explanation: { type: "string", description: "A brief, clear explanation of the errors and recommendations written in its original language" }
    },
    required: ["detected_language", "has_error", "specific_error", "correction", "explanation"]
};


const GROUP_TEST_ID = -1004467291256;
const THREAD_TEST_ID = 121;
const GROUP_ID_proj = -1003927786565;
const THREAD_ID_proj = 2;



async function askGemini(text, apiKey) {
    const model = "gemini-3.6-flash"; // Cloudflare Workers чудово працює з цією моделлю
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            systemInstruction: {
                parts: [{ text: MAIN_PROMPT }]
            },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: PROMPT_SCHEMA
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    try {
        const rawText = data.candidates[0].content.parts[0].text;
        return JSON.parse(rawText);
    } catch (e) {
        throw new Error("Не вдалося розпарсити відповідь від Gemini: " + e.message);
    }
}


async function sendMessage(chatId, text, replyToMessageId, botToken) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
            reply_parameters: {
                message_id: replyToMessageId
            }
        })
    });

    const data = await response.json();
    if (!data.ok) {
        console.error("Помилка відправки в Telegram:", data.description);
    }
}



async function handleUpdate(update, env) {
    const message = update.message;

    if (!message || typeof message.text !== "string") {
        return;
    }

    // Перевірка тредів (залишається без змін)
    if (message.chat.id === GROUP_TEST_ID && message.message_thread_id !== THREAD_TEST_ID) {
        return;
    }
    if (message.chat.id === GROUP_ID_proj) {
        // if (message.chat.id === GROUP_ID_proj && message.message_thread_id !== THREAD_ID_proj) {
        return;
    }
    if (message.forward_origin) {
        return;
    }

    try {

        console.log(message.chat.id);
        console.log(message.message_id);
        console.log(message.message_thread_id);

        console.log(message.from.first_name);
        console.log(message.text);
        console.log("---");

        const geminiKey = env.GEMINI_API_KEY;
        const botToken = env.TELEGRAM_BOT_TOKEN;

        if (!geminiKey || !botToken) {
            console.error("Відсутні змінні оточення GEMINI_API_KEY або TELEGRAM_BOT_TOKEN");
            return;
        }

        // 1. Розбиваємо повідомлення на сегменти
        const segments = segmentTextByScript(message.text);

        // 2. Фільтруємо лише сегменти з латинським скриптом (англійська, німецька, французька, іспанська)
        const latinSegments = segments.filter(seg => seg.alphabet === "latin");

        // Якщо немає іншомовних сегментів, ігноруємо повідомлення
        if (latinSegments.length === 0) {
            return;
        }

        //Накопичення помилок
        const errors = [];
        // const enabledLanguages = ["en", "de", "fr", "es"];
        const enabledLanguages = ["en"];

        // 3. Перевіряємо кожен іншомовний сегмент окремо
        for (const segment of latinSegments) {
            const cleanSegmentText = segment.text.trim();

            // Ігноруємо занадто короткі сегменти (наприклад, 1-2 літери), які часто є абревіатурами або помилками
            if (cleanSegmentText.length < 3) {
                continue;
            }

            const answer = await askGemini(cleanSegmentText, geminiKey);
            console.log(`Аналіз сегменту "${cleanSegmentText}": `, JSON.stringify(answer));

            // Якщо виявлено помилку і мова входить до переліку підтримуваних



            if (answer.has_error && enabledLanguages.includes(answer.detected_language)) {
                errors.push({
                    language: answer.detected_language,
                    segment: cleanSegmentText,
                    specificError: answer.specific_error,
                    correction: answer.correction,
                    explanation: answer.explanation
                });
            }


        }

        // 5. Якщо помилок немає — нічого не відправляємо 
        if (errors.length === 0) {
            return;
        }

        // 6. Формуємо одне повідомлення з усіма помилками 
        let responseText = "";

        for (const error of errors) {
            responseText +=
                // `<b>[${error.language}]</b>\n` +
                // `Сегмент: <i>"${error.segment}"</i>\n\n` +
                // `Maybe you mean:\n` +
                `<b><s>${error.specificError}</s></b> ➩ <b>${error.correction}</b>`
            // + `✅ <i>${error.explanation}</i>\n\n` +
            // `────────────\n\n`;
        }

        // 7. Відправляємо ОДНУ відповідь 
        await sendMessage(
            message.chat.id,
            responseText,
            message.message_id,
            botToken
        );
    } catch (e) {
        console.error("Помилка під час обробки повідомлення:", e.message);
    }
}




// 4. Експорт обробника запитів Cloudflare Worker
export default {
    async fetch(request, env, ctx) {
        // Приймаємо лише POST запити (Telegram надсилає оновлення через POST)
        if (request.method !== "POST") {
            return new Response("Бот працює! Webhook активний.", {
                status: 200,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }

        try {
            // Парсимо JSON, який надіслав Telegram
            const update = await request.json();

            // Запускаємо асинхронну обробку повідомлення. 
            // Використовуємо ctx.waitUntil, щоб Worker не завершував роботу завчасно, 
            // поки відправляється запит до Gemini та Telegram.
            ctx.waitUntil(handleUpdate(update, env));

            // Миттєво повертаємо Telegram статус 200 OK, щоб уникнути повторного надсилання того ж повідомлення
            return new Response("OK", { status: 200 });
        } catch (err) {
            console.error("Помилка обробника вебхука:", err.message);
            return new Response("Internal Server Error", { status: 500 });
        }
    }


};


