// Migliorato: gestione errori, struttura funzioni, commenti best practice
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const constants = require('./config/constants');
const TaskService = require('./services/taskService');
const taskService = new TaskService();

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Errore: la variabile d'ambiente TELEGRAM_BOT_TOKEN non è impostata.");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
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
  replyAndTrack(ctx, '👋 Benvenuto! Usa i tasti qui sotto per gestire le tue task. Buona produttività!', mainMenuKeyboard());
});

bot.hears('➕ Crea Task', (ctx) => {
  userStates[ctx.from.id] = 'AWAITING_TASK';
  replyAndTrack(ctx, '✍️ Scrivi la task da aggiungere oppure /annulla per tornare al menu.', mainMenuKeyboard());
});

bot.hears('📋 Visualizza Lista', (ctx) => {
  const userId = ctx.from.id;
  let userTasks = taskService.getTaskList(userId);
  if (!Array.isArray(userTasks) || userTasks.length === 0) {
    replyAndTrack(ctx, '🎉 Nessuna task attiva! Goditi il tuo tempo libero.', mainMenuKeyboard());
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
  replyAndTrack(ctx, '❌ Operazione annullata. Sei tornato al menu principale.', mainMenu());
});

bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  if (userStates[userId] !== 'AWAITING_TASK') return;
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) {
    replyAndTrack(ctx, '⚠️ La task non può essere vuota. Riprova o usa /annulla.');
    return;
  }
  if (text.length > constants.MAX_TASK_LENGTH) {
    replyAndTrack(ctx, `⚠️ La task è troppo lunga (max ${constants.MAX_TASK_LENGTH} caratteri).`);
    return;
  }
  taskService.addTask(ctx.from.id, text);
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, '✅ Task aggiunta con successo! Continua così!', mainMenu());
});

bot.action('SHOW_LIST', (ctx) => {
  const userId = ctx.from.id;
  let userTasks = taskService.getTaskList(userId);
  if (!Array.isArray(userTasks) || userTasks.length === 0) {
    replyAndTrack(ctx, '🎉 Nessuna task attiva! Goditi il tuo tempo libero.', mainMenu());
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
  replyAndTrack(ctx, '🔙 Tornato al menu principale.', mainMenu());
});

bot.action(/COMPLETE_(.+)/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  let userTasks = taskService.getTaskList(userId);
  if (!Array.isArray(userTasks) || userTasks.length === 0) {
    await replyAndTrack(ctx, '🎉 Nessuna task attiva! Goditi il tuo tempo libero.', mainMenu());
    return;
  }
  // Remove the completed task
  taskService.removeTask(userId, taskId);
  userTasks = taskService.getTaskList(userId);
  try {
    await ctx.answerCbQuery('🗑️ Task eliminata! Una in meno da fare.');
  } catch (e) {}
  // Refresh list and handle empty case
  userTasks = sortTasks(userTasks);
  if (userTasks.length === 0) {
    try {
      await ctx.editMessageText('🎉 Nessuna task attiva! Goditi il tuo tempo libero.', mainMenu());
    } catch (e) {
      replyAndTrack(ctx, '🎉 Nessuna task attiva! Goditi il tuo tempo libero.', mainMenu());
    }
  } else {
    try {
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(taskButtons(userTasks)).reply_markup);
    } catch (e) {
      replyAndTrack(ctx, 'Le tue task:', Markup.inlineKeyboard(taskButtons(userTasks)));
    }
  }
});

bot.action(/PRIORITY_(.+)/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  taskService.togglePriority(userId, taskId);
  try {
    await ctx.answerCbQuery('🌟 Task marcata come prioritaria!');
  } catch (e) {}
  // Refresh lista
  let userTasks = taskService.getTaskList(userId);
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

function truncateText(text, maxLength = 30) {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function taskButtons(userTasks) {
  return userTasks.map(task => [
    Markup.button.callback(`${task.priority ? '🌟' : '⭐'} ${truncateText(task.text)}`, `DELETE_CONFIRM_${task.id}`),
    Markup.button.callback(task.priority ? '⬇️' : '⬆️', `PRIORITY_${task.id}`)
  ]);
}

bot.action(/DELETE_CONFIRM_(.+)/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  const userTasks = taskService.getTaskList(userId);
  const task = userTasks.find(t => t.id === taskId);
  if (!task) {
    await ctx.answerCbQuery('Task non trovata.');
    return;
  }
  await ctx.editMessageText(
    `Sei sicuro di voler eliminare questa task?\n\n${truncateText(task.text, 50)}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Sì', `COMPLETE_${taskId}`)],
      [Markup.button.callback('❌ No', 'CANCEL_DELETE')]
    ])
  );
});

bot.action('CANCEL_DELETE', async (ctx) => {
  // Refresh la lista task
  const userId = ctx.from.id;
  let userTasks = taskService.getTaskList(userId);
  userTasks = sortTasks(userTasks);
  await ctx.editMessageText('Le tue task:', Markup.inlineKeyboard(taskButtons(userTasks)));
});

/**
 * Send reminders every 30 minutes except 22-08
 */
function sendReminders() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= constants.QUIET_HOURS.start || hour < constants.QUIET_HOURS.end) return;
  for (const userId in taskService.tasks) {
    const userTasks = taskService.getTaskList(userId);
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
