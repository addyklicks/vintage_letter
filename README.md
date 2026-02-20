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

## Edit Letter Content

- Update only `letter-content.html` for your main letter text.
- `index.html` loads this file automatically into the letter section.

## Hosting Notes

- OTP requires a running backend (`server.js`). Static-only hosting (for example plain GitHub Pages) cannot send OTP by itself.
- If frontend and backend are on different domains, set this before the main app script in `index.html`:

```html
<script>
  window.VINTAGE_API_BASE = "https://your-backend-domain.com";
</script>
```
- Then ensure your backend allows CORS from your frontend domain.

## Troubleshooting

- If you see: `Backend did not return JSON` or `returned HTML, not JSON`
  - Your frontend is likely calling the wrong API origin (for example `github.io/api/...`).
  - Set `window.VINTAGE_API_BASE` to your deployed backend URL.
  - Confirm `https://your-backend-domain.com/api/health` returns JSON.
  - Hard refresh after deployment to clear cached JS.

## API Endpoints

- `GET /api/health`
- `GET /api/bot/chat-id`
- `POST /api/request-otp`
- `POST /api/verify-telegram-otp`

## Notes

- OTPs are stored in-memory and expire after `OTP_TTL_MS`.
- This is suitable for small/private usage. For production, use Redis/DB and proper rate limiting.
