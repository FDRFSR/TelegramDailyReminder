// src/notifications/dailySummary.js
// Logic for sending daily summary notifications

const { getDb } = require('../db');
const logger = require('../utils/logger');
const reminderService = require('../services/reminderService');

module.exports = async function sendDailySummary(bot) {
  const db = getDb();
  try {
    // Recupera tutti gli utenti
    const usersRes = await db.query('SELECT id FROM users');
    const users = usersRes.rows;
    for (const user of users) {
      const userId = user.id;
      // Ottieni promemoria di oggi e non completati
      const reminders = await reminderService.getOverdueReminders(userId);
      if (!reminders || reminders.length === 0) continue;
      // Costruisci messaggio riepilogo
      let message = '⏰ <b>Riepilogo promemoria di oggi:</b>\n';
      for (const r of reminders) {
        message += `\n<b>${r.time}</b> - ${r.text} [${r.category || 'generico'}]`;
        if (r.completed) message += ' ✅';
      }
      // Invia messaggio con pulsanti inline (solo mark as done per esempio)
      const buttons = reminders.filter(r => !r.completed).map(r => [{
        text: '✅ Fatto',
        callback_data: `done_${r.id}`
      }]);
      await bot.telegram.sendMessage(userId, message, {
        parse_mode: 'HTML',
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined
      });
      logger.info(`Riepilogo inviato a utente ${userId}`);
    }
  } catch (err) {
    logger.error('Errore invio riepilogo giornaliero:', err);
  }
};
