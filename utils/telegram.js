const TG_BASE = "https://api.telegram.org";

async function sendTg(chatId, text, extra = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
  if (!chatId) throw new Error("chatId yo'q");

  const body = JSON.stringify({
    chat_id: String(chatId),
    text,
    parse_mode: "Markdown",
    ...extra,
  });

  const res = await fetch(`${TG_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "Telegram API xatosi");
  return data.result;
}

module.exports = { sendTg };
