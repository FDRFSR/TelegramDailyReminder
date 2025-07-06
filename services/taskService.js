const DataManager = require('./dataManager');

class TaskService {
  constructor() {
    this.tasks = Object.create(null);
    this.dataManager = new DataManager();
    this.loadAllUserData();
  }

  /**
   * Load all user data from persistent storage
   */
  async loadAllUserData() {
    try {
      const userIds = await this.dataManager.getAllUserIds();
      for (const userId of userIds) {
        const tasks = await this.dataManager.loadUserTasks(userId);
        if (Array.isArray(tasks) && tasks.length > 0) {
          this.tasks[userId] = tasks;
        }
      }
      console.log(`Loaded data for ${userIds.length} users`);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  /**
   * Save user tasks to persistent storage
   * @param {number|string} userId
   */
  async saveUserTasks(userId) {
    try {
      const tasks = this.getTaskList(userId);
      await this.dataManager.saveUserTasks(userId, tasks);
    } catch (error) {
      console.error(`Error saving tasks for user ${userId}:`, error);
    }
  }

  /**
   * Add a new task for a user
   * @param {number|string} userId
   * @param {string} text
   */
  async addTask(userId, text) {
    if (!Array.isArray(this.tasks[userId])) this.tasks[userId] = [];
    const id = Date.now().toString();
    this.tasks[userId].push({ id, text, completed: false, priority: false });
    await this.saveUserTasks(userId);
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
  async togglePriority(userId, taskId) {
    const userTasks = this.getTaskList(userId);
    const task = userTasks.find(t => t.id === taskId);
    if (task) {
      task.priority = !task.priority;
      await this.saveUserTasks(userId);
    }
  }

  /**
   * Remove a task for a user
   * @param {number|string} userId
   * @param {string} taskId
   */
  async removeTask(userId, taskId) {
    let userTasks = this.getTaskList(userId);
    userTasks = userTasks.filter(task => task.id !== taskId);
    this.tasks[userId] = userTasks;
    await this.saveUserTasks(userId);
  }
}

module.exports = TaskService;
