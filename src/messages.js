// src/messages.js
// Centralized user-facing messages for i18n and DRY

module.exports = {
  onboarding: `👋 <b>Benvenuto su <i>Daily Reminder Bot</i>!</b>\n\nCon questo bot puoi gestire i tuoi promemoria giornalieri sia <b>personali</b> che <b>lavorativi</b>.\n\n📋 <b>Comandi principali:</b>\n• <b>/add</b> <i>ora</i> <i>testo</i> [categoria] — aggiungi un promemoria\n• <b>/list</b> — visualizza i tuoi promemoria\n• <b>/delete</b> <i>id|testo</i> — elimina un promemoria\n\n⏰ <b>Ogni mattina riceverai un riepilogo delle cose da fare!</b>\n\nℹ️ Per assistenza digita <b>/help</b>.`,
  errorInternal: '❌ Errore interno. Riprova più tardi.',
  callbackInvalid: '❌ Callback non valida.',
  reminderNotFound: '❌ Promemoria non trovato o già completato.',
  reminderDeleted: '🗑️ Promemoria eliminato!',
  reminderDone: '✅ Segnato come fatto!',
  actionUnknown: 'Azione non riconosciuta.',
  pleaseWait: '⏳ Attendi...'
};
