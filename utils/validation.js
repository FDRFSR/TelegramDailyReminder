/**
 * Input validation and rate limiting utilities
 */

const constants = require('../config/constants');

// Rate limiting storage
const userRateLimits = new Map();

/**
 * Validate task text input
 * @param {string} text
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateTaskText(text) {
  if (!text || typeof text !== 'string') {
    return { isValid: false, error: 'La task non può essere vuota.' };
  }
  
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { isValid: false, error: 'La task non può essere vuota.' };
  }
  
  if (trimmed.length > constants.MAX_TASK_LENGTH) {
    return { isValid: false, error: `La task è troppo lunga (max ${constants.MAX_TASK_LENGTH} caratteri).` };
  }
  
  // Check for potentially harmful content
  if (trimmed.includes('<script>') || trimmed.includes('javascript:')) {
    return { isValid: false, error: 'Il testo contiene caratteri non permessi.' };
  }
  
  return { isValid: true };
}

/**
 * Check if user is within rate limits
 * @param {number|string} userId
 * @param {string} action - action type (e.g., 'add_task', 'general')
 * @returns {boolean}
 */
function checkRateLimit(userId, action = 'general') {
  const now = Date.now();
  const userKey = `${userId}:${action}`;
  
  if (!userRateLimits.has(userKey)) {
    userRateLimits.set(userKey, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  const userLimit = userRateLimits.get(userKey);
  
  // Reset if time window has passed
  if (now > userLimit.resetTime) {
    userRateLimits.set(userKey, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  // Check limits based on action type
  const limits = {
    'add_task': 10,  // Max 10 tasks per minute
    'general': 30    // Max 30 general actions per minute
  };
  
  const maxActions = limits[action] || limits.general;
  
  if (userLimit.count >= maxActions) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, limit] of userRateLimits.entries()) {
    if (now > limit.resetTime) {
      userRateLimits.delete(key);
    }
  }
}

// Clean up rate limits every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

module.exports = {
  validateTaskText,
  checkRateLimit
};