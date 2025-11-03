const { executeQuery, oracledb } = require('../db/oracle');
const { getClientIp, extractBearerToken } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { isAccessTokenValid } = require('../services/auth');
const {
  normalizeSkillPayload,
  listSkills,
  listSkillCatalog,
  getSkillStatus,
  getSkillEntry
} = require('../services/skills');

function registerSkillRoutes(app) {
  app.get('/skills/catalog', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const rawCategory = typeof req.query.category === 'string' ? req.query.category : null;
    const category = rawCategory ? rawCategory.trim() : null;

    console.info('[Skills] Catalog request received', {
      method: req.method,
      path: req.originalUrl,
      hasAuthorization: Boolean(accessToken),
      category,
      ip: getClientIp(req)
    });

    if (!accessToken) {
      console.warn('[Skills] Catalog request rejected: missing access token', {
        path: req.originalUrl,
        category
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Skills] Catalog request rejected: invalid access token', {
          path: req.originalUrl,
          category
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const items = await listSkillCatalog(category);

      console.info('[Skills] Catalog response sent', {
        category,
        count: items.length,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, items, count: items.length });
    } catch (error) {
      console.error('[Skills] Catalog request failed', {
        category,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener el catálogo de habilidades.');
    }
  });

  app.get('/profile/:userId/skills', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Skills] List request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Skills] List request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Skills] List request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Skills] List request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const [skills, skillsSummary] = await Promise.all([listSkills(userId), getSkillStatus(userId)]);

      console.info('[Skills] List response sent', {
        userId,
        count: skills.length,
        totalSkills: skillsSummary.totalSkills,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, skills, skillsSummary });
    } catch (error) {
      console.error('[Skills] List request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener las habilidades.');
    }
  });

  app.post('/profile/:userId/skills', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Skills] Create request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Skills] Create request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Skills] Create request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    let normalized;
    try {
      normalized = normalizeSkillPayload(req.body || {}, { allowName: true });
    } catch (validationError) {
      console.warn('[Skills] Create request validation failed', {
        userId,
        error: validationError?.message || validationError
      });
      return res.status(400).json({
        ok: false,
        error: validationError?.message || 'La información de la habilidad no es válida.'
      });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Skills] Create request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const levelValue = normalized.level === null ? null : Number(normalized.level);
      const yearsValue = normalized.yearsExperience === null ? null : Number(normalized.yearsExperience);
      const endorsementsValue =
        normalized.endorsementCount === null ? 0 : Number(normalized.endorsementCount);

      let skillId = normalized.skillId ?? null;

      if (!skillId && normalized.skillName) {
        const result = await executeQuery(
          `BEGIN sp_usuario_habilidades_pkg.sp_upsert_habilidad_usuario_by_nombre(
               p_id_usuario        => :userId,
               p_nombre_habilidad  => :skillName,
               p_nivel             => :level,
               p_anios_experiencia => :years,
               p_cantidad_respaldo => :endorsements,
               o_id_habilidad      => :skillId
             ); END;`,
          {
            userId,
            skillName: normalized.skillName,
            level: levelValue,
            years: yearsValue,
            endorsements: endorsementsValue,
            skillId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
          },
          { autoCommit: true }
        );

        skillId = Number(result.outBinds?.skillId ?? 0);

        if (!Number.isInteger(skillId) || skillId <= 0) {
          throw new Error('La habilidad indicada no es válida.');
        }
      } else {
        await executeQuery(
          `BEGIN sp_usuario_habilidades_pkg.sp_upsert_habilidad_usuario(
               p_id_usuario        => :userId,
               p_id_habilidad      => :skillId,
               p_nivel             => :level,
               p_anios_experiencia => :years,
               p_cantidad_respaldo => :endorsements
             ); END;`,
          {
            userId,
            skillId,
            level: levelValue,
            years: yearsValue,
            endorsements: endorsementsValue
          },
          { autoCommit: true }
        );
      }

      const [skills, skillsSummary] = await Promise.all([listSkills(userId), getSkillStatus(userId)]);
      const entry = skills.find((item) => item.skillId === skillId) ?? null;

      if (!entry) {
        console.error('[Skills] Create request failed: skill not found after upsert', {
          userId,
          skillId,
          elapsedMs: Date.now() - startedAt
        });
        throw new Error('No se pudo obtener la habilidad creada.');
      }

      console.info('[Skills] Create successful', {
        userId,
        skillId,
        elapsedMs: Date.now() - startedAt
      });

      res.status(201).json({ ok: true, skill: entry, skillsSummary });
    } catch (error) {
      console.error('[Skills] Create request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo agregar la habilidad.');
    }
  });

  app.put('/profile/:userId/skills/:skillId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);
    const skillId = Number.parseInt(req.params.skillId, 10);

    console.info('[Skills] Update request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      skillId: Number.isNaN(skillId) ? req.params.skillId : skillId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Skills] Update request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!Number.isInteger(skillId) || skillId <= 0) {
      console.warn('[Skills] Update request rejected: invalid skill id', {
        path: req.originalUrl,
        skillId: req.params.skillId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de habilidad no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Skills] Update request rejected: missing access token', {
        path: req.originalUrl,
        userId,
        skillId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    let normalized;
    try {
      normalized = normalizeSkillPayload(req.body || {}, {
        requireId: true,
        allowName: false,
        overrideSkillId: skillId
      });
    } catch (validationError) {
      console.warn('[Skills] Update request validation failed', {
        userId,
        skillId,
        error: validationError?.message || validationError
      });
      return res.status(400).json({
        ok: false,
        error: validationError?.message || 'La información de la habilidad no es válida.'
      });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Skills] Update request rejected: invalid access token', {
          path: req.originalUrl,
          userId,
          skillId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const levelValue = normalized.level === null ? null : Number(normalized.level);
      const yearsValue = normalized.yearsExperience === null ? null : Number(normalized.yearsExperience);
      const endorsementsValue =
        normalized.endorsementCount === null ? 0 : Number(normalized.endorsementCount);

      await executeQuery(
        `BEGIN sp_usuario_habilidades_pkg.sp_upsert_habilidad_usuario(
             p_id_usuario        => :userId,
             p_id_habilidad      => :skillId,
             p_nivel             => :level,
             p_anios_experiencia => :years,
             p_cantidad_respaldo => :endorsements
           ); END;`,
        {
          userId,
          skillId,
          level: levelValue,
          years: yearsValue,
          endorsements: endorsementsValue
        },
        { autoCommit: true }
      );

      const skill = await getSkillEntry(userId, skillId);

      if (!skill) {
        throw new Error('No se encontró la habilidad actualizada.');
      }

      const skillsSummary = await getSkillStatus(userId);

      console.info('[Skills] Update successful', {
        userId,
        skillId,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, skill, skillsSummary });
    } catch (error) {
      console.error('[Skills] Update request failed', {
        userId,
        skillId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo actualizar la habilidad.');
    }
  });

  app.delete('/profile/:userId/skills/:skillId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);
    const skillId = Number.parseInt(req.params.skillId, 10);

    console.info('[Skills] Delete request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      skillId: Number.isNaN(skillId) ? req.params.skillId : skillId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Skills] Delete request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!Number.isInteger(skillId) || skillId <= 0) {
      console.warn('[Skills] Delete request rejected: invalid skill id', {
        path: req.originalUrl,
        skillId: req.params.skillId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de habilidad no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Skills] Delete request rejected: missing access token', {
        path: req.originalUrl,
        userId,
        skillId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Skills] Delete request rejected: invalid access token', {
          path: req.originalUrl,
          userId,
          skillId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      await executeQuery(
        `BEGIN sp_usuario_habilidades_pkg.sp_eliminar_habilidad_usuario(
             p_id_usuario   => :userId,
             p_id_habilidad => :skillId
           ); END;`,
        {
          userId,
          skillId
        },
        { autoCommit: true }
      );

      const skillsSummary = await getSkillStatus(userId);

      console.info('[Skills] Delete successful', {
        userId,
        skillId,
        remainingSkills: skillsSummary.totalSkills,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, skillsSummary });
    } catch (error) {
      console.error('[Skills] Delete request failed', {
        userId,
        skillId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo eliminar la habilidad.');
    }
  });
}

module.exports = {
  registerSkillRoutes
};
