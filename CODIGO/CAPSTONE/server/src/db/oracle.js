const oracledb = require('oracledb');

const { config, resolvedWalletDir } = require('../config');

process.env.TNS_ADMIN = resolvedWalletDir;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

async function initPool() {
  try {
    await oracledb.createPool({
      user: config.db.user,
      password: config.db.password,
      connectString: config.db.connectAlias,
      walletLocation: config.db.walletDir,
      walletPassword: config.db.walletPassword
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

async function withConnection(callback) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    return await callback(connection);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('[DB] Error releasing connection:', error);
      }
    }
  }
}

async function fetchCursorRows(cursor) {
  const rows = [];

  if (!cursor) {
    return rows;
  }

  const batchSize = 100;

  try {
    while (true) {
      const batch = await cursor.getRows(batchSize);

      if (!batch || batch.length === 0) {
        break;
      }

      for (const row of batch) {
        rows.push(await normalizeCursorRow(row));
      }
          if (batch.length < batchSize) {
        break;
      }
    }
    
  } finally {
    try {
      await cursor.close();
    } catch (error) {
      console.error('[DB] Failed to close cursor:', error);
    }
  }

  return rows;
}

async function normalizeCursorRow(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }

  const entries = await Promise.all(
    Object.entries(row).map(async ([key, value]) => [key, await resolveLobValue(value)])
  );

  return Object.fromEntries(entries);
}

async function resolveLobValue(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  const constructorName = value.constructor ? value.constructor.name : '';
  const isLikelyLob = constructorName === 'Lob' || value.iLob === true;
  const hasLobMethods = typeof value.getData === 'function' && typeof value.close === 'function';
  const hasLobType = value.type === oracledb.CLOB || value.type === oracledb.BLOB;

  const isLob = hasLobMethods && (isLikelyLob || hasLobType);

  if (!isLob) {
    return value;
  }

  try {
    const data = await value.getData();
    return data;
  } catch (error) {
    console.error('[DB] Failed to read LOB value from cursor:', error);
    return null;
  } finally {
    try {
      await value.close();
    } catch (closeError) {
      console.error('[DB] Failed to close LOB after reading from cursor:', closeError);
    }
  }
}

module.exports = {
  config,
  oracledb,
  initPool,
  closePool,
  executeQuery,
  withConnection,
  fetchCursorRows,
  normalizeCursorRow,
  resolveLobValue
};
