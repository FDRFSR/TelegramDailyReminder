# Telegram Daily Reminder Bot

A simple Telegram bot to manage daily tasks with inline and reply keyboard buttons. Built with [Telegraf](https://telegraf.js.org/) and ready for deployment on Railway.

## Features
- Add, view, complete, and prioritize tasks
- Inline buttons for complete and priority (⭐/🌟)
- Prioritized tasks are always shown at the top of the list
- Persistent reply keyboard for quick access
- Automatic deletion of bot messages after 10 minutes (tasks remain until completed)
- **Automatic reminder:** every 30 minutes (except between 22:00 and 08:00), the bot sends a reminder with your active tasks

## Usage
- **/start**: Shows the main menu with reply keyboard
- **➕ Crea Task**: Add a new task
- **📋 Visualizza Lista**: View your current tasks
- **Click on a task**: Mark as completed and remove from the list
- **⭐/🌟**: Mark/unmark a task as priority (priority tasks are shown first)
- **/annulla**: Cancel current operation

## Deploy on Railway
1. Clone this repository
2. Set the environment variable `TELEGRAM_BOT_TOKEN` with your bot token
3. Deploy with Railway (Node.js project, entrypoint: `bot.js`)

## Environment Variables
- `TELEGRAM_BOT_TOKEN` (required): Your Telegram bot token

## Run Locally
```bash
npm install
TELEGRAM_BOT_TOKEN=your_token node bot.js
```

## Notes
- All tasks are stored in memory (per user). No database is required.
- All bot messages are deleted after 10 minutes for privacy/cleanliness.
- The reply keyboard is always visible for quick actions.
- Reminders are not sent between 22:00 and 08:00.

---

Made with ❤️ using Telegraf.js
