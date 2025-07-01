// src/i18n/index.js
// Stub per internazionalizzazione (i18n)
// TODO: Implementare rilevamento lingua utente, caricamento file di traduzione, middleware Telegraf

module.exports = {
  t: (key, lang = 'it', vars = {}) => {
    // TODO: Restituire la stringa tradotta dal file di lingua
    return key;
  },
  setUserLanguage: async (userId, lang) => {
    // TODO: Salvare la lingua preferita dell'utente su DB
  },
  getUserLanguage: async (userId) => {
    // TODO: Recuperare la lingua preferita dell'utente dal DB
    return 'it';
  }
};
