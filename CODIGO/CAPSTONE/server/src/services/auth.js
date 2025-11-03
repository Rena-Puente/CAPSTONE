const { executeQuery, oracledb } = require('../db/oracle');

const GITHUB_PROVIDER = 'GITHUB';

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

async function findUserByOAuth(provider, providerId) {
  if (!provider || !providerId) {
    return null;
  }

  const normalizedProvider = String(provider).trim().toUpperCase();

  const result = await executeQuery(
    'BEGIN :userId := fn_get_usuario_oauth(:provider, :providerId); END;',
    {
      provider: normalizedProvider,
      providerId: String(providerId),
      userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const userId = result.outBinds?.userId;

  if (userId === undefined || userId === null) {
    return null;
  }

  return Number(userId);
}

async function createUserFromGithub({ providerId, email, name, avatar }) {
  const result = await executeQuery(
    `BEGIN
       sp_registrar_usuario_oauth(
         p_proveedor    => :provider,
         p_provider_id  => :providerId,
         p_correo       => :email,
         p_nombre       => :name,
         p_avatar       => :avatar,
         p_id_usuario   => :userId
       );
     END;`,
    {
      provider: GITHUB_PROVIDER,
      providerId: String(providerId),
      email,
      name: name || null,
      avatar: avatar || null,
      userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    { autoCommit: true }
  );

  const userId = result.outBinds?.userId;

  if (userId === undefined || userId === null) {
    return null;
  }

  return Number(userId);
}

async function saveGithubTokens({
  userId,
  providerId,
  accessToken,
  refreshToken,
  scope,
  expiresAt
}) {
  await executeQuery(
    `BEGIN
       sp_guardar_token_oauth(
         p_id_usuario    => :userId,
         p_proveedor     => :provider,
         p_provider_id   => :providerId,
         p_access_token  => :accessToken,
         p_refresh_token => :refreshToken,
         p_scope         => :scope,
         p_expira        => :expiresAt
       );
     END;`,
    {
      userId,
      provider: GITHUB_PROVIDER,
      providerId: String(providerId),
      accessToken,
      refreshToken: refreshToken || null,
      scope: scope || null,
      expiresAt: expiresAt || null
    },
    { autoCommit: true }
  );
}

module.exports = {
  summarizeToken,
  logAuthEvent,
  isAccessTokenValid,
  findUserByOAuth,
  createUserFromGithub,
  saveGithubTokens
};
