const { executeQuery } = require('../db/oracle');

const USER_TYPE = Object.freeze({
  CANDIDATE: 1,
  ADMIN: 2,
  COMPANY: 3
});

function normalizeUserType(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseInt(String(value), 10);

  return Number.isNaN(parsed) ? null : parsed;
}

async function getUserType(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  try {
    const result = await executeQuery(
      `SELECT id_tipo_usuario AS user_type
         FROM usuarios
        WHERE id_usuario = :userId
        FETCH FIRST 1 ROWS ONLY`,
      { userId }
    );

    const row = result.rows?.[0];

    if (!row) {
      return null;
    }

    const raw =
      row.USER_TYPE ??
      row.user_type ??
      row.ID_TIPO_USUARIO ??
      row.id_tipo_usuario ??
      null;

    return normalizeUserType(raw);
  } catch (error) {
    console.error('[UsersService] Failed to fetch user type', {
      userId,
      error: error?.message || error
    });

    return null;
  }
}

function isAdminUserType(userType) {
  return Number(userType) === USER_TYPE.ADMIN;
}

module.exports = {
  USER_TYPE,
  getUserType,
  isAdminUserType
};
