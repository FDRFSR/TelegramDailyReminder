-- db/migrations/004_alter_user_sessions_pk_composite.sql
-- Rimuove la PK solo su user_id e la sostituisce con una PK composta (user_id, message_id)
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_pkey;
ALTER TABLE user_sessions ADD PRIMARY KEY (user_id, message_id);
-- NOTA: message_id deve essere NOT NULL per essere PK, quindi aggiorniamo i valori NULL a '' temporaneamente
UPDATE user_sessions SET message_id = '' WHERE message_id IS NULL;
ALTER TABLE user_sessions ALTER COLUMN message_id SET NOT NULL;
