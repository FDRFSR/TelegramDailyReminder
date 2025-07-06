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

function mainMenuKeyboard() {
  return Markup.keyboard([
    ['➕ Crea Task', '📋 Visualizza Lista']
  ]).resize().oneTime(false);
}

function getTaskList(userId) {
  return Array.isArray(tasks[userId]) ? tasks[userId] : [];
}

function addTask(userId, text) {
  if (!userId || !text) return false;
  if (!Array.isArray(tasks[userId])) tasks[userId] = [];
  
  // Limite massimo di task per utente (prevenire abuso)
  if (tasks[userId].length >= 50) {
    return false;
  }
  
  const id = Date.now().toString();
  const trimmedText = text.trim();
  
  // Evita task duplicate
  if (tasks[userId].some(task => task.text === trimmedText)) {
    return false;
  }
  
  tasks[userId].push({ id, text: trimmedText, completed: false, priority: false });
  return true;
}

// Cambia priorità
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

// Funzione per registrare i messaggi inviati (privati e gruppi)
async function trackMessage(ctx, replyPromise) {
  try {
    const userId = ctx.from.id;
    const msg = await replyPromise;
    if (!sentMessages[userId]) sentMessages[userId] = [];
    // Salva anche i messaggi privati (chat type 'private')
    sentMessages[userId].push({ id: msg.message_id, date: Date.now(), chatId: msg.chat.id, chatType: msg.chat.type });
    return msg;
  } catch (error) {
    console.error('Errore durante il tracking del messaggio:', error);
    throw error;
  }
}

// Funzione per cancellare i messaggi vecchi di 10 minuti (privati e gruppi)
async function cleanOldMessages() {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  for (const userId in sentMessages) {
    // Ottimizzazione: elimina direttamente se la lista è vuota
    if (!sentMessages[userId] || sentMessages[userId].length === 0) {
      delete sentMessages[userId];
      continue;
    }
    const userMsgs = sentMessages[userId];
    const toDelete = userMsgs.filter(m => now - m.date >= tenMinutes);
    sentMessages[userId] = userMsgs.filter(m => now - m.date < tenMinutes);
    for (const msg of toDelete) {
      try {
        await bot.telegram.deleteMessage(msg.chatId, msg.id);
      } catch (e) {
        // Log solo in debug
        // console.debug('Errore cancellazione messaggio:', e.message);
      }
    }
    // Se dopo la pulizia non ci sono più messaggi, elimina la chiave
    if (sentMessages[userId].length === 0) {
      delete sentMessages[userId];
    }
  }
}

// Avvia la pulizia automatica solo dei messaggi, non delle task
setInterval(cleanOldMessages, 60 * 1000);

// Modifica tutte le risposte ctx.reply per essere tracciate
function replyAndTrack(ctx, ...args) {
  try {
    return trackMessage(ctx, ctx.reply(...args));
  } catch (error) {
    console.error('Errore in replyAndTrack:', error);
    // Fallback al reply normale in caso di errore
    return ctx.reply(...args);
  }
}

bot.start((ctx) => {
  userStates[ctx.from.id] = null;
  replyAndTrack(ctx, 'Benvenuto! Usa i tasti qui sotto per gestire le tue task:', mainMenuKeyboard());
});

// Gestione tastiera personalizzata
bot.hears('➕ Crea Task', (ctx) => {
  userStates[ctx.from.id] = 'AWAITING_TASK';
  replyAndTrack(ctx, 'Scrivi la task da aggiungere oppure /annulla per tornare al menu.', mainMenuKeyboard());
});

bot.hears('📋 Visualizza Lista', (ctx) => {
  const userId = ctx.from.id;
  let userTasks = getTaskList(userId);
  if (userTasks.length === 0) {
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
  
  // Lunghezza massima task
  if (text.length > 100) {
    replyAndTrack(ctx, 'La task è troppo lunga (max 100 caratteri). Riprova o usa /annulla.');
    return;
  }
  
  const success = addTask(ctx.from.id, text);
  userStates[ctx.from.id] = null;
  
  if (success) {
    replyAndTrack(ctx, 'Task aggiunta!', mainMenu());
  } else {
    replyAndTrack(ctx, 'Errore: task duplicata o limite raggiunto (max 50 task). Riprova o usa /annulla.');
  }
});

bot.action('SHOW_LIST', (ctx) => {
  const userId = ctx.from.id;
  let userTasks = getTaskList(userId);
  if (userTasks.length === 0) {
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

bot.action(/COMPLETE_(.+)/, (ctx) => {
  try {
    const taskId = ctx.match[1];
    const userId = ctx.from.id;
    let userTasks = getTaskList(userId);
    
    // Verifica che la task esista
    if (!userTasks.some(task => task.id === taskId)) {
      ctx.answerCbQuery('Task non trovata.');
      return;
    }
    
    // Rimuovi la task completata
    userTasks = userTasks.filter(task => task.id !== taskId);
    tasks[userId] = userTasks;
    ctx.answerCbQuery('Task completata e rimossa!');
    
    // Refresh list
    userTasks = sortTasks(userTasks);
    const buttons = taskButtons(userTasks);
    
    // Check if the original message has the "➕ Nuova Task" button
    const hasNewTaskButton = ctx.update.callback_query.message.reply_markup?.inline_keyboard?.some(row => 
      row.some(btn => btn.text === '➕ Nuova Task')
    );
    
    if (userTasks.length === 0) {
      // If no tasks remain, show appropriate message with menu
      if (hasNewTaskButton) {
        ctx.editMessageText('Nessuna task trovata.', mainMenu());
      } else {
        ctx.editMessageText('Nessuna task trovata.');
      }
    } else {
      // If tasks remain, update the keyboard with tasks
      if (hasNewTaskButton) {
        buttons.push([
          Markup.button.callback('➕ Nuova Task', 'CREATE_TASK'),
          Markup.button.callback('🔙 Menu', 'BACK_TO_MENU')
        ]);
      }
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup);
    }
  } catch (error) {
    console.error('Errore completamento task:', error);
    ctx.answerCbQuery('Errore durante il completamento della task.');
  }
});

// Gestione priorità
bot.action(/PRIORITY_(.+)/, (ctx) => {
  try {
    const taskId = ctx.match[1];
    const userId = ctx.from.id;
    const userTasks = getTaskList(userId);
    
    // Verifica che la task esista
    if (!userTasks.some(task => task.id === taskId)) {
      ctx.answerCbQuery('Task non trovata.');
      return;
    }
    
    togglePriority(userId, taskId);
    ctx.answerCbQuery('Priorità aggiornata!');
    
    // Refresh lista
    const sortedTasks = sortTasks(getTaskList(userId));
    const buttons = taskButtons(sortedTasks);
    
    // Check if the original message has the "➕ Nuova Task" button
    const hasNewTaskButton = ctx.update.callback_query.message.reply_markup?.inline_keyboard?.some(row => 
      row.some(btn => btn.text === '➕ Nuova Task')
    );
    
    if (hasNewTaskButton) {
      buttons.push([
        Markup.button.callback('➕ Nuova Task', 'CREATE_TASK'),
        Markup.button.callback('🔙 Menu', 'BACK_TO_MENU')
      ]);
    }
    ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup);
  } catch (error) {
    console.error('Errore modifica priorità:', error);
    ctx.answerCbQuery('Errore durante la modifica della priorità.');
  }
});

// Reminder automatico ogni 30 minuti (escluso tra le 22 e le 08)
function sendReminders() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 22 || hour < 8) return; // Non inviare tra le 22 e le 08
  
  for (const userId in tasks) {
    const userTasks = getTaskList(userId);
    if (userTasks.length > 0) {
      const taskList = sortTasks(userTasks)
        .map(t => `${t.priority ? '🌟' : '⭐'} ${t.text}`)
        .join('\n');
      
      bot.telegram.sendMessage(
        userId,
        `⏰ Reminder! Hai ancora queste task da completare:\n${taskList}`,
        mainMenuKeyboard()
      ).catch((error) => {
        // Log degli errori più dettagliato ma non bloccante
        console.debug(`Errore invio reminder a ${userId}:`, error.message);
      });
    }
  }
}
setInterval(sendReminders, 30 * 60 * 1000);

bot.launch().catch((err) => {
  console.error('Errore durante l\'avvio del bot:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Utility: genera i bottoni per la lista task (DRY)
function taskButtons(userTasks) {
  return userTasks.map(task => [
    Markup.button.callback(`${task.priority ? '🌟' : '⭐'} ${task.text}`, `COMPLETE_${task.id}`),
    Markup.button.callback(task.priority ? '⬇️' : '⬆️', `PRIORITY_${task.id}`)
  ]);
}

// Utility: ordina le task (prioritarie in alto)
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
}
