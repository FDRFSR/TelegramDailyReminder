// src/commands/listReminders.js
// Handler for /list command
const { getDb } = require('../db');

module.exports = (bot) => {
  // Funzione helper per rispondere sempre con tastiera rapida
  function replyWithQuickKeyboard(ctx, text, extra = {}) {
    if (!extra.reply_markup) extra.reply_markup = {};
    if (!extra.reply_markup.keyboard) {
      Object.assign(extra.reply_markup, QUICK_REPLY_MARKUP);
    }
    return ctx.reply(text, extra);
  }

  // /list command
  bot.command('list', async (ctx) => {
    const db = getDb();
    const userId = String(ctx.from.id);
    const res = await db.query(
      'SELECT id, time, text, category, completed FROM reminders WHERE user_id = $1 AND (date = CURRENT_DATE OR completed = FALSE) ORDER BY completed, time',
      [userId]
    );
    if (res.rows.length === 0) {
      return replyWithQuickKeyboard(ctx, 'Nessun promemoria trovato.');
    }
    let msg = '<b>📝 I tuoi promemoria:</b>\n';
    const keyboard = [];
    res.rows.forEach((r, i) => {
      const status = r.completed ? '✅' : '⏳';
      const cat = r.category ? (r.category === 'work' ? '🏢' : '🏠') : '';
      msg += `${status} <b>${r.time}</b> ${cat} ${r.text} <i>${r.category || ''}</i>\n`;
      keyboard.push([
        { text: r.completed ? '✔️ Fatto' : 'Fatto', callback_data: `done_${r.id}` },
        { text: 'Elimina', callback_data: `delete_${r.id}` }
      ]);
    });
    ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard, ...QUICK_REPLY_MARKUP }
    });
  });
};
