const { Telegraf } = require('telegraf');

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://frontend-353d.vercel.app/';

let bot = null;

function getBot() {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    bot.command('start', (ctx) => {
      const firstName = ctx.from.first_name;
      ctx.reply(
        `Salom, ${firstName}! 👋`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '🚀 Mini Appga kirish',
                web_app: { url: MINI_APP_URL },
              },
            ]],
          },
        }
      );
    });

    bot.launch();
    console.log('🤖 Telegram bot ishga tushdi');
  }
  return bot;
}

// Foydalanuvchiga Telegram orqali xabar yuborish
async function notifyUser(tgChatId, text, extra = {}) {
  const b = getBot();
  if (!b || !tgChatId) return;
  try {
    await b.telegram.sendMessage(tgChatId, text, extra);
  } catch (e) {
    console.error('Bot xabar yuborishda xato:', e.message);
  }
}

module.exports = { getBot, notifyUser };
