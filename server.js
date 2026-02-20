const crypto = require("crypto");
const path = require("path");

const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN || "").trim();
const FIXED_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 300000);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const TELEGRAM_API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : "";

const otpSessions = new Map();
let cachedChatId = FIXED_CHAT_ID;
let cachedBotUserId = "";

app.use(express.json());
app.use(express.static(__dirname));

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function validateBotToken() {
  return BOT_TOKEN.length > 0;
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, entry] of otpSessions.entries()) {
    if (entry.expiresAt <= now) {
      otpSessions.delete(sessionId);
    }
  }
}

setInterval(cleanExpiredSessions, 60000).unref();

async function telegramGet(method) {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`);
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram API GET call failed");
  }

  return data.result;
}

async function telegramPost(method, payload) {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram API POST call failed");
  }

  return data.result;
}

async function getBotUserId() {
  if (cachedBotUserId) {
    return cachedBotUserId;
  }

  const botInfo = await telegramGet("getMe");
  if (botInfo?.id !== undefined && botInfo?.id !== null) {
    cachedBotUserId = String(botInfo.id);
  }

  return cachedBotUserId;
}

async function assertNotBotChatId(chatId) {
  const botUserId = await getBotUserId();
  if (botUserId && String(chatId) === botUserId) {
    throw new Error("TELEGRAM_CHAT_ID is set to the bot's own ID. Use your personal Telegram chat ID instead.");
  }
}

async function resolveChatId() {
  if (FIXED_CHAT_ID) {
    await assertNotBotChatId(FIXED_CHAT_ID);
    return FIXED_CHAT_ID;
  }

  if (cachedChatId) {
    return cachedChatId;
  }

  const updates = await telegramGet("getUpdates");

  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const update = updates[i];
    const messageFrom = update?.message?.from;
    const editedMessageFrom = update?.edited_message?.from;
    const callbackFrom = update?.callback_query?.from;
    const isFromBot = Boolean(messageFrom?.is_bot || editedMessageFrom?.is_bot || callbackFrom?.is_bot);
    if (isFromBot) {
      continue;
    }

    const chatId =
      update?.message?.chat?.id ||
      update?.edited_message?.chat?.id ||
      update?.callback_query?.message?.chat?.id;

    if (chatId !== undefined && chatId !== null) {
      const resolvedChatId = String(chatId);
      await assertNotBotChatId(resolvedChatId);
      cachedChatId = resolvedChatId;
      return cachedChatId;
    }
  }

  throw new Error("No Telegram chat found. Send /start to your bot first, then request OTP again.");
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    tokenConfigured: validateBotToken(),
    fixedChatConfigured: Boolean(FIXED_CHAT_ID)
  });
});

app.get("/api/bot/chat-id", async (_req, res) => {
  if (!validateBotToken()) {
    return res.status(500).json({
      ok: false,
      message: "Bot token missing. Set TG_BOT_TOKEN or TELEGRAM_BOT_TOKEN in .env"
    });
  }

  try {
    const chatId = await resolveChatId();
    return res.json({ ok: true, chatId });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message });
  }
});

app.post("/api/request-otp", async (req, res) => {
  if (!validateBotToken()) {
    return res.status(500).json({
      ok: false,
      message: "Bot token missing. Set TG_BOT_TOKEN or TELEGRAM_BOT_TOKEN in .env"
    });
  }

  try {
    const bodyChatId = typeof req.body?.chatId === "string" ? req.body.chatId.trim() : "";
    if (bodyChatId) {
      await assertNotBotChatId(bodyChatId);
    }
    const chatId = bodyChatId || (await resolveChatId());
    const otp = generateOtp();
    const sessionId = crypto.randomUUID();

    otpSessions.set(sessionId, {
      chatId,
      otpHash: hash(otp),
      attempts: 0,
      expiresAt: Date.now() + OTP_TTL_MS
    });

    const minutes = Math.ceil(OTP_TTL_MS / 60000);
    await telegramPost("sendMessage", {
      chat_id: chatId,
      text: `Your Sealed Letter OTP is: ${otp}\nThis code expires in ${minutes} minute(s).`
    });

    return res.json({
      ok: true,
      sessionId,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      message: "OTP sent to your Telegram chat."
    });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message });
  }
});

app.post("/api/verify-telegram-otp", (req, res) => {
  const code = String(req.body?.code || "").trim();
  const sessionId = String(req.body?.sessionId || "").trim();

  if (!sessionId) {
    return res.status(400).json({ valid: false, message: "Missing sessionId. Request a new OTP first." });
  }

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ valid: false, message: "OTP must be exactly 6 digits." });
  }

  const session = otpSessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ valid: false, message: "OTP session not found. Request a new OTP." });
  }

  if (Date.now() > session.expiresAt) {
    otpSessions.delete(sessionId);
    return res.status(400).json({ valid: false, message: "OTP expired. Request a new code." });
  }

  if (session.attempts >= OTP_MAX_ATTEMPTS) {
    otpSessions.delete(sessionId);
    return res.status(429).json({ valid: false, message: "Too many attempts. Request a new OTP." });
  }

  if (session.otpHash !== hash(code)) {
    session.attempts += 1;
    otpSessions.set(sessionId, session);
    return res.status(401).json({ valid: false, message: "Invalid OTP." });
  }

  otpSessions.delete(sessionId);
  return res.json({ valid: true, message: "OTP verified." });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, message: "API route not found" });
  }

  return res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Vintage OTP app running on http://localhost:${PORT}`);
});
