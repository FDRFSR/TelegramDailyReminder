// Migliorato: gestione errori, struttura funzioni, commenti best practice
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

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

function getTaskList(userId) {
  return Array.isArray(tasks[userId]) ? tasks[userId] : [];
}

function addTask(userId, text) {
  if (!Array.isArray(tasks[userId])) tasks[userId] = [];
  const id = Date.now().toString();
  tasks[userId].push({ id, text, completed: false });
}

function toggleTask(userId, taskId) {
  const userTasks = getTaskList(userId);
  const task = userTasks.find(t => t.id === taskId);
  if (task) task.completed = !task.completed;
}

// Funzione per cancellare le task vecchie di 10 minuti
function cleanOldTasks() {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  for (const userId in tasks) {
    if (Array.isArray(tasks[userId])) {
      tasks[userId] = tasks[userId].filter(task => now - Number(task.id) < tenMinutes);
    }
  }
}

// Funzione per registrare i messaggi inviati
async function trackMessage(ctx, replyPromise) {
  const userId = ctx.from.id;
  const msg = await replyPromise;
  if (!sentMessages[userId]) sentMessages[userId] = [];
  sentMessages[userId].push({ id: msg.message_id, date: Date.now(), chatId: msg.chat.id });
}

// Funzione per cancellare i messaggi vecchi di 10 minuti
async function cleanOldMessages() {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  for (const userId in sentMessages) {
    const userMsgs = sentMessages[userId] || [];
    const toDelete = userMsgs.filter(m => now - m.date >= tenMinutes);
    sentMessages[userId] = userMsgs.filter(m => now - m.date < tenMinutes);
    for (const msg of toDelete) {
      try {
        await bot.telegram.deleteMessage(msg.chatId, msg.id);
      } catch (e) {
        // Ignora errori se il messaggio è già stato cancellato
      }
    }
  }
}

// Avvia la pulizia automatica ogni 10 minuti
setInterval(cleanOldTasks, 10 * 60 * 1000);
setInterval(cleanOldMessages, 10 * 60 * 1000);

// Modifica tutte le risposte ctx.reply per essere tracciate
function replyAndTrack(ctx, ...args) {
  return trackMessage(ctx, ctx.reply(...args));
}

bot.start((ctx) => {
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, 'Benvenuto! Usa i tasti qui sotto per gestire le tue task:', mainMenu());
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
  if (userStates[ctx.from.id] !== 'AWAITING_TASK') return;
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) {
    replyAndTrack(ctx, 'La task non può essere vuota. Riprova o usa /annulla.');
    return;
  }
  addTask(ctx.from.id, text);
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, 'Task aggiunta!', mainMenu());
});

bot.action('SHOW_LIST', (ctx) => {
  const userId = ctx.from.id;
  const userTasks = getTaskList(userId);
  if (userTasks.length === 0) {
    replyAndTrack(ctx, 'Nessuna task trovata.', mainMenu());
    return;
  }
  const buttons = userTasks.map(task => [
    Markup.button.callback(
      `${task.completed ? '✅' : '⬜️'} ${task.text}`,
      `COMPLETE_${task.id}`
    )
  ]);
  replyAndTrack(ctx, 'Le tue task:', Markup.inlineKeyboard(buttons));
});

bot.action(/COMPLETE_(.+)/, (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  let userTasks = getTaskList(userId);
  // Rimuovi la task completata
  userTasks = userTasks.filter(task => task.id !== taskId);
  tasks[userId] = userTasks;
  ctx.answerCbQuery('Task completata e rimossa!');
  // Refresh list
  const buttons = userTasks.map(task => [
    Markup.button.callback(
      `${task.completed ? '✅' : '⬜️'} ${task.text}`,
      `COMPLETE_${task.id}`
    )
  ]);
  if (userTasks.length === 0) {
    ctx.editMessageText('Nessuna task trovata.', mainMenu());
  } else {
    ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup);
  }
});

bot.launch().catch((err) => {
  console.error('Errore durante l\'avvio del bot:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
