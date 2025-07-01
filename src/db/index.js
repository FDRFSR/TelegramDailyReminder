// src/db/index.js
// Database connection and setup

const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

let pool;

function setupDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

function getDb() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

module.exports = { setupDatabase, getDb };
