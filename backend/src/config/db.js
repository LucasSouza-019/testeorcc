const mysql = require("mysql2");

function getCA() {
  const ca = process.env.DB_SSL_CA || "";
  // Se colou com '\n' literais, converte. Se já for multilinha, não atrapalha.
  return ca.includes("\\n") ? ca.replace(/\\n/g, "\n") : ca;
}

const sslEnabled = String(process.env.DB_SSL).toLowerCase() === "true";
const caText = getCA();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  ssl: sslEnabled
    ? (caText
        ? { rejectUnauthorized: true, ca: caText }      // ✅ modo correto com CA
        : { rejectUnauthorized: false })                // ⚠️ fallback se CA faltar
    : undefined,
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Erro ao conectar no MySQL:", err);
  } else {
    console.log("✅ Conectado ao MySQL (pool)");
    conn.release();
  }
});

module.exports = db;
