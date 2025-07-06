// Migliorato: gestione errori, struttura funzioni, commenti best practice
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const constants = require('./config/constants');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Errore: la variabile d'ambiente TELEGRAM_BOT_TOKEN non è impostata.");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const tasks = Object.create(null); // più sicuro di {}
const userStates = Object.create(null);

// Salva i messaggi inviati per ogni utente
const sentMessages = Object.create(null); // { userId: [messageId, ...] }

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Crea Task', 'CREATE_TASK')],
    [Markup.button.callback('📋 Visualizza Lista', 'SHOW_LIST')]
  ]);
}

/**
 * Main menu reply keyboard
 * @returns {Markup.Markup}
 */
function mainMenuKeyboard() {
  return Markup.keyboard([
    ['➕ Crea Task', '📋 Visualizza Lista']
  ]).resize().oneTime(false);
}

/**
 * Get the user's task list
 * @param {number|string} userId
 * @returns {Array}
 */
function getTaskList(userId) {
  return Array.isArray(tasks[userId]) ? tasks[userId] : [];
}

/**
 * Add a new task for a user
 * @param {number|string} userId
 * @param {string} text
 */
function addTask(userId, text) {
  if (!Array.isArray(tasks[userId])) tasks[userId] = [];
  const id = Date.now().toString();
  tasks[userId].push({ id, text, completed: false, priority: false });
}

/**
 * Toggle priority for a task
 * @param {number|string} userId
 * @param {string} taskId
 */
function togglePriority(userId, taskId) {
  const userTasks = getTaskList(userId);
  const task = userTasks.find(t => t.id === taskId);
  if (task) task.priority = !task.priority;
}

function toggleTask(userId, taskId) {
  const userTasks = getTaskList(userId);
  const task = userTasks.find(t => t.id === taskId);
  if (task) task.completed = !task.completed;
}

/**
 * Utility: sort tasks (priority first)
 * @param {Array} tasks
 * @returns {Array}
 */
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
}

/**
 * Utility: generate inline buttons for task list
 * @param {Array} userTasks
 * @returns {Array}
 */
function taskButtons(userTasks) {
  return userTasks.map(task => [
    Markup.button.callback(`${task.priority ? '🌟' : '⭐'} ${task.text}`, `COMPLETE_${task.id}`),
    Markup.button.callback(task.priority ? '⬇️' : '⬆️', `PRIORITY_${task.id}`)
  ]);
}

/**
 * Track sent messages for later deletion
 * @param {import('telegraf').Context} ctx
 * @param {Promise} replyPromise
 */
async function trackMessage(ctx, replyPromise) {
  try {
    const userId = ctx.from.id;
    const msg = await replyPromise;
    if (!sentMessages[userId]) sentMessages[userId] = [];
    sentMessages[userId].push({ id: msg.message_id, date: Date.now(), chatId: msg.chat.id, chatType: msg.chat.type });
  } catch (e) {
    console.error('Error tracking message:', e);
  }
}

/**
 * Consistent reply and track function
 */
function replyAndTrack(ctx, ...args) {
  return trackMessage(ctx, ctx.reply(...args));
}

/**
 * Clean up old messages (opt: batch delete, memory cleanup)
 */
async function cleanOldMessages() {
  const now = Date.now();
  const tenMinutes = constants.MESSAGE_LIFETIME;
  for (const userId in sentMessages) {
    if (!Array.isArray(sentMessages[userId]) || sentMessages[userId].length === 0) {
      delete sentMessages[userId];
      continue;
    }
    // Only keep messages < 10min old
    const userMsgs = sentMessages[userId];
    const toDelete = [];
    let keep = [];
    for (const m of userMsgs) {
      if (now - m.date >= tenMinutes) toDelete.push(m);
      else keep.push(m);
    }
    sentMessages[userId] = keep;
    for (const msg of toDelete) {
      try {
        await bot.telegram.deleteMessage(msg.chatId, msg.id);
      } catch (e) {
        // Ignore errors (already deleted, etc.)
      }
    }
    if (sentMessages[userId].length === 0) delete sentMessages[userId];
  }
}

setInterval(cleanOldMessages, constants.CLEANUP_INTERVAL);

// --- BOT HANDLERS ---

bot.start((ctx) => {
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, 'Benvenuto! Usa i tasti qui sotto per gestire le tue task:', mainMenuKeyboard());
});

bot.hears('➕ Crea Task', (ctx) => {
  userStates[ctx.from.id] = 'AWAITING_TASK';
  replyAndTrack(ctx, 'Scrivi la task da aggiungere oppure /annulla per tornare al menu.', mainMenuKeyboard());
});

bot.hears('📋 Visualizza Lista', (ctx) => {
  const userId = ctx.from.id;
  let userTasks = getTaskList(userId);
  if (!Array.isArray(userTasks) || userTasks.length === 0) {
    replyAndTrack(ctx, 'Nessuna task trovata.', mainMenuKeyboard());
    return;
  }
  userTasks = sortTasks(userTasks);
  replyAndTrack(ctx, 'Le tue task:', Markup.inlineKeyboard(taskButtons(userTasks)));
});

bot.action('CREATE_TASK', (ctx) => {
  userStates[ctx.from.id] = 'AWAITING_TASK';
  replyAndTrack(ctx, 'Scrivi la task da aggiungere oppure /annulla per tornare al menu.');
});

bot.hears(/\/annulla/i, (ctx) => {
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, 'Operazione annullata.', mainMenu());
});

bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  if (userStates[userId] !== 'AWAITING_TASK') return;
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) {
    replyAndTrack(ctx, 'La task non può essere vuota. Riprova o usa /annulla.');
    return;
  }
  if (text.length > constants.MAX_TASK_LENGTH) {
    replyAndTrack(ctx, `La task è troppo lunga (max ${constants.MAX_TASK_LENGTH} caratteri).`);
    return;
  }
  addTask(ctx.from.id, text);
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, 'Task aggiunta!', mainMenu());
});

bot.action('SHOW_LIST', (ctx) => {
  const userId = ctx.from.id;
  let userTasks = getTaskList(userId);
  if (!Array.isArray(userTasks) || userTasks.length === 0) {
    replyAndTrack(ctx, 'Nessuna task trovata.', mainMenu());
    return;
  }
  userTasks = sortTasks(userTasks);
  const buttons = taskButtons(userTasks);
  buttons.push([
    Markup.button.callback('➕ Nuova Task', 'CREATE_TASK'),
    Markup.button.callback('🔙 Menu', 'BACK_TO_MENU')
  ]);
  replyAndTrack(ctx, 'Le tue task:', Markup.inlineKeyboard(buttons));
});

bot.action('BACK_TO_MENU', (ctx) => {
  replyAndTrack(ctx, 'Tornato al menu principale.', mainMenu());
});

bot.action(/COMPLETE_(.+)/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  let userTasks = getTaskList(userId);
  if (!Array.isArray(userTasks) || userTasks.length === 0) {
    await replyAndTrack(ctx, 'Nessuna task trovata.', mainMenu());
    return;
  }
  // Remove the completed task
  userTasks = userTasks.filter(task => task.id !== taskId);
  tasks[userId] = userTasks;
  try {
    await ctx.answerCbQuery('Task completata e rimossa!');
  } catch (e) {}
  // Refresh list and handle empty case
  userTasks = sortTasks(userTasks);
  if (userTasks.length === 0) {
    try {
      await ctx.editMessageText('Nessuna task trovata.', mainMenu());
    } catch (e) {
      // fallback: send new message if edit fails
      replyAndTrack(ctx, 'Nessuna task trovata.', mainMenu());
    }
  } else {
    try {
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(taskButtons(userTasks)).reply_markup);
    } catch (e) {
      // fallback: send new message if edit fails
      replyAndTrack(ctx, 'Le tue task:', Markup.inlineKeyboard(taskButtons(userTasks)));
    }
  }
});

bot.action(/PRIORITY_(.+)/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  togglePriority(userId, taskId);
  try {
    await ctx.answerCbQuery('Priorità aggiornata!');
  } catch (e) {}
  // Refresh lista
  let userTasks = getTaskList(userId);
  userTasks = sortTasks(userTasks);
  const buttons = taskButtons(userTasks);
  if (ctx.update.callback_query.message.reply_markup.inline_keyboard.some(row => row.some(btn => btn.text === '➕ Nuova Task'))) {
    buttons.push([
      Markup.button.callback('➕ Nuova Task', 'CREATE_TASK'),
      Markup.button.callback('🔙 Menu', 'BACK_TO_MENU')
    ]);
  }
  try {
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup);
  } catch (e) {
    replyAndTrack(ctx, 'Le tue task:', Markup.inlineKeyboard(buttons));
  }
});

/**
 * Send reminders every 30 minutes except 22-08
 */
function sendReminders() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= constants.QUIET_HOURS.start || hour < constants.QUIET_HOURS.end) return;
  for (const userId in tasks) {
    const userTasks = getTaskList(userId);
    if (userTasks.length > 0) {
      bot.telegram.sendMessage(
        userId,
        '⏰ Reminder! Hai ancora queste task da completare:\n' +
          sortTasks(userTasks).map(t => `${t.priority ? '🌟' : '⭐'} ${t.text}`).join('\n'),
        mainMenuKeyboard()
      ).catch(() => {});
    }
  }
}
setInterval(sendReminders, constants.REMINDER_INTERVAL);

bot.launch().then(() => {
  console.log('✅ Bot started and listening for updates!');
}).catch((err) => {
  console.error('Errore durante l\'avvio del bot:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
