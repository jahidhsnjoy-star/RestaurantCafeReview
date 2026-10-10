const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../.env')});

const mysql = require('mysql2');

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restaurant_review_db',
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }

  console.log('MySQL database connected successfully!');
});

module.exports = db;