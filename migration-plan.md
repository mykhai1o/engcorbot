# План переходу на сучасні інструменти (grammY + Gemini SDK)

Цей документ містить покроковий план міграції нашого Telegram-бота з сирих HTTP-запитів (`fetch`) на професійний стек технологій: **grammY** для роботи з Telegram API та офіційний **Gemini SDK** для штучного інтелекту.

---

## Крок 1. Встановлення необхідних бібліотек через npm

У корені проєкту виконайте наступну команду:

```bash
npm install grammy @google/genai
```

Також для спрощення локального тестування вебхуків рекомендується встановити `localtunnel` як dev-залежність:

```bash
npm install -D localtunnel
```

---

## Крок 2. Структура оновленого `src/index.js`

Новий варіант `src/index.js` буде значно простішим, безпечнішим та структурованішим. Замість ручного парсингу об'єктів запитів, ми передаємо керування бібліотеці `grammy`.

Ось концептуальний приклад оновленого коду:

```javascript
import { Bot, webhookCallback } from "grammy";
import { GoogleGenAI, Type } from "@google/genai";

// 1. Системні інструкції та схеми для Gemini (імпортуємо чи залишаємо константи)
const MAIN_PROMPT = `
    Correct English grammar and vocabulary.
    ... (весь ваш поточний промпт) ...
`;

const PROMPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    has_error: { type: Type.BOOLEAN },
    correction: { type: Type.STRING },
    explanation: { type: Type.STRING }
  },
  required: ["has_error", "correction", "explanation"]
};

// 2. Експортуємо стандартний обробник Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    // Перевіряємо наявність секретів
    if (!env.TELEGRAM_BOT_TOKEN || !env.GEMINI_API_KEY) {
      return new Response("Missing configuration secrets", { status: 500 });
    }

    // Ініціалізуємо бота та AI SDK всередині fetch для доступу до env
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    // Описуємо бізнес-логіку бота через API grammY
    bot.on("message:text", async (context) => {
      const text = context.message.text;

      // Логіка фільтрації мови (наприклад, ваша функція analyzeWords)
      // ...

      try {
        // Запит до Gemini через SDK
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: text,
          config: {
            systemInstruction: MAIN_PROMPT,
            responseMimeType: "application/json",
            responseSchema: PROMPT_SCHEMA
          }
        });

        const result = JSON.parse(response.text);

        if (result.has_error) {
          await context.reply(`❌ Помилка!\n\nВиправлено: ${result.correction}\nПояснення: ${result.explanation}`, {
            reply_to_message_id: context.message.message_id
          });
        }
      } catch (error) {
        console.error("Помилка обробки запиту:", error);
      }
    });

    // Повертаємо колбек для обробки вебхуків Cloudflare
    return webhookCallback(bot, "cloudflare-workers")(request);
  }
};
```

---

## Крок 3. Налаштування локального тестування вебхуків (без деплою)

Це революційно змінить швидкість вашої розробки. Ви зможете бачити помилки та тестувати бота прямо на вашому комп'ютері.

### Покрокова інструкція для тестування:

1. **Запустіть локальний сервер wrangler:**
   ```bash
   npm run dev
   ```
   *Wrangler запуститься за замовчуванням на порту `8787`.*

2. **Запустіть локальний тунель в іншому вікні терміналу:**
   ```bash
   npx lt --port 8787
   ```
   *Ви отримаєте посилання, наприклад: `https://your-unique-subdomain.loca.lt`*

3. **Зареєструйте це тимчасове посилання у Telegram як вебхук:**
   Перейдіть за посиланням у браузері (замінивши токен і адресу тунелю):
   ```text
   https://api.telegram.org/bot<ВАШ_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-unique-subdomain.loca.lt
   ```
   *(Ви маєте побачити відповідь `{"ok":true,"result":true,"description":"Webhook was set"}`)*

4. **Тестуйте локально!**
   Пишіть вашому боту в Telegram. Всі запити будуть приходити на ваш комп'ютер. Змінюйте код у `src/index.js`, зберігайте — і зміни миттєво застосовуватимуться без деплою!

---

## Крок 4. Фінальний деплой у Cloudflare

Коли все перевірено локально та працює стабільно:

1. **Задеплойте фінальну версію:**
   ```bash
   npm run deploy
   ```
   *Ви отримаєте фінальне посилання на ваш Worker, наприклад: `https://telegram-bot-worker.username.workers.dev`*

2. **Перемкніть вебхук Telegram на бойову адресу:**
   ```text
   https://api.telegram.org/bot<ВАШ_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://telegram-bot-worker.username.workers.dev
   ```

---

## Переваги після переходу
- **Безпека:** grammY автоматично валідує запити від Telegram та обробляє edge-випадки.
- **Швидкість розробки:** Більше не потрібно завантажувати зміни в хмару щоразу, коли ви хочете протестувати виправлення одного слова.
- **Лаконічність:** SDK самостійно будує складний JSON-пакет для генерації контенту з потрібною схемою та конфігурацією.
