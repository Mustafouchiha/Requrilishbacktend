const TelegramBot = require('node-telegram-bot-api');

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://frontend-353d.vercel.app/';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

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

module.exports = bot;
