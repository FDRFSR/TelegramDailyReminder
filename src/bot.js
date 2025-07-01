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
      await ctx.reply(messages.onboarding, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error('Errore in /start:', err);
      ctx.reply(messages.errorInternal);
    }
  });

  // Gestione callback dei pulsanti inline
  bot.on('callback_query', handleCallback);

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
