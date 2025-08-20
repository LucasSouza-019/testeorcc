const mysql = require("mysql2");

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
