const { query } = require("../db");

const Payment = {
  async findByOfferId(offer_id) {
    const { rows } = await query(
      "SELECT * FROM payments WHERE offer_id=$1 LIMIT 1",
      [offer_id]
    );
    return rows[0] || null;
  },

  async create({ offer_id, buyer_id, seller_id, product_id, amount, card_from, card_to, note }) {
    const { rows } = await query(
      `INSERT INTO payments
         (offer_id, buyer_id, seller_id, product_id, amount, card_from, card_to, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [offer_id, buyer_id, seller_id, product_id, amount, card_from || null, card_to, note || null]
    );
    return rows[0];
  },

  async updatePending(offer_id, { card_from, note }) {
    const { rows } = await query(
      `UPDATE payments
       SET card_from=$1, note=$2, status='pending', updated_at=NOW()
       WHERE offer_id=$3 RETURNING *`,
      [card_from || null, note || null, offer_id]
    );
    return rows[0] || null;
  },

  async confirm(offer_id) {
    const { rows } = await query(
      `UPDATE payments
       SET status='confirmed', confirmed_at=NOW(), updated_at=NOW()
       WHERE offer_id=$1 RETURNING *`,
      [offer_id]
    );
    return rows[0] || null;
  },

  async findByUser(user_id) {
    const { rows } = await query(
      `SELECT * FROM payments
       WHERE buyer_id=$1 OR seller_id=$1
       ORDER BY created_at DESC`,
      [user_id]
    );
    return rows;
  },
};

module.exports = Payment;
