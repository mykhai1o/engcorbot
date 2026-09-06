# Simple Telegram English Grammar Bot

A lightweight Telegram bot built on **Cloudflare Workers** that automatically checks and corrects English grammar using **Google Gemini AI**.

---

## How It Works
- The bot listens to messages in Telegram groups or chats.
- If a message is written in English and contains mistakes, the bot replies with the **correction** and a **short explanation**.
- It ignores typos like capitalization, punctuation, slang, or mixed languages.

---

## Quick Start (Local Setup)

### 1. Install dependencies
```bash
npm install
```

### 2. Set up your API Keys
Create a file named `.dev.vars` in the root folder and add your tokens:
```env
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
GEMINI_API_KEY="your_gemini_api_key"
```

### 3. Run locally
```bash
npm run dev
```

---

## Deployment (Put it Online)

### 1. Deploy to Cloudflare Workers
```bash
npm run deploy
```

### 2. Save your API Keys online
Run these commands in your terminal to save your tokens securely on Cloudflare:
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
```

### 3. Connect the Bot to your Worker (Webhook)
Open your web browser and go to this link (replace with your real tokens and URL):
```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_URL>.workers.dev
```

---

## Run Tests
```bash
npm run test
```
