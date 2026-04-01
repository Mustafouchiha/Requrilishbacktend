const { Telegraf } = require('telegraf');
const User = require('./models/User');
const { createToken } = require('./tgTokens');

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://frontend-353d.vercel.app/';

let bot = null;

function getBot() {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    bot.command('start', (ctx) => {
      ctx.reply(
        `Salom! 👋 ReMarket'ga xush kelibsiz!\n\nKirish yoki ro'yxatdan o'tish uchun telefon raqamingizni yuboring:`,
        {
          reply_markup: {
            keyboard: [[
              { text: '📱 Telefon raqamni yuborish', request_contact: true },
            ]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    });

    bot.on('contact', async (ctx) => {
      const firstName = ctx.from.first_name || '';
      const tgChatId = ctx.from.id;
      // Raqamdan + va bo'shliqlarni olib tashlash
      const rawPhone = ctx.message.contact.phone_number.replace(/\D/g, '');
      // 998XXXXXXXXX → XXXXXXXXX (9 ta raqam)
      const phone = rawPhone.startsWith('998') ? rawPhone.slice(3) : rawPhone;

      try {
        // Foydalanuvchini topish yoki yaratish
        let user = await User.findOne({ phone });
        if (!user) {
          const tgUsername = ctx.from.username ? `@${ctx.from.username}` : '';
          user = await User.create({ name: firstName, phone, telegram: tgUsername });
        }

        // tg_chat_id ni saqlash/yangilash
        if (String(user.tg_chat_id) !== String(tgChatId)) {
          user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
        }

        // 1 martalik login token (5 daqiqa amal qiladi)
        const token = createToken(user.id);
        const loginUrl = `${MINI_APP_URL}?tgToken=${token}`;

        await ctx.reply(
          `Salom, ${firstName}! ✅\n\nQuyidagi tugma orqali saytga kiring.\n⏱ Havola 5 daqiqa amal qiladi:`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Saytga kirish', url: loginUrl },
              ]],
            },
          }
        );
      } catch (e) {
        console.error('Bot contact handler xatosi:', e.message);
        ctx.reply('Xatolik yuz berdi. Qaytadan urinib ko\'ring yoki /start bosing.');
      }
    });

    bot.launch()
      .then(() => console.log('🤖 Telegram bot ishga tushdi'))
      .catch(err => console.error('❌ Bot launch xatosi:', err.message));
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
