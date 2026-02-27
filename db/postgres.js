const { Pool } = require("pg");

// PostgreSQL connection pool (Neon.tech yoki Supabase bepul tier uchun)
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Payments jadvalini avtomatik yaratish
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id          SERIAL PRIMARY KEY,
        offer_id    VARCHAR(255) NOT NULL UNIQUE,
        buyer_id    VARCHAR(255) NOT NULL,
        seller_id   VARCHAR(255) NOT NULL,
        product_id  VARCHAR(255) NOT NULL,
        amount      NUMERIC(14,2) NOT NULL,
        status      VARCHAR(50) DEFAULT 'pending',
        card_from   VARCHAR(50),
        card_to     VARCHAR(50),
        note        TEXT,
        confirmed_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✅ PostgreSQL payments jadvali tayyor");
  } catch (err) {
    console.error("❌ PostgreSQL init xatosi:", err.message);
  }
};

module.exports = { pool, initDB };
