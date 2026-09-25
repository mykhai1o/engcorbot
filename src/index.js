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


