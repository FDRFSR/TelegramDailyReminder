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

const bot = new Telegraf(process.env.BOT_TOKEN);

// Funzione per eseguire le migrazioni del database
async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL non impostato, impossibile eseguire le migrazioni.');
    return;
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try {
    await client.connect();
    const migrationsDir = path.join(__dirname, '../db/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info(`Eseguo migrazione: ${file}`);
      await client.query(sql);
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
      await ctx.reply(messages.onboarding, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Crea promemoria', callback_data: 'addcat_work' },
              { text: '📋 Vedi lista', callback_data: 'show_list' }
            ]
          ]
        }
      });
    } catch (err) {
      logger.error('Errore in /start:', err);
      ctx.reply(messages.errorInternal);
    }
  });

  // Gestione callback dei pulsanti inline
  bot.on('callback_query', handleCallback);

  // Gestione callback per pulsante "Vedi lista"
  bot.action('show_list', async (ctx) => {
    await ctx.answerCbQuery();
    // Invia la lista direttamente, non solo il comando
    const db = getDb();
    const userId = String(ctx.from.id);
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

// /add command con scelta categoria tramite pulsanti inline
bot.command('add', async (ctx) => {
  try {
    await sessionService.setUserSession(String(ctx.from.id), { add_category: null });
    await ctx.reply('Scegli la categoria del promemoria:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🧑‍💼 Lavoro', callback_data: 'addcat_work' },
            { text: '🏠 Personale', callback_data: 'addcat_personal' }
          ],
          [
            { text: '➕ Aggiungi promemoria Lavoro', callback_data: 'addcat_work' },
            { text: '➕ Aggiungi promemoria Personale', callback_data: 'addcat_personal' }
          ]
        ]
      }
    });
  } catch (err) {
    logger.error('Errore in /add:', err);
    ctx.reply('❌ Errore interno.');
  }
});

// /list command con pulsanti azione e filtri
bot.command('list', async (ctx) => {
  try {
    const db = getDb();
    const userId = String(ctx.from.id);
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
        `<b>${r.time}</b> - ${r.text} [${r.category || 'generico'}]${r.completed ? ' ✅' : ''}`,
        { reply_markup: { inline_keyboard: buttons } }
      );
    }
    // Mostra i filtri in alto
    await ctx.reply('Filtra per categoria:', { reply_markup: { inline_keyboard: filterButtons } });
  } catch (err) {
    logger.error('Errore in /list:', err);
    ctx.reply('❌ Errore interno.');
  }
});

// /delete command con elenco e pulsanti elimina
bot.command('delete', async (ctx) => {
  try {
    const db = getDb();
    const userId = String(ctx.from.id);
    const res = await db.query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY date, time', [userId]);
    if (!res.rows.length) {
      await ctx.reply('Nessun promemoria da eliminare.');
      return;
    }
    for (const r of res.rows) {
      const buttons = [
        [
          { text: '🗑️ Elimina', callback_data: `delete_${r.id}` }
        ]
      ];
      await ctx.replyWithHTML(
        `<b>${r.time}</b> - ${r.text} [${r.category || 'generico'}]${r.completed ? ' ✅' : ''}`,
        { reply_markup: { inline_keyboard: buttons } }
      );
    }
  } catch (err) {
    logger.error('Errore in /delete:', err);
    ctx.reply('❌ Errore interno.');
  }
});

// Handler per completare il flusso guidato di aggiunta promemoria dopo la scelta categoria
const reminderService = require('./services/reminderService');
bot.on('text', async (ctx, next) => {
  const userId = String(ctx.from.id);
  const session = await sessionService.getUserSession(userId);
  // Se l'utente è nel flusso guidato di aggiunta (ha scelto categoria ma non ancora inserito testo)
  if (session && session.add_category && !ctx.message.text.startsWith('/')) {
    const text = ctx.message.text.trim();
    // Salva direttamente il promemoria senza chiedere orario/giorno
    const db = getDb();
    const res = await db.query(
      'INSERT INTO reminders (user_id, text, category) VALUES ($1, $2, $3) RETURNING id',
      [userId, text, session.add_category]
    );
    const reminderId = res.rows[0].id;
    await ctx.reply(
      `✅ Promemoria aggiunto: <b>${text}</b> [${session.add_category}]`,
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
    // Pulisci la sessione
    await sessionService.setUserSession(userId, { add_category: null, add_text: null });
    return;
  }
  if (next) return next();
});

// Graceful stop
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    logger.info(`${signal} received, stopping bot and closing DB...`);
    await bot.stop(signal);
    // Chiudi la connessione al DB se inizializzata
    try {
      const db = getDb();
      if (db && db.end) {
        await db.end();
        logger.info('Database connection closed.');
      }
    } catch (e) {
      logger.warn('Errore durante la chiusura del DB:', e);
    }
    logger.info('Shutdown completo.');
    process.exit(0);
  } catch (err) {
    logger.error('Errore durante lo shutdown:', err);
    process.exit(1);
  }
}
process.once('SIGINT', () => { shutdown('SIGINT'); });
process.once('SIGTERM', () => { shutdown('SIGTERM'); });
