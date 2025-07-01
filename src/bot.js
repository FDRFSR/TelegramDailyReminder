// src/bot.js
// Entry point for the Telegram Daily Reminder Bot

const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const registerCommands = require('./commands');
const { setupDatabase, getDb } = require('./db');
const messages = require('./messages');
const logger = require('./utils/logger');
const handleCallback = require('./handlers/callbackHandler');

// Load environment variables
dotenv.config();

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN non impostato nelle variabili ambiente.');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Setup database connection
setupDatabase();

// Register all bot commands
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
// const googleCalendar = require('./services/calendar/googleCalendarService');
// const outlookCalendar = require('./services/calendar/outlookCalendarService');

// 4. Gestione ricorrenze
// const recurringService = require('./services/recurringService');
// TODO: Chiamare processRecurringReminders periodicamente

// 5. Gestione time zone utente
// const userService = require('./services/userService');
// TODO: Usare getUserTimezone/setUserTimezone dove serve

// 6. Statistiche e analytics
// const statisticsService = require('./services/statisticsService');
// const monitoring = require('./monitoring');

// 7. Reminder condivisi (gruppi)
// const groupService = require('./services/groupService');

// 8. Attachments
// const attachmentService = require('./services/attachmentService');

// 9. Smart suggestions e template
// const smartSuggestionService = require('./services/smartSuggestionService');

// 10. Voice message
// const voiceService = require('./services/voiceService');

// 11. Backup e disaster recovery
// const backup = require('./backup');

// === END TODO ===

// Start polling
bot.launch();

logger.info('Telegram Daily Reminder Bot started.');

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
