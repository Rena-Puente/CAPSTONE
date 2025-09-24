const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
require('dotenv').config();

const app = express();
app.use(cors({ origin: ['http://localhost:4200', 'http://127.0.0.1:4200'] }));
app.use(express.json());

// oracledb v6+ usa THIN mode por defecto. No llames initOracleClient().
let pool;

async function start() {
  pool = await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_ALIAS, // alias exacto del tnsnames.ora (p.ej. infotex_low)
    configDir: process.env.DB_WALLET_DIR,        // carpeta con tnsnames.ora y sqlnet.ora
    walletLocation: process.env.DB_WALLET_DIR, // certificados del wallet
    walletPassword: process.env.DB_WALLET_PASSWORD,     // contraseña wallet
    poolMin: 1, poolMax: 5, poolIncrement: 1, stmtCacheSize: 40
  });

  app.listen(process.env.PORT, () =>
    console.log(`API lista: http://localhost:${process.env.PORT}`)
  );
}

app.get('/api/ping', (_, res) => res.json({ ok: true, at: new Date().toISOString() }));

app.get('/api/now', async (_, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const r = await conn.execute(`SELECT systimestamp AS ts FROM dual`, [], { outFormat: oracledb.OBJECT });
    res.json(r.rows?.[0] ?? {});
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { if (conn) await conn.close(); }
});

start().catch(e => { console.error(e); process.exit(1); });
