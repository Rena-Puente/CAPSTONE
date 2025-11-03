const { executeQuery, oracledb } = require('../db/oracle');
const { getClientIp, extractBearerToken } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { isAccessTokenValid } = require('../services/auth');
const {
  normalizeExperiencePayload,
  listExperience,
  getExperienceStatus,
  getExperienceEntry
} = require('../services/experience');

function registerExperienceRoutes(app) {
  app.get('/profile/:userId/experience', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Experience] List request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Experience] List request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Experience] List request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Experience] List request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const [experience, experienceSummary] = await Promise.all([
        listExperience(userId),
        getExperienceStatus(userId)
      ]);

      console.info('[Experience] List successful', {
        userId,
        count: experience.length,
        currentRecords: experienceSummary.currentCount,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, experience, experienceSummary });
    } catch (error) {
      console.error('[Experience] List request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener la experiencia laboral.');
    }
  });

  app.post('/profile/:userId/experience', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Experience] Create request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Experience] Create request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Experience] Create request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    let normalizedPayload;

    try {
      normalizedPayload = normalizeExperiencePayload(req.body || {});
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Los datos enviados no son válidos.';
      return res.status(400).json({ ok: false, error: message });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Experience] Create request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const result = await executeQuery(
        `BEGIN sp_experiencia_pkg.sp_crear_experiencia(
           p_id_usuario     => :userId,
           p_titulo         => :title,
           p_empresa        => :company,
           p_fecha_inicio   => :startDate,
           p_fecha_fin      => :endDate,
           p_ubicacion      => :location,
           p_descripcion    => :description,
           o_id_experiencia => :experienceId
         ); END;`,
        {
          userId,
          title: normalizedPayload.title,
          company: normalizedPayload.company,
          startDate: normalizedPayload.startDate,
          endDate: normalizedPayload.endDate,
          location: normalizedPayload.location,
          description: normalizedPayload.description,
          experienceId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        },
        { autoCommit: true }
      );

      const newId = Number(result.outBinds?.experienceId ?? 0);

      if (!Number.isInteger(newId) || newId <= 0) {
        throw new Error('No se pudo determinar el identificador de la experiencia creada.');
      }

      const [experience, experienceSummary] = await Promise.all([
        getExperienceEntry(userId, newId),
        getExperienceStatus(userId)
      ]);

      if (!experience) {
        throw new Error('La experiencia recién creada no pudo ser recuperada.');
      }

      console.info('[Experience] Create successful', {
        userId,
        experienceId: newId,
        elapsedMs: Date.now() - startedAt
      });

      res.status(201).json({ ok: true, experience, experienceSummary });
    } catch (error) {
      console.error('[Experience] Create request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo crear el registro de experiencia.');
    }
  });

  app.put('/profile/:userId/experience/:experienceId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);
    const experienceId = Number.parseInt(req.params.experienceId, 10);

    console.info('[Experience] Update request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      experienceId: Number.isNaN(experienceId) ? req.params.experienceId : experienceId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Experience] Update request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!Number.isInteger(experienceId) || experienceId <= 0) {
      console.warn('[Experience] Update request rejected: invalid experience id', {
        path: req.originalUrl,
        experienceId: req.params.experienceId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de experiencia no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Experience] Update request rejected: missing access token', {
        path: req.originalUrl,
        userId,
        experienceId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    let normalizedPayload;

    try {
      normalizedPayload = normalizeExperiencePayload(req.body || {});
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Los datos enviados no son válidos.';
      return res.status(400).json({ ok: false, error: message });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Experience] Update request rejected: invalid access token', {
          path: req.originalUrl,
          userId,
          experienceId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      await executeQuery(
        `BEGIN sp_experiencia_pkg.sp_actualizar_experiencia(
           p_id_experiencia => :experienceId,
           p_id_usuario     => :userId,
           p_titulo         => :title,
           p_empresa        => :company,
           p_fecha_inicio   => :startDate,
           p_fecha_fin      => :endDate,
           p_ubicacion      => :location,
           p_descripcion    => :description
         ); END;`,
        {
          experienceId,
          userId,
          title: normalizedPayload.title,
          company: normalizedPayload.company,
          startDate: normalizedPayload.startDate,
          endDate: normalizedPayload.endDate,
          location: normalizedPayload.location,
          description: normalizedPayload.description
        },
        { autoCommit: true }
      );

      const [experience, experienceSummary] = await Promise.all([
        getExperienceEntry(userId, experienceId),
        getExperienceStatus(userId)
      ]);

      if (!experience) {
        throw new Error('No se encontró el registro de experiencia actualizado.');
      }

      console.info('[Experience] Update successful', {
        userId,
        experienceId,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, experience, experienceSummary });
    } catch (error) {
      console.error('[Experience] Update request failed', {
        userId,
        experienceId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo actualizar la experiencia.');
    }
  });

  app.delete('/profile/:userId/experience/:experienceId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);
    const experienceId = Number.parseInt(req.params.experienceId, 10);

    console.info('[Experience] Delete request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      experienceId: Number.isNaN(experienceId) ? req.params.experienceId : experienceId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Experience] Delete request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!Number.isInteger(experienceId) || experienceId <= 0) {
      console.warn('[Experience] Delete request rejected: invalid experience id', {
        path: req.originalUrl,
        experienceId: req.params.experienceId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de experiencia no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Experience] Delete request rejected: missing access token', {
        path: req.originalUrl,
        userId,
        experienceId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Experience] Delete request rejected: invalid access token', {
          path: req.originalUrl,
          userId,
          experienceId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      await executeQuery(
        `BEGIN sp_experiencia_pkg.sp_eliminar_experiencia(
           p_id_experiencia => :experienceId,
           p_id_usuario     => :userId
         ); END;`,
        {
          experienceId,
          userId
        },
        { autoCommit: true }
      );

      const experienceSummary = await getExperienceStatus(userId);

      console.info('[Experience] Delete successful', {
        userId,
        experienceId,
        remainingRecords: experienceSummary.totalRecords,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, experienceSummary });
    } catch (error) {
      console.error('[Experience] Delete request failed', {
        userId,
        experienceId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo eliminar la experiencia.');
    }
  });
}

module.exports = {
  registerExperienceRoutes
};
