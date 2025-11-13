const { extractBearerToken, getClientIp } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { getUserIdFromAccessToken, isAccessTokenValid } = require('../services/auth');
const { listUserApplications } = require('../services/applications');

function registerApplicationRoutes(app) {
  app.get('/profile/:userId/applications', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Applications] List request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Applications] Invalid user id received', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Applications] Missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const [isValid, sessionUserId] = await Promise.all([
        isAccessTokenValid(accessToken),
        getUserIdFromAccessToken(accessToken)
      ]);

      if (!isValid || !sessionUserId) {
        console.warn('[Applications] Invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      if (sessionUserId !== userId) {
        console.warn('[Applications] Access denied for different user', {
          path: req.originalUrl,
          userId,
          sessionUserId
        });
        return res.status(403).json({ ok: false, error: 'No tienes permisos para ver estas postulaciones.' });
      }

      const applications = await listUserApplications(userId);

      console.info('[Applications] List response sent', {
        userId,
        count: applications.length,
        elapsedMs: Date.now() - startedAt
      });

      return res.json({ ok: true, applications });
    } catch (error) {
      console.error('[Applications] List request failed', {
        path: req.originalUrl,
        userId,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      return handleOracleError(error, res, 'No se pudieron obtener tus postulaciones.');
    }
  });
}

module.exports = {
  registerApplicationRoutes
};
