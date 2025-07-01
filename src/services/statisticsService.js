// src/services/statisticsService.js
// Statistiche e analytics (es. task completati per settimana)
// TODO: Implementare raccolta e query statistiche

module.exports = {
  getUserStats: async (userId) => {
    const db = require('../db').getDb();
    // Statistiche base: completati, da completare, ultimi 7 giorni
    const completedRes = await db.query(
      'SELECT COUNT(*) FROM reminders WHERE user_id = $1 AND completed = TRUE', [userId]
    );
    const pendingRes = await db.query(
      'SELECT COUNT(*) FROM reminders WHERE user_id = $1 AND completed = FALSE', [userId]
    );
    const weeklyRes = await db.query(
      `SELECT COUNT(*) FROM reminders WHERE user_id = $1 AND completed = TRUE AND created_at >= NOW() - INTERVAL '7 days'`, [userId]
    );
    return {
      completed: Number(completedRes.rows[0].count),
      pending: Number(pendingRes.rows[0].count),
      weekly: Number(weeklyRes.rows[0].count)
    };
  }
};
