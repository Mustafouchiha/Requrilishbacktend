const { Telegraf } = require("telegraf");
const User = require("./models/User");
const { createToken } = require("./tgTokens");

const MINI_APP_URL = () => process.env.MINI_APP_URL || "https://requrilish.vercel.app/";
const OPERATOR_PHONES = ["331350206"];

let bot = null;

function getBot() {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    bot.command("start", async (ctx) => {
      const tgChatId = ctx.from.id;
      const firstName = ctx.from.first_name || "";

      try {
        const existingUser = await User.findByTgChatId(tgChatId);
        if (existingUser) {
          const token = createToken(existingUser.id);
          const appUrl = `${MINI_APP_URL()}?tgToken=${token}`;
          return ctx.reply(
            `Salom, ${firstName}! ✅ Xush kelibsiz!\n\nQuyidagi tugmani bosib kiring:`,
            {
              reply_markup: {
                inline_keyboard: [[
                  { text: "🏗 ReQurilish'ga kirish", web_app: { url: appUrl } },
                ]],
              },
            }
          );
        }
      } catch { /* silent */ }

      ctx.reply(
        `Salom! 👋 *ReQurilish*'ga xush kelibsiz!\n\nQurilish materiallari bozori.\n\nKirish uchun telefon raqamingizni yuboring:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[
              { text: "📱 Telefon yuborish", request_contact: true },
            ]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    });

    bot.on("contact", async (ctx) => {
      const firstName = ctx.from.first_name || "";
      const tgChatId = ctx.from.id;
      const rawPhone = ctx.message.contact.phone_number.replace(/\D/g, "");
      const phone = rawPhone.startsWith("998") ? rawPhone.slice(3) : rawPhone;

      try {
        let user = await User.findOne({ phone });
        let appUrl;

        if (user) {
          if (String(user.tg_chat_id) !== String(tgChatId)) {
            user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
          }
          const token = createToken(user.id);
          appUrl = `${MINI_APP_URL()}?tgToken=${token}`;
        } else {
          const tgUsername = ctx.from.username ? `@${ctx.from.username}` : "";
          const params = new URLSearchParams({
            phone,
            tgChatId: String(tgChatId),
            name: firstName,
            telegram: tgUsername,
            register: "1",
          });
          appUrl = `${MINI_APP_URL()}?${params.toString()}`;
        }

        const isNew = !user;
        await ctx.reply(
          isNew
            ? `Salom, ${firstName}! 👋\n\nSiz yangi foydalanuvchisiz.\nQuyidagi tugmani bosing:`
            : `Salom, ${firstName}! ✅\n\nQuyidagi tugmani bosib kiring:`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "🏗 ReQurilish'ga kirish", web_app: { url: appUrl } },
              ]],
            },
          }
        );
      } catch (e) {
        console.error("Bot contact handler xatosi:", e.message);
        ctx.reply("Xatolik yuz berdi. /start bosing.");
      }
    });

    bot.launch()
      .then(() => console.log("🤖 ReQurilish bot ishga tushdi"))
      .catch(err => console.error("❌ Bot launch xatosi:", err.message));
  }
  return bot;
}

async function notifyUser(tgChatId, text, extra = {}) {
  const b = getBot();
  if (!b || !tgChatId) return;
  try {
    await b.telegram.sendMessage(tgChatId, text, { parse_mode: "Markdown", ...extra });
  } catch (e) {
    console.error("Bot xabar yuborishda xato:", e.message);
  }
}

// Barcha operatorlarga xabar yuborish
async function notifyOperator(text) {
  const b = getBot();
  if (!b) return;
  try {
    const { query } = require("./db");
    const { rows } = await query(
      "SELECT tg_chat_id FROM users WHERE phone = ANY($1) AND tg_chat_id IS NOT NULL",
      [OPERATOR_PHONES]
    );
    for (const row of rows) {
      await notifyUser(row.tg_chat_id, text).catch(() => {});
    }
  } catch (e) {
    console.error("notifyOperator xatosi:", e.message);
  }
}

module.exports = { getBot, notifyUser, notifyOperator };
