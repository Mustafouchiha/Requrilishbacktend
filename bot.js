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
        let user = await User.findOne({ phone });

        let appUrl;
        if (user) {
          // Mavjud foydalanuvchi — 1 martalik token bilan avtomatik kirish
          if (String(user.tg_chat_id) !== String(tgChatId)) {
            user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
          }
          const token = createToken(user.id);
          appUrl = `${MINI_APP_URL}?tgToken=${token}`;
        } else {
          // Yangi foydalanuvchi — Mini App ichida ro'yxatdan o'tish
          const tgUsername = ctx.from.username ? `@${ctx.from.username}` : '';
          const params = new URLSearchParams({
            phone,
            tgChatId: String(tgChatId),
            name: firstName,
            telegram: tgUsername,
            register: '1',
          });
          appUrl = `${MINI_APP_URL}?${params.toString()}`;
        }

        const isNew = !user;
        await ctx.reply(
          isNew
            ? `Salom, ${firstName}! 👋\n\nSiz yangi foydalanuvchisiz.\nQuyidagi tugmani bosib ro'yxatdan o'ting:`
            : `Salom, ${firstName}! ✅\n\nQuyidagi tugmani bosib saytga kiring.\n⏱ Havola 5 daqiqa amal qiladi:`,
          {
            reply_markup: {
              inline_keyboard: [[
                {
                  text: isNew ? '📝 Ro\'yxatdan o\'tish' : '🚀 Saytga kirish',
                  web_app: { url: appUrl },
                },
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
