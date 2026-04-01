// Vaqtinchalik Telegram login tokenlari (in-memory, 1 martalik, 5 daqiqa)
const tokens = new Map();

const TTL = 5 * 60 * 1000; // 5 daqiqa

function createToken(userId) {
  // 8 belgili random token
  const token = Math.random().toString(36).slice(2, 6).toUpperCase() +
                Math.random().toString(36).slice(2, 6).toUpperCase();
  tokens.set(token, { userId, expiresAt: Date.now() + TTL });
  return token;
}

function verifyToken(token) {
  const data = tokens.get(token);
  if (!data) return null;
  if (Date.now() > data.expiresAt) {
    tokens.delete(token);
    return null;
  }
  tokens.delete(token); // 1 martalik
  return data;
}

// Eskirgan tokenlarni tozalash (har 10 daqiqada)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokens.entries()) {
    if (now > val.expiresAt) tokens.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = { createToken, verifyToken };
