const { requireAccessToken } = require('../middleware/auth');
const { getClientIp } = require('../utils/request');
const { getUserIdFromAccessToken } = require('../services/auth');
const { getUserType, isAdminUserType } = require('../services/users');
const {
  listStudyHouses,
  createStudyHouse,
  deleteStudyHouse,
  StudyHouseError
} = require('../services/study-houses');

async function resolveAdminUser(req, res) {
  const accessToken = req.auth?.accessToken ?? null;

  const userId = await getUserIdFromAccessToken(accessToken);

  if (!userId) {
    res.status(401).json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
    return null;
  }

  const userType = await getUserType(userId);

  if (!isAdminUserType(userType)) {
    res
      .status(403)
      .json({ ok: false, error: 'No tienes permisos para administrar las casas de estudios.' });
    return null;
  }

  return userId;
}

function normalizeStudyHouseResponse(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rawName = typeof entry.name === 'string' ? entry.name : entry.casa_estudios ?? null;
  const name = rawName ? rawName.trim() : '';

  if (!name) {
    return null;
  }

  const rawId = entry.id ?? entry.ID ?? entry.id_casa_estudios ?? entry.ID_CASA_ESTUDIOS ?? null;
  let id = null;

  if (rawId !== null && rawId !== undefined && rawId !== '') {
    const parsed = Number.isFinite(rawId) ? Number(rawId) : Number.parseInt(String(rawId), 10);
    id = Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  return { id, name };
}

function registerStudyHouseRoutes(app) {
  app.get('/catalogs/study-houses', async (req, res) => {
    const startedAt = Date.now();
    const rawName = typeof req.query?.name === 'string' ? req.query.name : null;

    try {
      const catalog = await listStudyHouses(rawName);
      const houses = catalog.map((entry) => normalizeStudyHouseResponse(entry)).filter(Boolean);

      return res.json({
        ok: true,
        houses
      });
    } catch (error) {
      console.error('[StudyHouses] Failed to list catalog', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo obtener el catálogo de casas de estudios.' });
    }
  });

  app.post('/admin/study-houses', requireAccessToken, async (req, res) => {
    const rawName = req.body?.name ?? req.body?.casa_estudios ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      const created = await createStudyHouse(rawName);

      return res.status(201).json({
        ok: true,
        message: 'Casa de estudios registrada correctamente.',
        house: {
          id: created.id,
          name: created.name
        }
      });
    } catch (error) {
      if (error instanceof StudyHouseError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[StudyHouses] Failed to create entry', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo crear la casa de estudios.' });
    }
  });

  app.delete('/admin/study-houses/:houseId', requireAccessToken, async (req, res) => {
    const rawId = req.params?.houseId ?? null;
    const normalizedPathId =
      typeof rawId === 'string' && rawId.trim().toLocaleLowerCase('es') === 'by-name'
        ? null
        : rawId;
    const bodyName = req.body?.name ?? req.body?.casa_estudios ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      await deleteStudyHouse({ id: normalizedPathId, name: bodyName });

      return res.json({
        ok: true,
        message: 'Casa de estudios eliminada correctamente.'
      });
    } catch (error) {
      if (error instanceof StudyHouseError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[StudyHouses] Failed to delete entry', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo eliminar la casa de estudios.' });
    }
  });
}

module.exports = {
  registerStudyHouseRoutes
};
