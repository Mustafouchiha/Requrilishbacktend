const { Pool } = require("pg");

let pool;
let _tablesReady = null;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL .env da topilmadi");
    pool = new Pool({
      connectionString: url,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

function ensureTables() {
  if (!_tablesReady) {
    _tablesReady = initTables(getPool()).catch((err) => {
      _tablesReady = null;
      throw err;
    });
  }
  return _tablesReady;
}

async function connect() {
  await ensureTables();
  return getPool();
}

async function query(text, params) {
  await ensureTables();
  return getPool().query(text, params);
}

async function initTables(p) {
  await p.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        VARCHAR(255) NOT NULL,
      phone       VARCHAR(50)  NOT NULL UNIQUE,
      telegram    VARCHAR(255) DEFAULT '',
      avatar      TEXT,
      balance     NUMERIC      NOT NULL DEFAULT 0,
      tg_chat_id  BIGINT,
      is_blocked  BOOLEAN      DEFAULT FALSE,
      role        VARCHAR(50)  DEFAULT 'user',
      joined      TIMESTAMPTZ  DEFAULT NOW(),
      created_at  TIMESTAMPTZ  DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  DEFAULT NOW()
    );

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tg_chat_id') THEN
        ALTER TABLE users ADD COLUMN tg_chat_id BIGINT;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_blocked') THEN
        ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='balance') THEN
        ALTER TABLE users ADD COLUMN balance NUMERIC NOT NULL DEFAULT 0;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS products (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name             VARCHAR(255) NOT NULL,
      category         VARCHAR(50)  NOT NULL DEFAULT 'boshqa',
      price            NUMERIC      NOT NULL,
      unit             VARCHAR(50)  NOT NULL DEFAULT 'dona',
      qty              INTEGER      NOT NULL,
      condition        VARCHAR(50)  DEFAULT 'Yaxshi',
      viloyat          VARCHAR(255) NOT NULL,
      tuman            VARCHAR(255) DEFAULT '',
      photo            TEXT,
      photos           TEXT,
      owner_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
      status           VARCHAR(30)  DEFAULT 'active',
      approved_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
      rejected_reason  TEXT,
      is_active        BOOLEAN      DEFAULT TRUE,
      created_at       TIMESTAMPTZ  DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  DEFAULT NOW()
    );

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='photos') THEN
        ALTER TABLE products ADD COLUMN photos TEXT;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='status') THEN
        ALTER TABLE products ADD COLUMN status VARCHAR(30) DEFAULT 'active';
        UPDATE products SET status = CASE WHEN is_active THEN 'active' ELSE 'deleted' END;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='approved_by') THEN
        ALTER TABLE products ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='rejected_reason') THEN
        ALTER TABLE products ADD COLUMN rejected_reason TEXT;
      END IF;
    END $$;
    DO $$ BEGIN
      ALTER TABLE products ALTER COLUMN owner_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS offers (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id  UUID        REFERENCES products(id) ON DELETE SET NULL,
      buyer_id    UUID        NOT NULL REFERENCES users(id),
      seller_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
      status      VARCHAR(50) DEFAULT 'pending',
      message     TEXT        DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      offer_id     UUID        NOT NULL UNIQUE REFERENCES offers(id),
      buyer_id     UUID        NOT NULL REFERENCES users(id),
      seller_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
      product_id   UUID        REFERENCES products(id) ON DELETE SET NULL,
      amount       NUMERIC     NOT NULL,
      status       VARCHAR(50) DEFAULT 'pending',
      card_from    VARCHAR(50),
      card_to      VARCHAR(50) NOT NULL,
      note         TEXT,
      confirmed_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payment_locks (
      offer_id  VARCHAR(100) PRIMARY KEY,
      locked_at TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_status     ON products (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_products_owner      ON products (owner_id);
    CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);
    CREATE INDEX IF NOT EXISTS idx_offers_buyer        ON offers (buyer_id);
    CREATE INDEX IF NOT EXISTS idx_offers_seller       ON offers (seller_id);
  `);
}

module.exports = { connect, query };
