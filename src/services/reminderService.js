// src/services/reminderService.js
// Business logic for managing reminders

const { getDb } = require('../db');

module.exports = {
  // Crea un nuovo promemoria (mock, da implementare con DB)
  async createReminder(userId, time, text, category) {
    const db = getDb();
    const res = await db.query(
      'INSERT INTO reminders (user_id, text, time, category) VALUES ($1, $2, $3, $4) RETURNING id, user_id, time, text, category, completed',
      [userId, text, time, category || null]
    );
    return res.rows[0];
  },
  // Lista promemoria (mock)
  async listReminders(userId) {
    // TODO: fetch dal DB
    return [
      { id: 1, time: '08:00', text: 'Riunione con team', category: 'work', completed: false },
      { id: 2, time: '12:00', text: 'Pranzo', category: 'personal', completed: false }
    ];
  },
  // Elimina promemoria (mock)
  async deleteReminder(userId, idOrText) {
    // TODO: elimina dal DB
    return true;
  },
  // Segna come completato (mock)
  async markAsDone(userId, id) {
    // TODO: update DB
    return true;
  },
  // Ottieni promemoria scaduti/non completati dal DB
  async getOverdueReminders(userId) {
    const db = getDb();
    // Prendi tutti i reminder di oggi o precedenti non completati
    const res = await db.query(
      `SELECT id, time, text, category, completed FROM reminders
       WHERE user_id = $1 AND (date <= CURRENT_DATE) AND completed = FALSE
       ORDER BY date, time`,
      [userId]
    );
    return res.rows;
  }
};
