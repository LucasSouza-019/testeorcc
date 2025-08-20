const mysql = require("mysql2");

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  ssl: process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n")
      }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10
});

db.getConnection((err, connection) => {
  if (err) console.error("❌ Erro ao conectar no MySQL:", err);
  else {
    console.log("✅ Conectado ao MySQL Aiven (pool)");
    connection.release();
  }
});

module.exports = db;
