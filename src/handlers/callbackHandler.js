// src/handlers/callbackHandler.js
// Handles inline button callback logic for reminders

const messages = require('../messages');
const logger = require('../utils/logger');
const { getDb } = require('../db');

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
  } else {
    logger.warn(`[${userId}] Callback non riconosciuta: ${data}`);
    await ctx.answerCbQuery(messages.actionUnknown);
    return;
  }
}

module.exports = handleCallback;
