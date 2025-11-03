const cors = require('cors');

const { executeQuery } = require('../db/oracle');
const { requireAccessToken } = require('../middleware/auth');
const { getClientIp, extractBearerToken } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { isAccessTokenValid } = require('../services/auth');
const { getEducationStatus } = require('../services/education');
const { getExperienceStatus } = require('../services/experience');
const { getSkillStatus } = require('../services/skills');
const {
  mapRowToProfile,
  buildProfileEnvelope,
  createDefaultFieldStatuses,
  validateProfilePayload,
  computeProfileMissingFields
} = require('../services/profile');

function registerProfileRoutes(app) {
  app.options('/profile/status/:userId', cors());
  app.options('/profile/:userId', cors());

  app.get('/profile/status/:userId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Profile] Status request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Profile] Status request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Profile] Status request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Profile] Status request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      console.info('[Profile] Status request authorized', {
        userId,
        elapsedMs: Date.now() - startedAt
      });

      await executeQuery(
        'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
        { userId },
        { autoCommit: true }
      );

      const result = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                url_avatar,
                perfil_completo
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const row = result.rows?.[0] ?? null;
      const [educationSummary, experienceSummary, skillsSummary] = await Promise.all([
        getEducationStatus(userId),
        getExperienceStatus(userId),
        getSkillStatus(userId)
      ]);
      const missingFields = computeProfileMissingFields(
        row,
        educationSummary,
        experienceSummary,
        skillsSummary
      );

      if (!row) {
        return res.json({
          ok: true,
          profile: null,
          isComplete: false,
          missingFields,
          educationSummary,
          experienceSummary,
          skillsSummary
        });
      }

      const isComplete = String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S';

      res.json({
        ok: true,
        profile: {
          displayName: row.NOMBRE_MOSTRAR ?? null,
          career: row.TITULAR ?? null,
          biography: row.BIOGRAFIA ?? null,
          country: row.PAIS ?? null,
          city: row.CIUDAD ?? null,
          avatarUrl: row.URL_AVATAR ?? null
        },
        isComplete,
        missingFields,
        educationSummary,
        experienceSummary,
        skillsSummary
      });
    } catch (error) {
      console.error('[Profile] Status request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener el estado del perfil.');
    }
  });

  app.get('/profile/:userId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Profile] Detail request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Profile] Detail request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Profile] Detail request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Profile] Detail request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const result = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                url_avatar,
                perfil_completo
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const row = result.rows?.[0] ?? null;
      const profileValues = mapRowToProfile(row);
      const [educationSummary, experienceSummary, skillsSummary] = await Promise.all([
        getEducationStatus(userId),
        getExperienceStatus(userId),
        getSkillStatus(userId)
      ]);
      const missingFields = computeProfileMissingFields(
        row,
        educationSummary,
        experienceSummary,
        skillsSummary
      );
      const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
      const isComplete = isCompleteFlag && missingFields.length === 0;
      const message = row ? null : 'Aún no has configurado tu perfil.';

      const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
        isComplete,
        missingFields,
        message,
        educationSummary,
        experienceSummary,
        skillsSummary
      });

      console.info('[Profile] Detail response sent', {
        userId,
        hasProfile: Boolean(row),
        isComplete,
        missingFieldsCount: missingFields.length,
        educationRecords: educationSummary?.totalRecords ?? 0,
        experienceRecords: experienceSummary?.totalRecords ?? 0,
        skillsRecords: skillsSummary?.totalSkills ?? 0,
        elapsedMs: Date.now() - startedAt
      });

      res.json(response);
    } catch (error) {
      console.error('[Profile] Detail request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener el perfil.');
    }
  });

  app.put('/profile/:userId', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Profile] Update request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(req.auth?.accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Profile] Update request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    try {
      const existingProfileResult = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                url_avatar
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const existingRow = existingProfileResult.rows?.[0] ?? null;
      const existingProfileValues = existingRow ? mapRowToProfile(existingRow) : null;

      const validation = validateProfilePayload(req.body || {}, existingProfileValues);

      if (!validation.isValid) {
        console.warn('[Profile] Update request validation failed', {
          userId,
          missingFields: validation.missingFields,
          elapsedMs: Date.now() - startedAt
        });

        const response = buildProfileEnvelope(validation.values, validation.statuses, {
          isComplete: false,
          missingFields: validation.missingFields,
          message: 'Corrige la información resaltada e inténtalo nuevamente.'
        });

        return res.json(response);
      }

      const dbPayload = {
        displayName: validation.values.displayName || null,
        career: validation.values.career || null,
        biography: validation.values.biography || null,
        country: validation.values.country || null,
        city: validation.values.city || null,
        avatarUrl: validation.values.avatarUrl || null
      };

      await executeQuery(
        `MERGE INTO perfiles dest
         USING (SELECT :userId AS id_usuario,
                       :displayName AS nombre_mostrar,
                       :career AS titular,
                       :biography AS biografia,
                       :country AS pais,
                       :city AS ciudad,
                       :avatarUrl AS url_avatar
                  FROM dual) src
            ON (dest.id_usuario = src.id_usuario)
        WHEN MATCHED THEN
          UPDATE
             SET dest.nombre_mostrar = src.nombre_mostrar,
                 dest.titular = src.titular,
                 dest.biografia = src.biografia,
                 dest.pais = src.pais,
                 dest.ciudad = src.ciudad,
                 dest.url_avatar = src.url_avatar
        WHEN NOT MATCHED THEN
          INSERT (
            id_usuario,
            nombre_mostrar,
            titular,
            biografia,
            pais,
            ciudad,
            url_avatar
          ) VALUES (
            src.id_usuario,
            src.nombre_mostrar,
            src.titular,
            src.biografia,
            src.pais,
            src.ciudad,
            src.url_avatar
          )`,
        {
          userId,
          ...dbPayload
        },
        { autoCommit: true }
      );

      await executeQuery(
        'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
        { userId },
        { autoCommit: true }
      );

      const result = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                url_avatar,
                perfil_completo
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const row = result.rows?.[0] ?? null;
      const profileValues = mapRowToProfile(row);
      const [educationSummary, experienceSummary, skillsSummary] = await Promise.all([
        getEducationStatus(userId),
        getExperienceStatus(userId),
        getSkillStatus(userId)
      ]);
      const missingFields = computeProfileMissingFields(
        row,
        educationSummary,
        experienceSummary,
        skillsSummary
      );
      const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
      const isComplete = isCompleteFlag && missingFields.length === 0;

      const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
        isComplete,
        missingFields,
        message: 'Perfil actualizado correctamente.',
        educationSummary,
        experienceSummary,
        skillsSummary
      });

      console.info('[Profile] Update successful', {
        userId,
        isComplete,
        missingFieldsCount: missingFields.length,
        educationRecords: educationSummary?.totalRecords ?? 0,
        experienceRecords: experienceSummary?.totalRecords ?? 0,
        skillsRecords: skillsSummary?.totalSkills ?? 0,
        elapsedMs: Date.now() - startedAt
      });

      res.json(response);
    } catch (error) {
      console.error('[Profile] Update failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo actualizar el perfil.');
    }
  });
}

module.exports = {
  registerProfileRoutes
};
