const { executeQuery, oracledb } = require('../db/oracle');
const { getClientIp, extractBearerToken } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { isAccessTokenValid } = require('../services/auth');
const {
  normalizeEducationPayload,
  listEducation,
  getEducationStatus,
  getEducationEntry
} = require('../services/education');

function registerEducationRoutes(app) {
  app.get('/profile/:userId/education', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Education] List request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Education] List request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Education] List request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Education] List request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const [education, educationSummary] = await Promise.all([
        listEducation(userId),
        getEducationStatus(userId)
      ]);

      console.info('[Education] List response sent', {
        userId,
        count: education.length,
        educationRecords: educationSummary.totalRecords,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, education, educationSummary });
    } catch (error) {
      console.error('[Education] List request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener la información educativa.');
    }
  });

  app.post('/profile/:userId/education', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Education] Create request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Education] Create request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Education] Create request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    let normalizedPayload;

    try {
      normalizedPayload = normalizeEducationPayload(req.body || {});
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Los datos enviados no son válidos.';
      return res.status(400).json({ ok: false, error: message });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Education] Create request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const result = await executeQuery(
        `BEGIN sp_educacion_pkg.sp_crear_educacion(
           p_id_usuario   => :userId,
           p_institucion  => :institution,
           p_grado        => :degree,
           p_area_estudio => :fieldOfStudy,
           p_fecha_inicio => :startDate,
           p_fecha_fin    => :endDate,
           p_descripcion  => :description,
           o_id_educacion => :educationId
         ); END;`,
        {
          userId,
          institution: normalizedPayload.institution,
          degree: normalizedPayload.degree,
          fieldOfStudy: normalizedPayload.fieldOfStudy,
          startDate: normalizedPayload.startDate,
          endDate: normalizedPayload.endDate,
          description: normalizedPayload.description,
          educationId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        },
        { autoCommit: true }
      );

      const newId = Number(result.outBinds?.educationId ?? 0);

      if (!Number.isInteger(newId) || newId <= 0) {
        throw new Error('No se pudo determinar el identificador de la educación creada.');
      }

      const [education, educationSummary] = await Promise.all([
        getEducationEntry(userId, newId),
        getEducationStatus(userId)
      ]);

      if (!education) {
        throw new Error('La educación recién creada no pudo ser recuperada.');
      }

      console.info('[Education] Create successful', {
        userId,
        educationId: newId,
        elapsedMs: Date.now() - startedAt
      });

      res.status(201).json({ ok: true, education, educationSummary });
    } catch (error) {
      console.error('[Education] Create request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo crear el registro educativo.');
    }
  });

  app.put('/profile/:userId/education/:educationId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);
    const educationId = Number.parseInt(req.params.educationId, 10);

    console.info('[Education] Update request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      educationId: Number.isNaN(educationId) ? req.params.educationId : educationId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Education] Update request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!Number.isInteger(educationId) || educationId <= 0) {
      console.warn('[Education] Update request rejected: invalid education id', {
        path: req.originalUrl,
        educationId: req.params.educationId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de educación no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Education] Update request rejected: missing access token', {
        path: req.originalUrl,
        userId,
        educationId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    let normalizedPayload;

    try {
      normalizedPayload = normalizeEducationPayload(req.body || {});
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Los datos enviados no son válidos.';
      return res.status(400).json({ ok: false, error: message });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Education] Update request rejected: invalid access token', {
          path: req.originalUrl,
          userId,
          educationId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      await executeQuery(
        `BEGIN sp_educacion_pkg.sp_actualizar_educacion(
           p_id_educacion => :educationId,
           p_id_usuario   => :userId,
           p_institucion  => :institution,
           p_grado        => :degree,
           p_area_estudio => :fieldOfStudy,
           p_fecha_inicio => :startDate,
           p_fecha_fin    => :endDate,
           p_descripcion  => :description
         ); END;`,
        {
          educationId,
          userId,
          institution: normalizedPayload.institution,
          degree: normalizedPayload.degree,
          fieldOfStudy: normalizedPayload.fieldOfStudy,
          startDate: normalizedPayload.startDate,
          endDate: normalizedPayload.endDate,
          description: normalizedPayload.description
        },
        { autoCommit: true }
      );

      const [education, educationSummary] = await Promise.all([
        getEducationEntry(userId, educationId),
        getEducationStatus(userId)
      ]);

      if (!education) {
        throw new Error('No se encontró el registro educativo actualizado.');
      }

      console.info('[Education] Update successful', {
        userId,
        educationId,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, education, educationSummary });
    } catch (error) {
      console.error('[Education] Update request failed', {
        userId,
        educationId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo actualizar el registro educativo.');
    }
  });

  app.delete('/profile/:userId/education/:educationId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);
    const educationId = Number.parseInt(req.params.educationId, 10);

    console.info('[Education] Delete request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      educationId: Number.isNaN(educationId) ? req.params.educationId : educationId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Education] Delete request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!Number.isInteger(educationId) || educationId <= 0) {
      console.warn('[Education] Delete request rejected: invalid education id', {
        path: req.originalUrl,
        educationId: req.params.educationId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de educación no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Education] Delete request rejected: missing access token', {
        path: req.originalUrl,
        userId,
        educationId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Education] Delete request rejected: invalid access token', {
          path: req.originalUrl,
          userId,
          educationId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      await executeQuery(
        `BEGIN sp_educacion_pkg.sp_eliminar_educacion(
           p_id_educacion => :educationId,
           p_id_usuario   => :userId
         ); END;`,
        {
          educationId,
          userId
        },
        { autoCommit: true }
      );

      const educationSummary = await getEducationStatus(userId);

      console.info('[Education] Delete successful', {
        userId,
        educationId,
        remainingRecords: educationSummary.totalRecords,
        elapsedMs: Date.now() - startedAt
      });

      res.json({ ok: true, educationSummary });
    } catch (error) {
      console.error('[Education] Delete request failed', {
        userId,
        educationId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo eliminar el registro educativo.');
    }
  });
}

module.exports = {
  registerEducationRoutes
};
