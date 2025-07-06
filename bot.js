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

bot.start((ctx) => {
  userStates[ctx.from.id] = null;
  ctx.reply('Benvenuto! Usa i tasti qui sotto per gestire le tue task:', mainMenu());
});

bot.action('CREATE_TASK', (ctx) => {
  userStates[ctx.from.id] = 'AWAITING_TASK';
  ctx.reply('Scrivi la task da aggiungere oppure /annulla per tornare al menu.');
});

bot.hears(/\/annulla/i, (ctx) => {
  userStates[ctx.from.id] = null;
  ctx.reply('Operazione annullata.', mainMenu());
});

bot.on('text', (ctx) => {
  if (userStates[ctx.from.id] !== 'AWAITING_TASK') return;
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) {
    ctx.reply('La task non può essere vuota. Riprova o usa /annulla.');
    return;
  }
  addTask(ctx.from.id, text);
  userStates[ctx.from.id] = null;
  ctx.reply('Task aggiunta!', mainMenu());
});

bot.action('SHOW_LIST', (ctx) => {
  const userId = ctx.from.id;
  const userTasks = getTaskList(userId);
  if (userTasks.length === 0) {
    ctx.reply('Nessuna task trovata.', mainMenu());
    return;
  }
  const buttons = userTasks.map(task => [
    Markup.button.callback(
      `${task.completed ? '✅' : '⬜️'} ${task.text}`,
      `COMPLETE_${task.id}`
    )
  ]);
  ctx.reply('Le tue task:', Markup.inlineKeyboard(buttons));
});

bot.action(/COMPLETE_(.+)/, (ctx) => {
  const taskId = ctx.match[1];
  toggleTask(ctx.from.id, taskId);
  ctx.answerCbQuery('Task aggiornata!');
  // Refresh list
  const userTasks = getTaskList(ctx.from.id);
  const buttons = userTasks.map(task => [
    Markup.button.callback(
      `${task.completed ? '✅' : '⬜️'} ${task.text}`,
      `COMPLETE_${task.id}`
    )
  ]);
  ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup);
});

bot.launch().catch((err) => {
  console.error('Errore durante l\'avvio del bot:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
