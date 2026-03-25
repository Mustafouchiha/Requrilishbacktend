const TelegramBot = require('node-telegram-bot-api');

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://frontend-353d.vercel.app/';

let bot = null;

function getBot() {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name;

      bot.sendMessage(
        chatId,
        `Salom, ${firstName}! 👋\n\nQuyidagi tugmani bosib ilovaga kiring:`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '🚀 Ilovani ochish',
                web_app: { url: MINI_APP_URL },
              },
            ]],
          },
        }
      );
    });

    console.log('🤖 Telegram bot ishga tushdi');
  }
  return bot;
}

// Foydalanuvchiga Telegram orqali xabar yuborish
async function notifyUser(tgChatId, text, extra = {}) {
  const b = getBot();
  if (!b || !tgChatId) return;
  try {
    await b.sendMessage(tgChatId, text, extra);
  } catch (e) {
    console.error('Bot xabar yuborishda xato:', e.message);
  }
}

module.exports = { getBot, notifyUser };
