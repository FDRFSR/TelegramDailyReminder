// src/notifications/scheduler.js
// Scheduler per notifiche giornaliere automatiche
// TODO: Usare node-cron o simili per inviare riepilogo ogni mattina

const cron = require('node-cron');
const dailySummary = require('./dailySummary');
const { getDb } = require('../db');
const logger = require('../utils/logger');

function startDailyNotifications(bot) {
  // TODO: Recuperare tutti gli utenti e la loro timezone/orario preferito
  // Esempio: ogni minuto per test, ogni giorno alle 08:00 reale in produzione
  cron.schedule('* * * * *', async () => {
    logger.info('Esecuzione schedulata: invio notifiche giornaliere');
    // TODO: Per ogni utente, invia il riepilogo usando dailySummary
  });
}

module.exports = { startDailyNotifications };
