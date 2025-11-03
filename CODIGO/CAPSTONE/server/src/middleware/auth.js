const { extractBearerToken } = require('../utils/request');
const { isAccessTokenValid } = require('../services/auth');

async function requireAccessToken(req, res, next) {
  const accessToken = extractBearerToken(req);

  if (!accessToken) {
    console.warn('[Auth] Missing access token', { path: req.originalUrl });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Auth] Invalid access token', { path: req.originalUrl });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    req.auth = { ...(req.auth || {}), accessToken };
    return next();
  } catch (error) {
    console.error('[Auth] Failed to validate access token', error);
    return res.status(500).json({ ok: false, error: 'No se pudo validar el token de acceso.' });
  }
}

module.exports = {
  requireAccessToken
};
