// src/commands/index.js
// Register all command handlers for the bot

const addReminder = require('./addReminder');
const listReminders = require('./listReminders');
const deleteReminder = require('./deleteReminder');

module.exports = (bot) => {
  addReminder(bot);
  listReminders(bot);
  deleteReminder(bot);
};
