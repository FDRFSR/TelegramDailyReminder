// src/bot.js
// Entry point for the Telegram Daily Reminder Bot

const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const registerCommands = require('./commands');
const { setupDatabase, getDb } = require('./db');
const messages = require('./messages');
const logger = require('./utils/logger');
const googleCalendar = require('./services/calendar/googleCalendarService');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const sessionService = require('./services/sessionService');
const { CronJob } = require('cron');

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

  // === Inline keyboard per azioni principali ===
  const mainMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Nuova Task', 'add_task')],
    [Markup.button.callback('📋 Lista Task', 'list_tasks')]
  ]);

  // === Helper tastiera inline principale ===
  function getMainInlineKeyboard() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Nuova Task', callback_data: 'add_task' },
            { text: '📋 Lista Task', callback_data: 'list_tasks' }
          ]
        ]
      }
    };
  }

  // /start command: onboarding and welcome
  bot.start(async (ctx) => {
    try {
      const db = getDb();
      const userId = String(ctx.from.id);
      await db.query(
        'INSERT INTO users (id, first_name, username) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [userId, ctx.from.first_name || '', ctx.from.username || '']
      );
      await sendAndAutoDelete(ctx, messages.onboarding, {
        parse_mode: 'HTML',
        ...getMainInlineKeyboard()
      });
    } catch (err) {
      logger.error('Errore in /start:', err);
      await sendAndAutoDelete(ctx, messages.errorInternal);
    }
  });

  // Funzione riutilizzabile per mostrare la lista dei promemoria/task
  async function showRemindersList(ctx) {
    const db = getDb();
    const userId = String(ctx.from.id);
    // Recupera solo task non completate, ordinate per id
    const res = await db.query(
      'SELECT * FROM reminders WHERE user_id = $1 AND completed = FALSE ORDER BY id ASC',
      [userId]
    );
    logger.info(`Trovati ${res.rows.length} promemoria per l'utente ${userId}`);
    if (!res.rows.length) {
      await sendAndAutoDelete(ctx, '📭 Nessuna task o promemoria trovato.', getMainInlineKeyboard());
      return;
    }
    // Ogni task è un messaggio separato, cliccabile: cliccando sul messaggio, la task viene completata
    for (const r of res.rows) {
      const msg = `${r.text}`;
      const sent = await ctx.replyWithHTML(msg, { disable_notification: true });
      // Salva mapping messaggio-task per intercettare il click
      await db.query('INSERT INTO user_sessions (user_id, message_id, reminder_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, message_id) DO UPDATE SET reminder_id = $3', [userId, sent.message_id, r.id]);
    }
    // Dopo la lista, mostra i pulsanti principali
    await sendAndAutoDelete(ctx, 'Scegli un’azione:', getMainInlineKeyboard());
    // Pianifica la cancellazione di tutti i messaggi task dopo 30 minuti
    scheduleDeleteAllUserMessages(ctx);
  }

  // Funzione helper per cancellare tutti i messaggi della chat utente dopo 30 minuti (estesa a TUTTI i messaggi)
  async function scheduleDeleteAllUserMessages(ctx) {
    const userId = String(ctx.from.id);
    const db = getDb();
    // Recupera tutti i message_id associati all'utente dalla tabella user_sessions
    const res1 = await db.query('SELECT message_id FROM user_sessions WHERE user_id = $1', [userId]);
    const messageIds = res1.rows.map(r => r.message_id);
    // Recupera anche gli ultimi 100 messaggi della chat (per sicurezza, in caso di messaggi non tracciati)
    let extraIds = [];
    try {
      const chatId = ctx.chat.id;
      // Telegram non permette di elencare tutti i messaggi, ma puoi tenere traccia dei message_id inviati dal bot
      // Qui si cancella solo ciò che è stato tracciato
    } catch (e) {}
    setTimeout(async () => {
      for (const messageId of [...messageIds, ...extraIds]) {
        await ctx.deleteMessage(messageId).catch(() => {});
      }
      // Pulisci anche la tabella user_sessions
      await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    }, 1800000); // 30 minuti
  }

  // Handler per click su messaggio (aggiorna stato completato)
  bot.on('message', async (ctx, next) => {
    if (!ctx.message || !ctx.message.message_id || !ctx.from) return next();
    const userId = String(ctx.from.id);
    const messageId = ctx.message.message_id;
    const db = getDb();
    // Cerca se questo messaggio è associato a una task
    const res = await db.query('SELECT reminder_id FROM user_sessions WHERE user_id = $1 AND message_id = $2', [userId, messageId]);
    if (!res.rows.length) return next();
    const reminderId = res.rows[0].reminder_id;
    // Segna la task come completata
    await db.query('UPDATE reminders SET completed = TRUE WHERE id = $1 AND user_id = $2', [reminderId, userId]);
    // Cancella il messaggio
    await ctx.deleteMessage(messageId).catch(() => {});
    // Conferma opzionale (puoi omettere per UX pulita)
    // await ctx.reply('✅ Task completata!');
    logger.info(`Task completata: id=${reminderId}, utente=${userId}`);
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
  const sent = await ctx.reply(text, extra);
  // Traccia il message_id in user_sessions per la cancellazione globale
  const db = getDb();
  const userId = String(ctx.from.id);
  await db.query('INSERT INTO user_sessions (user_id, message_id) VALUES ($1, $2) ON CONFLICT (user_id, message_id) DO NOTHING', [userId, sent.message_id]);
  setTimeout(() => {
    ctx.deleteMessage(sent.message_id).catch(() => {});
    if (ctx.message && ctx.message.message_id) {
      ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }
  }, 1800000);
  return sent;
}
async function sendAndAutoDeleteHTML(ctx, text, extra = {}) {
  const sent = await ctx.replyWithHTML(text, extra);
  // Traccia il message_id in user_sessions per la cancellazione globale
  const db = getDb();
  const userId = String(ctx.from.id);
  await db.query('INSERT INTO user_sessions (user_id, message_id) VALUES ($1, $2) ON CONFLICT (user_id, message_id) DO NOTHING', [userId, sent.message_id]);
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
    const db = getDb();
    const res = await db.query(
      'INSERT INTO reminders (user_id, text, category) VALUES ($1, $2, $3) RETURNING id',
      [userId, text, session.add_category]
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
  try {
    await showRemindersList(ctx);
  } catch (err) {
    logger.error('Errore in /tasks:', err);
    await sendAndAutoDelete(ctx, '❌ Errore interno.');
  }
});

// Procedura guidata creazione task solo testo
bot.command('add', async (ctx) => {
  const userId = String(ctx.from.id);
  await sessionService.setUserSession(userId, { add_step: 'text' });
  await sendAndAutoDelete(ctx, 'Scrivi il testo della task (2-200 caratteri).');
});

// Handler per la procedura guidata
bot.on('text', async (ctx, next) => {
  const userId = String(ctx.from.id);
  const session = await sessionService.getUserSession(userId);
  if (!session || session.add_step !== 'text') return next();

  // Step unico: testo
  const text = sanitizeInput(ctx.message.text);
  if (!validateReminderText(text)) {
    await sendAndAutoDelete(ctx, '❌ Testo non valido. Deve essere tra 2 e 200 caratteri.');
    return;
  }
  const db = getDb();
  try {
    const res = await db.query(
      'INSERT INTO reminders (user_id, text) VALUES ($1, $2) RETURNING id',
      [userId, text]
    );
    const reminderId = res.rows[0].id;
    logger.info(`Task creata: id=${reminderId}, utente=${userId}, testo='${text}'`);
    await sendAndAutoDeleteHTML(ctx, `✅ Task creata: <b>${text}</b>`, { parse_mode: 'HTML', ...getMainInlineKeyboard() });
    await sessionService.setUserSession(userId, {}); // reset
  } catch (err) {
    logger.error('Errore durante la creazione task:', err);
    await sendAndAutoDelete(ctx, '❌ Errore durante la creazione della task. Riprova.');
  }
  return;
});

// Gestione callback dei pulsanti inline principali
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data === 'add_task') {
    const userId = String(ctx.from.id);
    await sessionService.setUserSession(userId, { add_step: 'text' });
    await sendAndAutoDelete(ctx, 'Scrivi il testo della task (2-200 caratteri).');
    await ctx.answerCbQuery();
    return;
  }
  if (data === 'list_tasks') {
    await showRemindersList(ctx);
    await ctx.answerCbQuery();
    return;
  }
  await ctx.answerCbQuery();
});

// === Scheduler riepilogo automatico task ogni 30 minuti ===
function startTaskSummaryScheduler(bot) {
  // Ogni 30 minuti, dalle 8:00 alle 22:00
  const job = new CronJob('0,30 8-22 * * *', async () => {
    const db = getDb();
    // Recupera tutti gli utenti
    const usersRes = await db.query('SELECT id FROM users');
    for (const user of usersRes.rows) {
      const userId = String(user.id);
      // Recupera le task non completate
      const tasksRes = await db.query('SELECT text FROM reminders WHERE user_id = $1 AND completed = FALSE ORDER BY id ASC', [userId]);
      if (!tasksRes.rows.length) continue;
      // Costruisci il riepilogo
      let msg = '<b>Riepilogo task da completare:</b>\n';
      for (const t of tasksRes.rows) {
        msg += `\n${t.text}`;
      }
      try {
        await bot.telegram.sendMessage(userId, msg, { parse_mode: 'HTML' });
      } catch (e) {
        logger.warn('Errore invio riepilogo automatico a utente ' + userId, e);
      }
    }
  }, null, true, 'Europe/Rome');
  job.start();
}

// Avvia il riepilogo automatico dopo il daily notification scheduler
startTaskSummaryScheduler(bot);
