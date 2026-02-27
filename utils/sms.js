// ─── eskiz.uz SMS yuboruvchi ──────────────────────────────────────
// Agar ESKIZ_EMAIL/PASSWORD .env da bo'lsa — haqiqiy SMS yuboradi
// Aks holda console.log da ko'rsatadi

const ESKIZ_BASE = "https://notify.eskiz.uz/api";

let _token = null;
let _tokenExpires = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpires) return _token;

  const res = await fetch(`${ESKIZ_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email:    process.env.ESKIZ_EMAIL,
      password: process.env.ESKIZ_PASSWORD,
    }),
  });

  if (!res.ok) throw new Error("eskiz.uz login xatosi");
  const data = await res.json();
  _token        = data.data?.token;
  _tokenExpires = Date.now() + 28 * 60 * 1000; // 28 daqiqa
  return _token;
}

/**
 * SMS yuboradi.
 * @param {string} phone  — "+998XXXXXXXXX" formatida
 * @param {string} text   — SMS matni
 */
async function sendSMS(phone, text) {
  // Eskiz credentials sozlanmagan — faqat console da ko'rsatamiz
  if (
    !process.env.ESKIZ_EMAIL ||
    process.env.ESKIZ_EMAIL === "your@email.com"
  ) {
    console.log(`\n📱 SMS (console rejim) ───────────`);
    console.log(`   Telefon : ${phone}`);
    console.log(`   Matn    : ${text}`);
    console.log(`─────────────────────────────────\n`);
    return { ok: true, mode: "console" };
  }
  // console.log(`   Matn    : ${text}`)
  // Haqiqiy SMS — eskiz.uz API
  const token = await getToken();
  const mobile = phone.replace(/\D/g, ""); // faqat raqamlar

  const res = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      mobile_phone: mobile,
      message:      text,
      from:         process.env.SMS_FROM || "2580",
      callback_url: "",
    }),
  });

  const data = await res.json();
  if (data.status === "waiting") {
    console.log(`✅ SMS yuborildi → ${phone}`);
    return { ok: true, mode: "sms" };
  }

  throw new Error(data.message || "SMS yuborishda xatolik");
}

module.exports = { sendSMS };
