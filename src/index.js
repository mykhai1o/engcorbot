/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */


const MAIN_PROMPT = `
        Correct English grammar and vocabulary.
        Ignore other languages.
        Only analyze messages written entirely in English.
        If a message contains words or phrases from another language, ignore the entire message.
        Do not translate or analyze mixed-language messages.

        Don't correct and don't perceive as a mistake:
        - punctuation
        - capitalization
        - texting style
        - slang
        - abbreviations
        - contractions
        - informal language

        Only report real grammar or vocabulary errors.
        Do not correct proper names, usernames, URLs, code, commands, or quoted text.
        Use simple words for explanation
`;

const PROMPT_SCHEMA = {
	type: "object",
	properties: {
		has_error: { type: "boolean" },
		correction: { type: "string" },
		explanation: { type: "string" }
	},
	required: ["has_error", "correction", "explanation"]
};

const GROUP_TEST_ID = -1004467291256;
const THREAD_TEST_ID = 121;
const GROUP_ID_proj = -1003927786565;
const THREAD_ID_proj = 2;
// const ALLOWED_PROJECT_THREAD_ID = ;

// 1. Функція для прямого виклику Gemini API без важких бібліотек
async function askGemini(text, apiKey) {
	const model = "gemini-3.1-flash-lite"; // Cloudflare Workers чудово працює з цією моделлю
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

// 2. Функція надсилання повідомлення в Telegram
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

// 3. Обробник вхідного вебхука від Telegram
async function handleUpdate(update, env) {
	const message = update.message;

	// Базові перевірки (як у вашому старому bot.js)
	if (!message || typeof message.text !== "string" || !/[a-zA-Z]/.test(message.text)) {
		return;
	}

	// Testing test thread
	if (message.chat.id === GROUP_TEST_ID && message.message_thread_id !== THREAD_TEST_ID) {
		console.log("Whong thread!")
		return;
	}
	// Testing proj thread
	if (message.chat.id === GROUP_ID_proj && message.message_thread_id !== THREAD_ID_proj) {
		console.log("Whong thread!")
		return;
	}

	if (message.forward_origin) {
		return;
	}



	try {

		console.log(message.chat.id);
		console.log(message.message_id);
		console.log(message.message_thread_id);
		console.log(message.from.language_code);
		console.log(message.from.first_name);
		console.log(message.text);
		console.log("---");

		// Отримуємо ключі з env (Cloudflare Workers автоматично прокидає їх у об'єкт env)

		const geminiKey = env.GEMINI_API_KEY;
		const botToken = env.TELEGRAM_BOT_TOKEN;

		if (!geminiKey || !botToken) {
			console.error("Відсутні змінні оточення GEMINI_API_KEY або TELEGRAM_BOT_TOKEN");
			return;
		}

		const answer = await askGemini(message.text, geminiKey);
		console.log("Відповідь Gemini:", JSON.stringify(answer));

		if (answer.has_error) {
			await sendMessage(
				message.chat.id,
				`Maybe you mean:\n\n✅ <b>${answer.correction}</b>\n\n📝 <i>${answer.explanation}</i>`,
				message.message_id,
				botToken
			);

			console.log("___________");
		}
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




// export default {
// 	async fetch(request, env, ctx) {
// 		return new Response("Hello World!");
// 	},
// };
