const { query } = require("../db");

const Offer = {
  async create({ product_id, buyer_id, seller_id, message = "" }) {
    const { rows } = await query(
      `INSERT INTO offers (product_id, buyer_id, seller_id, message)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [product_id, buyer_id, seller_id, message]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT o.*,
              p.name AS product_name, p.price AS product_price, p.unit AS product_unit,
              b.name AS buyer_name, b.phone AS buyer_phone, b.telegram AS buyer_telegram,
              s.name AS seller_name, s.phone AS seller_phone
       FROM offers o
       JOIN products p ON p.id = o.product_id
       JOIN users b ON b.id = o.buyer_id
       JOIN users s ON s.id = o.seller_id
       WHERE o.id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findOne({ product_id, buyer_id, status }) {
    const { rows } = await query(
      `SELECT * FROM offers WHERE product_id=$1 AND buyer_id=$2 AND status=$3 LIMIT 1`,
      [product_id, buyer_id, status]
    );
    return rows[0] || null;
  },

  // seller sifatida kelgan takliflar
  async findBySeller(seller_id) {
    const { rows } = await query(
      `SELECT o.*,
              p.name AS product_name, p.price AS product_price, p.unit AS product_unit, p.photo AS product_photo,
              b.name AS buyer_name, b.phone AS buyer_phone, b.telegram AS buyer_telegram
       FROM offers o
       JOIN products p ON p.id = o.product_id
       JOIN users b ON b.id = o.buyer_id
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC`,
      [seller_id]
    );
    return rows;
  },

  // buyer sifatida yuborgan takliflar
  async findByBuyer(buyer_id) {
    const { rows } = await query(
      `SELECT o.*,
              p.name AS product_name, p.price AS product_price, p.unit AS product_unit, p.photo AS product_photo,
              s.name AS seller_name, s.phone AS seller_phone
       FROM offers o
       JOIN products p ON p.id = o.product_id
       JOIN users s ON s.id = o.seller_id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [buyer_id]
    );
    return rows;
  },

  async updateStatus(id, seller_id, status) {
    const { rows } = await query(
      `UPDATE offers SET status=$1, updated_at=NOW()
       WHERE id=$2 AND seller_id=$3 RETURNING *`,
      [status, id, seller_id]
    );
    return rows[0] || null;
  },
};

module.exports = Offer;
