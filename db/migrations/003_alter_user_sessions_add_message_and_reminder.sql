-- db/migrations/003_alter_user_sessions_add_message_and_reminder.sql
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS reminder_id INTEGER;
-- Aggiunge colonne per tracking messaggi e reminder associati alle sessioni utente
-- message_id: id del messaggio Telegram
-- reminder_id: id della task/reminder (può essere NULL)
-- NOTA: message_id e reminder_id non sono chiavi primarie, ma possono essere usate per mapping temporaneo
