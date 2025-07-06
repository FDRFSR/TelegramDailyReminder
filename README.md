# Telegram Daily Reminder Bot

A simple Telegram bot to manage daily tasks with inline and reply keyboard buttons. Built with [Telegraf](https://telegraf.js.org/) and ready for deployment on Railway.

## Features
- Add tasks with a button or command
- View your personal task list
- Complete (and remove) tasks by clicking on them
- Inline buttons for task actions
- Persistent reply keyboard for quick access
- Automatic deletion of bot messages after 10 minutes (tasks remain until completed)

## Usage
- **/start**: Shows the main menu with reply keyboard
- **➕ Crea Task**: Add a new task
- **📋 Visualizza Lista**: View your current tasks
- **Click on a task**: Mark as completed and remove from the list
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

---

Made with ❤️ using Telegraf.js
