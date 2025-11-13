const oracledb = require('oracledb');

const { config, resolvedWalletDir } = require('../config');

process.env.TNS_ADMIN = resolvedWalletDir;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

const MAX_STRING_PREVIEW_LENGTH = 200;
const MAX_ROW_PREVIEW_COUNT = 5;

const BIND_DIRECTION_MAP = {
  [oracledb.BIND_IN]: 'BIND_IN',
  [oracledb.BIND_OUT]: 'BIND_OUT',
  [oracledb.BIND_INOUT]: 'BIND_INOUT'
};

const DATA_TYPE_MAP = (() => {
  const entries = [];

  if (oracledb.STRING !== undefined) entries.push([oracledb.STRING, 'STRING']);
  if (oracledb.NUMBER !== undefined) entries.push([oracledb.NUMBER, 'NUMBER']);
  if (oracledb.DATE !== undefined) entries.push([oracledb.DATE, 'DATE']);
  if (oracledb.CLOB !== undefined) entries.push([oracledb.CLOB, 'CLOB']);
  if (oracledb.BLOB !== undefined) entries.push([oracledb.BLOB, 'BLOB']);
  if (oracledb.CURSOR !== undefined) entries.push([oracledb.CURSOR, 'CURSOR']);

  return new Map(entries);
})();

function summarizeSql(sql) {
  if (typeof sql !== 'string') {
    return sql;
  }

  const condensed = sql.replace(/\s+/g, ' ').trim();

  if (condensed.length <= 300) {
    return condensed;
  }

  return `${condensed.slice(0, 300)}…`;
}

function previewString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length <= MAX_STRING_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_PREVIEW_LENGTH)}… (truncated ${
    value.length - MAX_STRING_PREVIEW_LENGTH
  } chars)`;
}

function previewValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return previewString(value);
  }

  if (Buffer.isBuffer(value)) {
    return `<Buffer length=${value.length}>`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ROW_PREVIEW_COUNT)
        .map((entry) => previewValue(entry, seen));
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, previewValue(entry, seen)])
    );
    }

  return value;
}

function mapBindDirection(value) {
  return BIND_DIRECTION_MAP[value] || value;
}

function mapDataType(value) {
  return DATA_TYPE_MAP.get(value) || value;
}

function previewBindValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    const descriptor = {};

    if (Object.prototype.hasOwnProperty.call(value, 'dir')) {
      descriptor.dir = mapBindDirection(value.dir);
    }

    if (Object.prototype.hasOwnProperty.call(value, 'type')) {
      descriptor.type = mapDataType(value.type);
    }

    if (Object.prototype.hasOwnProperty.call(value, 'val')) {
      descriptor.val = previewValue(value.val);
    }

    if (Object.prototype.hasOwnProperty.call(value, 'maxSize')) {
      descriptor.maxSize = value.maxSize;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'csqlType')) {
      descriptor.csqlType = value.csqlType;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'typeName')) {
      descriptor.typeName = value.typeName;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'dir') || Object.prototype.hasOwnProperty.call(value, 'type')) {
      return descriptor;
    }
  }

  return previewValue(value);
}

function previewBinds(binds) {
  if (!binds) {
    return binds;
  }

  if (Array.isArray(binds)) {
    return binds.map((entry) => previewBindValue(entry));
  }

  if (typeof binds === 'object') {
    return Object.fromEntries(Object.entries(binds).map(([key, value]) => [key, previewBindValue(value)]));
  }

  return binds;
}

function previewOutBinds(outBinds) {
  if (!outBinds || typeof outBinds !== 'object') {
    return outBinds;
  }

  if (Array.isArray(outBinds)) {
    return outBinds.map((value) => previewValue(value));
  }

  return Object.fromEntries(Object.entries(outBinds).map(([key, value]) => [key, previewValue(value)]));
}

function previewRows(rows) {
  if (!Array.isArray(rows)) {
    return rows;
  }

  return rows.slice(0, MAX_ROW_PREVIEW_COUNT).map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return previewValue(row);
    }

    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, previewValue(value)]));
  });
}

function logDbStatement({ label, stage, sql, binds, options, durationMs, result, error }) {
  const payload = {
    sql: summarizeSql(sql)
  };

  if (binds !== undefined) {
    payload.binds = previewBinds(binds);
  }

  if (options && Object.keys(options).length > 0) {
    payload.options = options;
  }

  if (durationMs !== undefined) {
    payload.durationMs = durationMs;
  }

  if (result) {
    payload.metaData = Array.isArray(result.metaData) ? result.metaData.map((column) => column.name || column) : undefined;
    payload.rows = previewRows(result.rows);
    payload.rowCount = Array.isArray(result.rows) ? result.rows.length : undefined;
    payload.rowsAffected = Number.isFinite(result.rowsAffected) ? result.rowsAffected : undefined;
    payload.outBinds = previewOutBinds(result.outBinds);
  }

  if (error) {
    payload.error = error?.message || error;
  }

  const message = `[DB] ${label} -> ${stage}`;

  if (stage === 'error') {
    console.error(message, payload);
  } else {
    console.info(message, payload);
  }
}

function createLoggingConnection(connection) {
  const originalExecute = connection.execute.bind(connection);

  return new Proxy(connection, {
    get(target, prop, receiver) {
      if (prop === 'execute') {
        return async function executeWithLogging(sql, binds = {}, options = {}) {
          const startedAt = Date.now();
          logDbStatement({
            label: 'connection.execute',
            stage: 'start',
            sql,
            binds,
            options
          });

          try {
            const result = await originalExecute(sql, binds, options);

            logDbStatement({
              label: 'connection.execute',
              stage: 'success',
              sql,
              binds,
              options,
              durationMs: Date.now() - startedAt,
              result
            });

            return result;
          } catch (error) {
            logDbStatement({
              label: 'connection.execute',
              stage: 'error',
              sql,
              binds,
              options,
              durationMs: Date.now() - startedAt,
              error
            });

            throw error;
          }
        };
      }

      return Reflect.get(target, prop, receiver);
    }
  });
}

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
    const startedAt = Date.now();

    logDbStatement({
      label: 'executeQuery',
      stage: 'start',
      sql,
      binds,
      options
    });

    try {
      const result = await connection.execute(sql, binds, options);

      logDbStatement({
        label: 'executeQuery',
        stage: 'success',
        sql,
        binds,
        options,
        durationMs: Date.now() - startedAt,
        result
      });

      return result;
    } catch (error) {
      logDbStatement({
        label: 'executeQuery',
        stage: 'error',
        sql,
        binds,
        options,
        durationMs: Date.now() - startedAt,
        error
      });

      throw error;
    }
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
    const loggingConnection = createLoggingConnection(connection);
    return await callback(loggingConnection);
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
    }
  } finally {
    try {
      await cursor.close();
    } catch (error) {
      console.error('[DB] Failed to close cursor:', error);
    }
  }

  console.info('[DB] fetchCursorRows -> completed', {
    batchSize,
    totalRows: rows.length
  });

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
