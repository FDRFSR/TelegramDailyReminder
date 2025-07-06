const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Simple file-based data persistence manager
 */
class DataManager {
  constructor(dataPath = './data') {
    this.dataPath = dataPath;
    this.ensureDataDir();
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
    } catch (error) {
      logger.error('Error creating data directory', { error: error.message, path: this.dataPath });
    }
  }

  /**
   * Save user tasks to file
   * @param {number|string} userId
   * @param {Array} tasks
   */
  async saveUserTasks(userId, tasks) {
    try {
      const filePath = path.join(this.dataPath, `${userId}.json`);
      await fs.writeFile(filePath, JSON.stringify(tasks, null, 2));
    } catch (error) {
      logger.error('Error saving tasks for user', { error: error.message, userId });
    }
  }

  /**
   * Load user tasks from file
   * @param {number|string} userId
   * @returns {Array}
   */
  async loadUserTasks(userId) {
    try {
      const filePath = path.join(this.dataPath, `${userId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or other error - return empty array
      return [];
    }
  }

  /**
   * Get all user IDs that have data files
   * @returns {Array<string>}
   */
  async getAllUserIds() {
    try {
      const files = await fs.readdir(this.dataPath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      logger.error('Error reading user data files', { error: error.message });
      return [];
    }
  }
}

module.exports = DataManager;