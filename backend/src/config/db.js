const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

db.connect((err) => {
  if (err) console.error("Erro ao conectar no MySQL:", err);
  else console.log("✅ Conectado ao MySQL");
});

module.exports = db;
