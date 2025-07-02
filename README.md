# Telegram Daily Reminder Bot

A modern Telegram bot for managing daily personal and work reminders, with PostgreSQL storage, automatic daily notifications, inline buttons, onboarding, logging, persistent user sessions, and a simple UX.

## Features
- **Onboarding**: Welcome message with inline buttons to create work/personal reminders or view the list.
- **Reminder Creation**: Guided flow—choose category, then enter reminder text (no date/time required).
- **List Reminders**: View all reminders with a single "Complete" button for each (removes the reminder).
- **Automatic Daily Notifications**: Every morning at 08:00 (Europe/Rome), users receive a summary of their pending reminders.
- **PostgreSQL Storage**: All reminders and user data are stored securely.
- **Logging**: Centralized logging for errors and key events.
- **Session Management**: Persistent user session for a smooth experience.
- **Extensible**: Modular structure for easy feature expansion (recurring reminders, calendar integration, etc.).

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/FDRFSR/telegramdailyreminder.git
   cd telegramdailyreminder
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Configure environment variables**
   - Copy `.env.example` to `.env` and fill in your `BOT_TOKEN` and `DATABASE_URL`.
4. **Run database migrations**
   - Migrations run automatically on startup.
5. **Start the bot**
   ```bash
   npm start
   ```

## Usage
- **/start**: Onboarding, shows main menu with buttons.
- **/add**: Guided reminder creation (choose category, then enter text).
- **/list**: Shows all reminders with "Complete" button.
- **/stats**: View statistics (completed, pending, last 7 days).
- **/gcal_auth**: (Stub) Google Calendar authentication.
- **/gcal_sync**: (Stub) Google Calendar sync.

## Project Structure
```
├── src/
│   ├── bot.js                # Main entry point
│   ├── commands/             # Command handlers
│   ├── handlers/             # Callback handlers
│   ├── notifications/        # Daily notification logic
│   ├── services/             # Business logic (reminders, sessions, etc.)
│   ├── db/                   # DB connection
│   ├── utils/                # Utilities
│   ├── messages.js           # Centralized user messages
│   └── ...
├── db/migrations/            # SQL migration scripts
├── package.json
├── .env.example
└── README.md
```

## Deployment
- Designed for Railway, but works on any Node.js + PostgreSQL environment.
- Set `BOT_TOKEN` and `DATABASE_URL` in your environment.

## Extending
- Add new features in the `services/` or `commands/` folders.
- See `DESIGN.md` for architecture and suggestions.

## License
MIT
