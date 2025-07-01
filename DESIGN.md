# Design Document: Telegram Daily Reminder Bot

> **Nota:** Questo documento è in continua evoluzione e può essere espanso o aggiornato durante lo sviluppo del progetto.

## Sommario
1. Overview
2. Goals
3. Architecture
4. Features
5. Suggested Enhancements
6. Security & Privacy
7. Deployment on Railway
8. Example User Flow
9. Tech Stack
10. Project Structure and Organization
11. User Experience (UX)
12. Error Handling & Logging
13. Scalabilità e Performance
14. Internazionalizzazione (i18n)
15. Backup e Disaster Recovery
16. API e Integrazioni
17. Onboarding e Offboarding
18. Testing e CI/CD
19. Accessibilità
20. Ottimizzazioni e Best Practice Aggiuntive

## Overview

The Telegram Daily Reminder Bot is a productivity tool designed to help users manage daily tasks and reminders for both personal and work-related activities. The bot will interact with users via Telegram, allowing them to add, view, and manage reminders. The application will be deployed on Railway for easy cloud hosting and scalability.

## Goals
- Provide a simple interface for users to add, view, and delete daily reminders.
- Support categorization of reminders (e.g., personal, work).
- Send daily notifications to users with their scheduled tasks.
- Ensure reliability and ease of deployment via Railway.

## Architecture
- **Bot Platform:** Telegram Bot API
- **Backend:** Node.js (suggested for easy integration with Telegram and Railway)
- **Database:** PostgreSQL (managed by Railway, for storing reminders and user data)
- **Deployment:** Railway (for CI/CD and hosting)

## Features
1. **User Registration:**
   - Users start interacting with the bot via /start.
   - User data is stored in the database.

2. **Add Reminder:**
   - Users can add reminders specifying time, description, and category (personal/work).
   - Example: `/add 08:00 Meeting with team [work]`
   - **Inline Buttons:** After adding, the bot shows buttons to edit, delete, or mark as done.

3. **View Reminders:**
   - Users can view today's reminders or all upcoming reminders.
   - Example: `/today` or `/list`
   - **Inline Buttons:** Each reminder is shown with buttons for "Mark as Done", "Edit", and "Delete".

4. **Delete Reminder:**
   - Users can delete reminders by ID or description, or by pressing the delete button next to each reminder.
   - Example: `/delete 3` or `/delete Meeting with team`

5. **Daily Notification:**
   - The bot sends a daily message every morning with a summary of all reminders scheduled for that day, at a user-defined time (default: 08:00).
   - The summary includes both personal and work tasks, clearly separated or labeled.
   - **Uncompleted Tasks:** The daily message also includes reminders from previous days that have not been marked as completed, helping users not to forget overdue tasks.
   - **Inline Buttons:** Daily notification includes buttons to mark tasks as done directly from the notification.

6. **Categories:**
   - Reminders can be tagged as personal or work for better organization.
   - **Inline Buttons:** Filter reminders by category using buttons.

7. **Time Zone Support:**
   - Users can set their time zone for accurate notifications.

## Suggested Enhancements
- **Recurring Reminders:** Allow users to set reminders that repeat daily, weekly, etc.
- **Inline Buttons:** Use Telegram's inline buttons for easier management (e.g., mark as done, delete, edit, filter by category).
- **Multi-language Support:** Add support for multiple languages.
- **Web Dashboard:** Optional web interface for advanced management.

## Security & Privacy
- Store only necessary user data.
- Do not share user data with third parties.
- Allow users to delete their data via a command.

## Deployment on Railway
- Use Railway's PostgreSQL plugin for database.
- Set environment variables for Telegram Bot Token and DB credentials.
- Use Railway's CI/CD for automatic deployment on push.

## Example User Flow
1. User starts bot: `/start`
2. Adds a reminder: `/add 09:00 Call with client [work]`
3. Receives daily notification at 08:00 with all reminders for the day.
4. Views all reminders: `/list`
5. Deletes a reminder: `/delete 1`

## Tech Stack
- Node.js (or Python if preferred)
- Telegraf.js (Telegram Bot framework for Node.js)
- PostgreSQL
- Railway

## Project Structure and Organization

To ensure maintainability and scalability, the project should be organized in a modular way, separating concerns and responsibilities into different files and folders. Below is a suggested structure:

```
/ (root)
│
├── src/
│   ├── bot.js / bot.ts            # Main entry point for the Telegram bot (scegli .js o .ts a seconda del linguaggio)
│   ├── commands/                  # Handlers for bot commands (e.g., add, list, delete)
│   │   ├── addReminder.js
│   │   ├── listReminders.js
│   │   ├── deleteReminder.js
│   │   └── ...
│   ├── notifications/             # Logic for daily and scheduled notifications
│   │   └── dailySummary.js
│   ├── services/                  # Business logic (reminder management, calendar sync, etc.)
│   │   ├── reminderService.js
│   │   ├── calendarService.js
│   │   └── ...
│   ├── models/                    # Database models and schemas
│   │   └── reminder.js
│   ├── db/                        # Database connection and migration scripts
│   │   └── index.js
│   ├── utils/                     # Utility functions (date parsing, formatting, etc.)
│   │   └── ...
│   └── config/                    # Configuration files (env, constants)
│       └── index.js
│
├── tests/                         # Automated tests
│   └── ...
├── .env                           # Environment variables (not committed)
├── package.json                   # Project metadata and dependencies
└── README.md                      # Project documentation
```

**Key Points:**
- Separating commands, services, and models makes the codebase easier to maintain and extend.
- Notification logic is isolated for clarity and future enhancements.
- Calendar integrations (Google/Outlook) should be in dedicated service files.
- Utility functions and configuration are kept modular.
- Tests are in a dedicated folder to encourage TDD/BDD.

**Nota:** Tutti i file possono essere in formato .js o .ts a seconda della scelta del linguaggio.

---

**Suggestions:**
- Consider adding a "snooze" feature for reminders.
- Allow exporting reminders to Google Calendar.
- Add statistics (e.g., completed tasks per week).
- Add support for group chats: allow reminders to be shared or managed in group contexts (e.g., team tasks).
- Add voice message support: let users add reminders via voice.
- Add smart suggestions: propose tasks based on previous reminders or time of day.
- Add attachments: allow users to attach files or images to reminders.
- Add reminder templates: quick-add common tasks with one tap.
- Add notification customization: let users choose between silent, standard, or repeated notifications.
- Add integration with other productivity tools (e.g., Trello, Notion, Slack).
- Add integration with Outlook 365 Calendar: allow users to sync reminders with their Outlook calendar, import events as reminders, and receive notifications for Outlook events.
- Add integration with Google Calendar: allow users to sync reminders with Google Calendar, import events as reminders, and receive notifications for Google Calendar events.
- Add end-of-day summary: send a recap of completed and pending tasks.
- Add motivational quotes or productivity tips in the daily summary.

---

## User Experience (UX)
- Prevedere wireframe o mockup dei principali flussi (es. messaggio di riepilogo giornaliero con pulsanti).
- Descrivere i flussi di errore e i messaggi di feedback all’utente per input non validi o comandi errati.

## Error Handling & Logging
- Implementare un sistema di logging centralizzato per errori e attività rilevanti.
- Gestire errori di rete, database e API con messaggi chiari per l’utente e notifiche per l’amministratore.

## Security & Privacy (estesa)
- Gestire i token e le credenziali in modo sicuro tramite variabili d’ambiente.
- Applicare rate limiting per evitare abusi.
- Prevedere la cifratura dei dati sensibili se necessario.

## Scalabilità e Performance
- Progettare il sistema per gestire più utenti contemporanei (es. code per notifiche, query ottimizzate).
- Utilizzare cache per operazioni frequenti (es. promemoria giornalieri).

## Internazionalizzazione (i18n)
- Gestire la lingua utente e i file di traduzione per supportare più lingue.
- Prevedere la rilevazione automatica della lingua o la scelta manuale.

## Backup e Disaster Recovery
- Implementare backup automatici del database.
- Documentare le procedure di ripristino dati.

## API e Integrazioni
- Documentare le API usate (Telegram, Google Calendar, Outlook, ecc.) con esempi di payload e autenticazione.
- Prevedere webhook per ricevere notifiche in tempo reale da servizi esterni.

## Onboarding e Offboarding
- Descrivere il flusso di onboarding per nuovi utenti (es. messaggio di benvenuto, guida rapida).
- Prevedere la cancellazione definitiva dei dati su richiesta dell’utente.

## Testing e CI/CD
- Definire una strategia di testing: unit, integration, end-to-end.
- Documentare il flusso CI/CD su Railway (deploy automatico, rollback, branch policy).

## Accessibilità
- Garantire che i messaggi e i pulsanti siano accessibili anche a utenti con disabilità (es. compatibilità con screen reader).

## Ottimizzazioni e Best Practice Aggiuntive

- **Documentazione del Codice:**
  - Utilizzare commenti chiari e JSDoc/TSDoc per tutte le funzioni pubbliche e i moduli principali.
  - Mantenere aggiornato il README con esempi d’uso, configurazione e troubleshooting.

- **Gestione delle Dipendenze:**
  - Aggiornare regolarmente le dipendenze e utilizzare strumenti come `npm audit` o `yarn audit` per la sicurezza.
  - Bloccare le versioni delle dipendenze critiche per evitare breaking changes improvvisi.

- **Configurazione Avanzata:**
  - Separare le configurazioni per ambiente (sviluppo, test, produzione) tramite file `.env` multipli o variabili d’ambiente specifiche.
  - Prevedere la validazione delle variabili d’ambiente all’avvio dell’applicazione.

- **Monitoraggio e Alerting:**
  - Integrare strumenti di monitoring (es. Sentry, Prometheus, Grafana) per tracciare errori e performance.
  - Prevedere alert automatici in caso di errori critici o downtime.

- **Gestione delle Migrazioni Database:**
  - Utilizzare strumenti di migrazione (es. Sequelize, Knex, Prisma) per versionare e applicare modifiche allo schema del database in modo sicuro.

- **Policy di Conservazione Dati:**
  - Definire policy di retention per i dati vecchi o inutilizzati, con eventuale cancellazione automatica periodica.

- **Automazione e DevOps:**
  - Automatizzare i processi di linting, formattazione e test tramite pre-commit hook (es. Husky, lint-staged).
  - Prevedere workflow CI per la verifica automatica del codice su ogni pull request.

- **User Feedback e Analytics:**
  - Integrare strumenti per raccogliere feedback anonimo dagli utenti e analizzare l’utilizzo delle funzionalità principali.

- **Gestione delle Risorse e Costi Cloud:**
  - Monitorare l’utilizzo delle risorse su Railway e impostare alert per evitare costi imprevisti.

---

This document can be expanded as the project evolves.
