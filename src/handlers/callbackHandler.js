// src/handlers/callbackHandler.js
// Handles inline button callback logic for reminders

const messages = require('../messages');
const logger = require('../utils/logger');
const { getDb } = require('../db');
const sessionService = require('../services/sessionService');

// Simple in-memory rate limiter (per user, per callback data)
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 1000;

function isRateLimited(userId, data) {
  const key = `${userId}:${data}`;
  const now = Date.now();
  if (rateLimitMap.has(key) && now - rateLimitMap.get(key) < RATE_LIMIT_MS) {
    return true;
  }
  rateLimitMap.set(key, now);
  return false;
}

async function handleCallback(ctx) {
  const db = getDb();
  const { id: userId } = ctx.from;
  const data = (ctx.callbackQuery.data || '').toLowerCase();

  // Rate limiting
  if (isRateLimited(userId, data)) {
    await ctx.answerCbQuery(messages.pleaseWait);
    return;
  }

  // Blocca doppio click su messaggi già gestiti
  if (ctx.callbackQuery.message && ctx.callbackQuery.message.reply_markup === undefined) {
    await ctx.answerCbQuery(messages.pleaseWait);
    return;
  }

  // Validazione utente (opzionale: qui si assume che l'utente sia già registrato)

  // Gestione callback
  if (data.startsWith('done_')) {
    const [, reminderId] = data.split('_');
    if (!reminderId || isNaN(reminderId)) {
      await ctx.answerCbQuery(messages.callbackInvalid);
      return;
    }
    const result = await db.query('UPDATE reminders SET completed = TRUE WHERE id = $1 AND user_id = $2 RETURNING id', [reminderId, String(userId)]);
    if (result.rowCount > 0) {
      logger.info(`[${userId}] Promemoria ${reminderId} segnato come fatto`);
      try {
        await ctx.editMessageReplyMarkup();
      } catch (e) {
        // Messaggio già modificato
      }
      await ctx.answerCbQuery(messages.reminderDone);
      return;
    } else {
      logger.warn(`[${userId}] Promemoria ${reminderId} non trovato o già completato`);
      await ctx.answerCbQuery(messages.reminderNotFound);
      return;
    }
  } else if (data.startsWith('delete_')) {
    const [, reminderId] = data.split('_');
    if (!reminderId || isNaN(reminderId)) {
      await ctx.answerCbQuery(messages.callbackInvalid);
      return;
    }
    const result = await db.query('DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING id', [reminderId, String(userId)]);
    if (result.rowCount > 0) {
      logger.info(`[${userId}] Promemoria ${reminderId} eliminato`);
      try {
        await ctx.editMessageReplyMarkup();
      } catch (e) {
        // Messaggio già modificato
      }
      await ctx.answerCbQuery(messages.reminderDeleted);
      return;
    } else {
      logger.warn(`[${userId}] Promemoria ${reminderId} non trovato per eliminazione`);
      await ctx.answerCbQuery(messages.reminderNotFound);
      return;
    }
  } 
  // Gestione scelta categoria in /add
  else if (data.startsWith('addcat_')) {
    const category = data.replace('addcat_', '');
    await sessionService.setUserSession(String(userId), { add_category: category });
    await ctx.reply('Scrivi il testo del promemoria (es: "Chiamare Mario alle 10")');
    await ctx.answerCbQuery('Categoria selezionata!');
    return;
  }

  // Gestione filtri in /list
  else if (data.startsWith('filter_')) {
    const filter = data.replace('filter_', '');
    await sessionService.setUserSession(String(userId), { filter_category: filter === 'all' ? null : filter });
    await ctx.reply(`Filtro applicato: ${filter === 'all' ? 'Tutti' : filter}`);
    // Triggera /list per mostrare i risultati filtrati
    await ctx.telegram.sendMessage(ctx.from.id, '/list');
    await ctx.answerCbQuery('Filtro applicato!');
    return;
  }

  // Gestione modifica (stub)
  else if (data.startsWith('edit_')) {
    const reminderId = data.replace('edit_', '');
    await ctx.reply('Funzione di modifica in sviluppo.');
    await ctx.answerCbQuery('Modifica non ancora disponibile.');
    return;
  } 
  // Gestione callback per pulsante "Vedi lista"
  else if (data === 'show_list') {
    // Mostra la lista direttamente (stessa logica del bot.action in bot.js)
    const session = await sessionService.getUserSession(userId);
    const category = session.filter_category;
    let query = 'SELECT * FROM reminders WHERE user_id = $1';
    const params = [userId];
    if (category) {
      query += ' AND category = $2';
      params.push(category);
    }
    query += ' ORDER BY date, time';
    const res = await db.query(query, params);
    if (!res.rows.length) {
      await ctx.reply('Nessun promemoria trovato. Puoi aggiungerne uno:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Aggiungi promemoria Lavoro', callback_data: 'addcat_work' },
              { text: '➕ Aggiungi promemoria Personale', callback_data: 'addcat_personal' }
            ]
          ]
        }
      });
      await ctx.answerCbQuery();
      return;
    }
    // Pulsanti filtro
    const filterButtons = [
      [
        { text: 'Tutti', callback_data: 'filter_all' },
        { text: 'Lavoro', callback_data: 'filter_work' },
        { text: 'Personale', callback_data: 'filter_personal' }
      ]
    ];
    // Lista promemoria con pulsanti azione
    for (const r of res.rows) {
      const buttons = [
        [
          { text: '✅ Fatto', callback_data: `done_${r.id}` },
          { text: '🗑️ Elimina', callback_data: `delete_${r.id}` },
          { text: '✏️ Modifica', callback_data: `edit_${r.id}` }
        ]
      ];
      await ctx.replyWithHTML(
        `<b>${r.time || ''}</b> - ${r.text} [${r.category || 'generico'}]${r.completed ? ' ✅' : ''}`,
        { reply_markup: { inline_keyboard: buttons } }
      );
    }
    // Mostra i filtri in alto
    await ctx.reply('Filtra per categoria:', { reply_markup: { inline_keyboard: filterButtons } });
    await ctx.answerCbQuery();
    return;
  } 
  else {
    logger.warn(`[${userId}] Callback non riconosciuta: ${data}`);
    await ctx.answerCbQuery(messages.actionUnknown);
    return;
  }
}

module.exports = handleCallback;
