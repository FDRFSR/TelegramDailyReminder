// src/services/userService.js
// Gestione utente avanzata: timezone, lingua, cancellazione dati
// TODO: Implementare set/get timezone, set/get lingua, delete user data

module.exports = {
  setUserTimezone: async (userId, timezone) => {
    // TODO: Salva la timezone preferita dell'utente su DB
  },
  getUserTimezone: async (userId) => {
    // TODO: Recupera la timezone preferita dell'utente dal DB
    return 'Europe/Rome';
  },
  deleteUserData: async (userId) => {
    // TODO: Cancella tutti i dati utente dal DB
  }
};
