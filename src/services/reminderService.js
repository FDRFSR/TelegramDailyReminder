// src/services/reminderService.js
// Business logic for managing reminders

module.exports = {
  // Crea un nuovo promemoria (mock, da implementare con DB)
  async createReminder(userId, time, text, category) {
    // TODO: inserire nel DB
    return { id: 1, userId, time, text, category, completed: false };
  },
  // Lista promemoria (mock)
  async listReminders(userId) {
    // TODO: fetch dal DB
    return [
      { id: 1, time: '08:00', text: 'Riunione con team', category: 'work', completed: false },
      { id: 2, time: '12:00', text: 'Pranzo', category: 'personal', completed: false }
    ];
  },
  // Elimina promemoria (mock)
  async deleteReminder(userId, idOrText) {
    // TODO: elimina dal DB
    return true;
  },
  // Segna come completato (mock)
  async markAsDone(userId, id) {
    // TODO: update DB
    return true;
  },
  // Ottieni promemoria scaduti/non completati (mock)
  async getOverdueReminders(userId) {
    // TODO: fetch dal DB
    return [];
  }
};
