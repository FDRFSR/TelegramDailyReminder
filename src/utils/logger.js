// src/utils/logger.js
// Simple logger utility with timestamp and log levels

const levels = ['info', 'warn', 'error'];

function log(level, ...args) {
  if (!levels.includes(level)) level = 'info';
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console[level === 'info' ? 'log' : level](`[${ts}] [${level.toUpperCase()}]`, ...args);
}

module.exports = {
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
