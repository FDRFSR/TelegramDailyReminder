// src/services/sessionService.js
// Gestione sessione persistente utente su PostgreSQL
const { getDb } = require('../db');

async function setUserSession(userId, data) {
  const db = getDb();
  await db.query(
    `INSERT INTO user_sessions (user_id, add_category, filter_category, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET add_category = $2, filter_category = $3, updated_at = NOW()`,
    [userId, data.add_category || null, data.filter_category || null]
  );
}

async function getUserSession(userId) {
  const db = getDb();
  const res = await db.query('SELECT * FROM user_sessions WHERE user_id = $1', [userId]);
  return res.rows[0] || {};
}

module.exports = { setUserSession, getUserSession };
