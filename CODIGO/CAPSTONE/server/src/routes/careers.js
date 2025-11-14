const { requireAccessToken } = require('../middleware/auth');
const { getClientIp } = require('../utils/request');
const { getUserIdFromAccessToken } = require('../services/auth');
const { getUserType, isAdminUserType } = require('../services/users');
const {
  listCareerCatalog,
  createCareer,
  deleteCareer,
  CareerCatalogError
} = require('../services/careers');
function getSkillCatalogServices() {
  // eslint-disable-next-line global-require
  return require('../services/skills');
}

async function resolveAdminUser(req, res) {
  const accessToken = req.auth?.accessToken ?? null;

  const userId = await getUserIdFromAccessToken(accessToken);

  if (!userId) {
    res.status(401).json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
    return null;
  }

  const userType = await getUserType(userId);

  if (!isAdminUserType(userType)) {
    res.status(403).json({ ok: false, error: 'No tienes permisos para administrar el catálogo de carreras.' });
    return null;
  }

  return userId;
}

function normalizeCareerResponse(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rawCategory = typeof entry.category === 'string' ? entry.category : null;
  const category = rawCategory ? rawCategory.trim() : '';

  if (!category) {
    return null;
  }

  const items = Array.isArray(entry.items) ? entry.items : [];
  const normalizedItems = items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const rawName =
        typeof item.name === 'string'
          ? item.name
          : typeof item.career === 'string'
          ? item.career
          : null;
      const career = rawName ? rawName.trim() : '';

      if (!career) {
        return null;
      }

      const rawId = item.id ?? item.ID ?? item.id_carrera ?? item.ID_CARRERA ?? null;
      let id = null;

      if (rawId !== null && rawId !== undefined && rawId !== '') {
        const parsed = Number.isFinite(rawId) ? Number(rawId) : Number.parseInt(String(rawId), 10);
        id = Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
      }

      return { id, career, name: career };
    })
    .filter(Boolean);

  return {
    category,
    items: normalizedItems
  };
}

function registerCareerRoutes(app) {
  app.get('/catalogs/careers', async (req, res) => {
    const startedAt = Date.now();
    const rawCategory = typeof req.query?.category === 'string' ? req.query.category : null;

    try {
      const catalog = await listCareerCatalog(rawCategory);

      const categories = catalog
        .map((entry) => normalizeCareerResponse({
          category: entry.category,
          items: entry.items
        }))
        .filter(Boolean);

      return res.json({
        ok: true,
        categories
      });
    } catch (error) {
      console.error('[Careers] Failed to list catalog', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo obtener el catálogo de carreras.' });
    }
  });

  app.post('/admin/careers', requireAccessToken, async (req, res) => {
    const rawCategory = req.body?.category ?? req.body?.categoria ?? null;
    const rawCareer = req.body?.career ?? req.body?.carrera ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      const created = await createCareer({ category: rawCategory, career: rawCareer });

      return res.status(201).json({
        ok: true,
        message: 'Carrera registrada correctamente.',
        career: {
          id: created.id,
          category: created.category,
          career: created.name
        }
      });
    } catch (error) {
      if (error instanceof CareerCatalogError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[Careers] Failed to create entry', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo crear la carrera.' });
    }
  });

  app.delete('/admin/careers/:careerId', requireAccessToken, async (req, res) => {
    const rawId = req.params?.careerId ?? null;
    const normalizedPathId =
      typeof rawId === 'string' && rawId.trim().toLocaleLowerCase('es') === 'by-name'
        ? null
        : rawId;
    const bodyCategory = req.body?.category ?? req.body?.categoria ?? null;
    const bodyCareer = req.body?.career ?? req.body?.carrera ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      await deleteCareer({ id: normalizedPathId, category: bodyCategory, career: bodyCareer });

      return res.json({
        ok: true,
        message: 'Carrera eliminada correctamente.'
      });
    } catch (error) {
      if (error instanceof CareerCatalogError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[Careers] Failed to delete entry', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo eliminar la carrera.' });
    }
  });

  app.get('/admin/careers/skills', requireAccessToken, async (req, res) => {
    const rawCategory = req.query?.category ?? req.query?.categoria ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      const { listAdminSkillCatalog, SkillCatalogError } = getSkillCatalogServices();
      const skills = await listAdminSkillCatalog(rawCategory);

      return res.json({
        ok: true,
        skills,
        count: skills.length
      });
    } catch (error) {
      const { SkillCatalogError } = getSkillCatalogServices();
      if (error instanceof SkillCatalogError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[Careers] Failed to list skills catalog', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo obtener el catálogo de habilidades.' });
    }
  });

  app.post('/admin/careers/skills', requireAccessToken, async (req, res) => {
    const rawCategory = req.body?.category ?? req.body?.categoria ?? null;
    const rawSkillName =
      req.body?.skill ?? req.body?.nombre ?? req.body?.name ?? req.body?.habilidad ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      const { createSkillCatalogEntry } = getSkillCatalogServices();
      const created = await createSkillCatalogEntry({ category: rawCategory, name: rawSkillName });

      return res.status(201).json({
        ok: true,
        message: 'Habilidad registrada correctamente.',
        skill: {
          id: created.id,
          name: created.name,
          category: created.category
        }
      });
    } catch (error) {
      const { SkillCatalogError } = getSkillCatalogServices();
      if (error instanceof SkillCatalogError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[Careers] Failed to create skill', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo crear la habilidad.' });
    }
  });

  app.delete('/admin/careers/skills/:skillId', requireAccessToken, async (req, res) => {
    const rawSkillId = req.params?.skillId ?? null;
    const normalizedSkillId =
      typeof rawSkillId === 'string' && rawSkillId.trim().toLocaleLowerCase('es') === 'by-name'
        ? null
        : rawSkillId;
    const rawSkillName =
      req.body?.skill ?? req.body?.nombre ?? req.body?.name ?? req.body?.habilidad ?? null;

    try {
      const adminUserId = await resolveAdminUser(req, res);

      if (!adminUserId) {
        return;
      }

      const { deleteSkillCatalogEntry } = getSkillCatalogServices();
      await deleteSkillCatalogEntry({ id: normalizedSkillId, name: rawSkillName });

      return res.json({
        ok: true,
        message: 'Habilidad eliminada correctamente.'
      });
    } catch (error) {
      const { SkillCatalogError } = getSkillCatalogServices();
      if (error instanceof SkillCatalogError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[Careers] Failed to delete skill', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo eliminar la habilidad.' });
    }
  });
}

module.exports = {
  registerCareerRoutes
};
