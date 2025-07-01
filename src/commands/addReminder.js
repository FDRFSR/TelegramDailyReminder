// src/commands/addReminder.js
// Handler for /add command
const { getDb } = require('../db');

module.exports = (bot) => {
  // /add command
  bot.command('add', async (ctx) => {
    const db = getDb();
    const userId = String(ctx.from.id);
    const input = ctx.message.text.replace('/add', '').trim();
    const match = input.match(/(\d{1,2}:\d{2})\s+(.+?)(?:\s+\[(.+)\])?$/);
    if (!match) {
      return ctx.reply('Formato non valido. Usa: /add 08:00 Testo [categoria]');
    }
    const [, time, text, category] = match;
    const res = await db.query(
      'INSERT INTO reminders (user_id, text, time, category) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, text, time, category || null]
    );
    const reminderId = res.rows[0].id;
    ctx.reply(
      `✅ Promemoria aggiunto: <b>${time}</b> - ${text} ${category ? `[${category}]` : ''}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: 'Modifica', callback_data: `edit_${reminderId}` },
            { text: 'Elimina', callback_data: `delete_${reminderId}` },
            { text: 'Fatto', callback_data: `done_${reminderId}` }
          ]]
        }
      }
    );
  });
};
