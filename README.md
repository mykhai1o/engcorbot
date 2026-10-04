# Telegram Grammar Bot

Telegram-бот на Cloudflare Workers + Google Gemini для автоматичного виправлення англійської граматики.

Чатбот потрібно додати до потрібної групи чи чату в Telegram, після чого він почне перевіряти повідомлення відправлені в групу.

---

## 🚀 Швидкий старт

1. **Встановіть залежності**:
   ```bash
   npm install
   ```
2. **Створіть файл `.dev.vars`** у корені:
   ```env
   TELEGRAM_BOT_TOKEN="ваш_токен_від_BotFather"
   GEMINI_API_KEY="ваш_ключ_від_Google_AI_Studio"
   ```
3. **Локальний запуск**:
   ```bash
   npm run dev
   ```

---

## ⚙️ Важливо в `src/index.js`
- **Фільтр чатів**: Закоментуйте константи `GROUP_TEST_ID` та `GROUP_ID_proj`, якщо бот використовуватиметься не в авторських групах.
- **Модель AI**: Переконайтеся, що вказана актуальна модель (наприклад, `gemini-2.0-flash`).
- **Групи**: Увімкніть доступ бота до повідомлень у `@BotFather` (`/mybots` → **Group Privacy** → **Turn off**).

---

## ☁️ Деплой на Cloudflare

1. Авторизуйтесь:
   ```bash
   npx wrangler login
   ```
2. Опублікуйте воркер:
   ```bash
   npm run deploy
   ```
3. Додайте секрети:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put GEMINI_API_KEY
   ```
4. Підключіть вебхук (відкрийте у браузері):
   ```text
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>
   ```

---

## 🔍 Корисні команди
- **Логи в реальному часі**: `npx wrangler tail`
- **Статус вебхука**: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- **Видалення вебхука**: `https://api.telegram.org/bot<TOKEN>/deleteWebhook`
