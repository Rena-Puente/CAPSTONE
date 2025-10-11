require('dotenv').config();

const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');

const {
  PORT = 3000,
  DB_USER,
  DB_PASSWORD,
  DB_CONNECT_ALIAS,
  DB_WALLET_DIR,
  DB_WALLET_PASSWORD
} = process.env;

function ensureEnv(value, name) {
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

const resolvedWalletDir = path.resolve(__dirname, ensureEnv(DB_WALLET_DIR, 'DB_WALLET_DIR'));
process.env.TNS_ADMIN = resolvedWalletDir;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function initPool() {
  try {
    await oracledb.createPool({
      user: ensureEnv(DB_USER, 'DB_USER'),
      password: ensureEnv(DB_PASSWORD, 'DB_PASSWORD'),
      connectString: ensureEnv(DB_CONNECT_ALIAS, 'DB_CONNECT_ALIAS'),
      walletLocation: resolvedWalletDir,
      walletPassword: DB_WALLET_PASSWORD || undefined
    });
    console.log('[DB] Connection pool created successfully');
  } catch (error) {
    console.error('[DB] Failed to initialize connection pool:', error);
    throw error;
  }
}

async function closePool() {
  try {
    await oracledb.getPool().close(10);
    console.log('[DB] Connection pool closed');
  } catch (error) {
    if (error && error.message && error.message.includes('NJS-047')) {
      return;
    }
    console.error('[DB] Error closing connection pool:', error);
  }
}

async function executeQuery(sql, binds = {}, options = {}) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(sql, binds, options);
    return result;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('[DB] Error releasing connection:', closeError);
      }
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await executeQuery('SELECT 1 AS RESULT FROM dual');
    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[DB] Test query failed:', error);
    res.status(500).json({ ok: false, error: 'Database connection failed', details: error.message });
  }
});

async function start() {
  await initPool();

  const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

module.exports = {
  executeQuery
};
