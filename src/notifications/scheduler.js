// src/notifications/scheduler.js
// Scheduler per notifiche giornaliere automatiche
// TODO: Usare node-cron o simili per inviare riepilogo ogni mattina

const cron = require('node-cron');
const dailySummary = require('./dailySummary');
const logger = require('../utils/logger');

function startDailyNotifications(bot) {
  // Ogni giorno alle 08:00 Europe/Rome (ora italiana)
  cron.schedule('0 8 * * *', async () => {
    logger.info('Esecuzione schedulata: invio notifiche giornaliere (Europe/Rome)');
    await dailySummary(bot);
  }, {
    timezone: 'Europe/Rome'
  });
}

module.exports = { startDailyNotifications };
