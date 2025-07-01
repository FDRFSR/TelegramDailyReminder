// src/commands/deleteReminder.js
// Handler for /delete command
const { getDb } = require('../db');

module.exports = (bot) => {
  // /delete command
  bot.command('delete', async (ctx) => {
    const db = getDb();
    const userId = String(ctx.from.id);
    const input = ctx.message.text.replace('/delete', '').trim();
    if (!input) {
      return ctx.reply('Specifica l\'ID o il testo del promemoria da eliminare.');
    }
    let res;
    if (/^\d+$/.test(input)) {
      res = await db.query('DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING id', [input, userId]);
    } else {
      res = await db.query('DELETE FROM reminders WHERE text ILIKE $1 AND user_id = $2 RETURNING id', [input, userId]);
    }
    if (res.rowCount > 0) {
      ctx.reply('🗑️ Promemoria eliminato!');
    } else {
      ctx.reply('Nessun promemoria trovato con quel criterio.');
    }
  });
};
