class TaskService {
  constructor() {
    this.tasks = Object.create(null);
  }

  /**
   * Add a new task for a user
   * @param {number|string} userId
   * @param {string} text
   */
  addTask(userId, text) {
    if (!Array.isArray(this.tasks[userId])) this.tasks[userId] = [];
    const id = Date.now().toString();
    this.tasks[userId].push({ id, text, completed: false, priority: false });
  }

  /**
   * Get the user's task list
   * @param {number|string} userId
   * @returns {Array}
   */
  getTaskList(userId) {
    return Array.isArray(this.tasks[userId]) ? this.tasks[userId] : [];
  }

  /**
   * Toggle priority for a task
   * @param {number|string} userId
   * @param {string} taskId
   */
  togglePriority(userId, taskId) {
    const userTasks = this.getTaskList(userId);
    const task = userTasks.find(t => t.id === taskId);
    if (task) task.priority = !task.priority;
  }

  /**
   * Remove a task for a user
   * @param {number|string} userId
   * @param {string} taskId
   */
  removeTask(userId, taskId) {
    let userTasks = this.getTaskList(userId);
    userTasks = userTasks.filter(task => task.id !== taskId);
    this.tasks[userId] = userTasks;
  }
}

module.exports = TaskService;
