const { executeQuery, oracledb } = require('../db/oracle');

function summarizeToken(token) {
  if (!token || typeof token !== 'string') {
    return token ?? null;
  }

  if (token.length <= 8) {
    return token;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)} (len=${token.length})`;
}

function logAuthEvent(event, details = {}) {
  try {
    console.log(`[Auth] ${event}`, JSON.stringify(details));
  } catch (error) {
    console.log(`[Auth] ${event}`, details);
  }
}

async function isAccessTokenValid(accessToken) {
  const result = await executeQuery(
    'BEGIN :es_valido := fn_validar_access(:token); END;',
    {
      token: accessToken,
      es_valido: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  return (result.outBinds?.es_valido ?? 0) === 1;
}

module.exports = {
  summarizeToken,
  logAuthEvent,
  isAccessTokenValid
};
