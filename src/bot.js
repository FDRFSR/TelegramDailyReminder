// src/bot.js
// Entry point for the Telegram Daily Reminder Bot

const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const registerCommands = require('./commands');
const { setupDatabase, getDb } = require('./db');
const messages = require('./messages');
const logger = require('./utils/logger');
const handleCallback = require('./handlers/callbackHandler');
const googleCalendar = require('./services/calendar/googleCalendarService');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const sessionService = require('./services/sessionService');

// Load environment variables
dotenv.config();

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN non impostato nelle variabili ambiente.');
  process.exit(1);
}

// === Ottimizzazioni e best practice ===

// 1. Validazione centralizzata variabili d'ambiente
function validateEnv() {
  const required = ['BOT_TOKEN', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('❌ Variabili d\'ambiente mancanti:', missing.join(', '));
    process.exit(1);
  }
}
validateEnv();

// 2. Gestione errori globale e logging
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

// 3. Non loggare mai il valore reale del BOT_TOKEN
console.log('ENV DEBUG:', {
  BOT_TOKEN: process.env.BOT_TOKEN ? '***SET***' : undefined,
  DATABASE_URL: process.env.DATABASE_URL ? '***SET***' : undefined,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// DRY: Quick reply e tastiere inline centralizzate in costanti per coerenza e manutenzione.
const MAIN_INLINE_KEYBOARD = [
  [
    { text: '➕ Crea Lavoro', callback_data: 'addcat_work' },
    { text: '➕ Crea Personale', callback_data: 'addcat_personal' },
    { text: '📋 Vedi lista', callback_data: 'show_list' }
  ]
];
const QUICK_REPLY_KEYBOARD = [
  ['Crea Lavoro', 'Crea Personale', 'Vedi lista']
];
const QUICK_REPLY_MARKUP = {
  keyboard: QUICK_REPLY_KEYBOARD,
  resize_keyboard: true,
  one_time_keyboard: false
};

// Funzione per eseguire le migrazioni del database
// Migrazioni ottimizzate: esegui solo quelle non ancora applicate
async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL non impostato, impossibile eseguire le migrazioni.');
    return;
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try {
    await client.connect();
    // Crea tabella migrations se non esiste
    await client.query(`CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT NOW())`);
    const { rows: applied } = await client.query('SELECT name FROM migrations');
    const appliedSet = new Set(applied.map(r => r.name));
    const migrationsDir = path.join(__dirname, '../db/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.info(`Migrazione già applicata: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info(`Eseguo migrazione: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Errore durante la migrazione ${file}:`, err);
        throw err;
      }
    }
    logger.info('Migrazioni completate con successo.');
  } catch (err) {
    logger.error('Errore durante le migrazioni:', err);
  } finally {
    await client.end();
  }
}

// Esegui le migrazioni all'avvio e poi avvia il bot solo dopo il completamento
(async () => {
  await runMigrations();
  setupDatabase();
  registerCommands(bot);

  // /start command: onboarding and welcome
  bot.start(async (ctx) => {
    try {
      // Salva utente nel DB se non esiste
      const db = getDb();
      const userId = String(ctx.from.id);
      await db.query(
        'INSERT INTO users (id, first_name, username) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [userId, ctx.from.first_name || '', ctx.from.username || '']
      );
      // Mostra sia inline_keyboard che reply_keyboard per UX mobile-friendly
      await sendAndAutoDelete(ctx, messages.onboarding, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: MAIN_INLINE_KEYBOARD,
          ...QUICK_REPLY_MARKUP
        }
      });
    } catch (err) {
      logger.error('Errore in /start:', err);
      await sendAndAutoDelete(ctx, messages.errorInternal);
    }
  });

  // Gestione callback dei pulsanti inline
  bot.on('callback_query', handleCallback);

  // Funzione riutilizzabile per mostrare la lista dei promemoria
  async function showRemindersList(ctx) {
    const db = getDb();
    const userId = String(ctx.from.id);
    const session = await sessionService.getUserSession(userId);
    const category = session && session.filter_category;
    let query = 'SELECT * FROM reminders WHERE user_id = $1 AND completed = FALSE';
    const params = [userId];
    if (category) {
      query += ' AND category = $2';
      params.push(category);
    }
    query += ' ORDER BY date, time';
    const res = await db.query(query, params);
    logger.info(`Trovati ${res.rows.length} promemoria per l'utente ${userId}`);
    if (!res.rows.length) {
      await sendAndAutoDelete(ctx, 'Nessun promemoria trovato.');
      return;
    }
    // Raggruppa tutti i reminder in un unico messaggio con tastiera multipla
    let msg = '<b>Ecco i tuoi promemoria:</b>\n';
    const keyboard = [];
    for (const r of res.rows) {
      const preview = (r.completed ? '✅ ' : '') + (r.text.length > 47 ? r.text.slice(0, 47) + '…' : r.text);
      msg += `\n${preview} [${r.category || 'generico'}]`;
      keyboard.push([
        { text: preview, callback_data: `done_${r.id}` }
      ]);
    }
    await sendAndAutoDeleteHTML(ctx, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  // Gestione callback per pulsante "Vedi lista"
  bot.action('show_list', async (ctx) => {
    await ctx.answerCbQuery();
    await showRemindersList(ctx);
  });

  // === TODO: INTEGRAZIONE FEATURE PRINCIPALI E AVANZATE ===
  // 1. Notifiche giornaliere automatiche
  const { startDailyNotifications } = require('./notifications/scheduler');
  startDailyNotifications(bot); // Avvia scheduler notifiche

  // 2. Internazionalizzazione (i18n)
  // const i18n = require('./i18n'); // Middleware e funzioni già stub

  // 3. Integrazione Google/Outlook Calendar

  // const outlookCalendar = require('./services/calendar/outlookCalendarService');

  // Comando /gcal_auth per avviare autenticazione Google Calendar
  bot.command('gcal_auth', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      await googleCalendar.authenticate(userId, ctx);
    } catch (err) {
      logger.error('Errore in /gcal_auth:', err);
      ctx.reply('❌ Errore durante autenticazione Google Calendar.');
    }
  });

  // Comando /gcal_sync per sincronizzare i reminder
  bot.command('gcal_sync', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      await googleCalendar.syncReminders(userId, ctx);
    } catch (err) {
      logger.error('Errore in /gcal_sync:', err);
      ctx.reply('❌ Errore durante la sincronizzazione con Google Calendar.');
    }
  });

  // 4. Gestione ricorrenze
  // const recurringService = require('./services/recurringService');
  // TODO: Chiamare processRecurringReminders periodicamente

  // 5. Gestione time zone utente
  // const userService = require('./services/userService');
  // TODO: Usare getUserTimezone/setUserTimezone dove serve

  // 6. Statistiche e analytics
  const statisticsService = require('./services/statisticsService');
  const monitoring = require('./monitoring');

  // Comando /stats per mostrare statistiche utente
  bot.command('stats', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      const stats = await statisticsService.getUserStats(userId);
      if (!stats || Object.keys(stats).length === 0) {
        await ctx.reply('📊 Nessuna statistica disponibile.');
        return;
      }
      let msg = '📊 <b>Statistiche promemoria</b>\n';
      if (stats.completed !== undefined) msg += `Completati: <b>${stats.completed}</b>\n`;
      if (stats.pending !== undefined) msg += `Da completare: <b>${stats.pending}</b>\n`;
      if (stats.weekly !== undefined) msg += `Ultimi 7 giorni: <b>${stats.weekly}</b>\n`;
      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      monitoring.captureError(err, { command: '/stats' });
      ctx.reply('❌ Errore durante il recupero delle statistiche.');
    }
  });

  // 10. Voice message
  const voiceService = require('./services/voiceService');
  bot.on('voice', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      const voiceFile = ctx.message.voice;
      await voiceService.processVoiceMessage(userId, voiceFile, ctx);
    } catch (err) {
      monitoring.captureError(err, { event: 'voice' });
      ctx.reply('❌ Errore durante la gestione del messaggio vocale.');
    }
  });

  // 11. Backup e disaster recovery
  // const backup = require('./backup');

  // === END TODO ===

  // Start polling
  bot.launch();

  logger.info('Telegram Daily Reminder Bot started.');
})();

// Funzione helper per inviare un messaggio e cancellarlo dopo 30 minuti
async function sendAndAutoDelete(ctx, text, extra = {}) {
  if (!extra.reply_markup) extra.reply_markup = {};
  if (!extra.reply_markup.keyboard) {
    Object.assign(extra.reply_markup, QUICK_REPLY_MARKUP);
  }
  const sent = await ctx.reply(text, extra);
  setTimeout(() => {
    ctx.deleteMessage(sent.message_id).catch(() => {});
    if (ctx.message && ctx.message.message_id) {
      ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }
  }, 1800000); // 30 minuti
  return sent;
}
// Variante per HTML
async function sendAndAutoDeleteHTML(ctx, text, extra = {}) {
  if (!extra.reply_markup) extra.reply_markup = {};
  if (!extra.reply_markup.keyboard) {
    Object.assign(extra.reply_markup, QUICK_REPLY_MARKUP);
  }
  const sent = await ctx.replyWithHTML(text, extra);
  setTimeout(() => {
    ctx.deleteMessage(sent.message_id).catch(() => {});
    if (ctx.message && ctx.message.message_id) {
      ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }
  }, 1800000);
  return sent;
}

// === Ottimizzazioni avanzate aggiuntive ===

// 1. Sanificazione input utente (basic, per sicurezza e logging)
function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  // Rimuove caratteri di controllo e normalizza whitespace
  return text.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

// 2. Flood control: limita a 5 messaggi ogni 10 secondi per utente
const userMessageTimestamps = new Map();
bot.use((ctx, next) => {
  if (!ctx.from) return next();
  const userId = String(ctx.from.id);
  const now = Date.now();
  const arr = userMessageTimestamps.get(userId) || [];
  const recent = arr.filter(ts => now - ts < 10000);
  recent.push(now);
  userMessageTimestamps.set(userId, recent);
  if (recent.length > 5) {
    ctx.reply('⏳ Stai inviando troppi messaggi, attendi qualche secondo.');
    return;
  }
  return next();
});

// 3. Reset automatico sessione se l’utente invia un comando durante un flusso guidato
bot.on('text', async (ctx, next) => {
  const userId = String(ctx.from.id);
  const session = await sessionService.getUserSession(userId);
  if (session && session.add_category && ctx.message.text.startsWith('/')) {
    await sessionService.setUserSession(userId, { add_category: null, add_text: null });
    await sendAndAutoDelete(ctx, '⚠️ Flusso di creazione promemoria annullato.');
    return;
  }
  return next();
});

// 4. Logging dettagliato degli errori di validazione
async function logValidationError(ctx, text) {
  logger.warn(`Input non valido da utente ${ctx.from.id}: '${sanitizeInput(text)}'`);
}

// 5. Risposta ai comandi sconosciuti
bot.on('text', async (ctx, next) => {
  if (ctx.message.text.startsWith('/')) {
    await sendAndAutoDelete(ctx, '❓ Comando non riconosciuto. Usa /start per il menu.');
    return;
  }
  return next();
});

// 6. Blocco utenti bannati (stub, pronto per estensione futura)
const bannedUsers = new Set(); // Popola da DB o file se serve
bot.use((ctx, next) => {
  if (ctx.from && bannedUsers.has(String(ctx.from.id))) {
    ctx.reply('⛔ Sei stato bannato dal bot.');
    return;
  }
  return next();
});

// Modifica handler di aggiunta promemoria per usare la sanificazione e logging errori
bot.on('text', async (ctx, next) => {
  const userId = String(ctx.from.id);
  const session = await sessionService.getUserSession(userId);
  if (session && session.add_category && !ctx.message.text.startsWith('/')) {
    const text = sanitizeInput(ctx.message.text);
    if (!validateReminderText(text)) {
      await logValidationError(ctx, text);
      await sendAndAutoDelete(ctx, '❌ Testo promemoria non valido. Deve essere tra 2 e 200 caratteri.');
      return;
    }
    const defaultTime = '08:00';
    const db = getDb();
    const res = await db.query(
      'INSERT INTO reminders (user_id, text, category, time) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, text, session.add_category, defaultTime]
    );
    const reminderId = res.rows[0].id;
    await sendAndAutoDeleteHTML(
      ctx,
      `✅ Promemoria aggiunto: <b>${text}</b> [${session.add_category}]`,
      { parse_mode: 'HTML' }
    );
    await sessionService.setUserSession(userId, { add_category: null, add_text: null });
    return;
  }
  return next();
});

// /tasks command: mostra la lista delle task (promemoria non completati)
bot.command('tasks', async (ctx) => {
  const userId = String(ctx.from.id);
  try {
    const db = getDb();
    const res = await db.query(
      'SELECT * FROM reminders WHERE user_id = $1 AND completed = FALSE ORDER BY date, time',
      [userId]
    );
    if (!res.rows.length) {
      await sendAndAutoDelete(ctx, 'Nessuna task trovata.', QUICK_REPLY_MARKUP);
      return;
    }
    // Suddividi in blocchi per non superare il limite di Telegram (4096 caratteri)
    let msg = '<b>Le tue task:</b>\n';
    const blocks = [];
    for (const r of res.rows) {
      const preview = (r.text.length > 47 ? r.text.slice(0, 47) + '…' : r.text);
      msg += `\n${preview} [${r.category || 'generico'}]`;
      if (msg.length > 3500) { // margine di sicurezza
        blocks.push(msg);
        msg = '';
      }
    }
    if (msg) blocks.push(msg);
    for (const block of blocks) {
      await sendAndAutoDeleteHTML(ctx, block, { parse_mode: 'HTML', ...QUICK_REPLY_MARKUP });
    }
  } catch (err) {
    logger.error('Errore in /tasks:', err);
    await sendAndAutoDelete(ctx, '❌ Errore interno.', QUICK_REPLY_MARKUP);
  }
});
