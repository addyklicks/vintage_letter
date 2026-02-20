# Vintage OTP Letter App

Single-page vintage letter UI with Telegram OTP verification.

## Prerequisites

- Node.js 18+
- Telegram bot token from BotFather
- Send `/start` to your bot at least once from your account

## Setup

```bash
cd vintage-otp-letter-app
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Set:

- `TG_BOT_TOKEN` (or `TELEGRAM_BOT_TOKEN`)
- Optional: `TELEGRAM_CHAT_ID` (if omitted, the backend auto-detects latest chat from `getUpdates`)

## Run

```bash
npm start
```

Open:

- `http://localhost:3000`

## API Endpoints

- `GET /api/health`
- `GET /api/bot/chat-id`
- `POST /api/request-otp`
- `POST /api/verify-telegram-otp`

## Notes

- OTPs are stored in-memory and expire after `OTP_TTL_MS`.
- This is suitable for small/private usage. For production, use Redis/DB and proper rate limiting.
