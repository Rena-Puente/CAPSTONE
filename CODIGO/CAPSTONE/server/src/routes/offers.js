const { requireAccessToken } = require('../middleware/auth');
const { getClientIp } = require('../utils/request');
const { getUserIdFromAccessToken } = require('../services/auth');
const { listPublicOffers, applyToOffer, OfferApplicationError } = require('../services/offers');
const { serializeOfferAnswers } = require('../utils/questions');

function registerOfferRoutes(app) {
  app.get('/offers', async (req, res) => {
    const startedAt = Date.now();

    try {
      const offers = await listPublicOffers();

      return res.json({ ok: true, offers });
    } catch (error) {
      console.error('[Offers] Failed to list offers', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return res.status(500).json({
        ok: false,
        error: 'No se pudieron obtener las ofertas disponibles.'
      });
    }
  });

  app.post('/offers/:offerId/apply', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const accessToken = req.auth?.accessToken ?? null;
    const rawOfferId = Number.parseInt(req.params.offerId, 10);

    if (!Number.isInteger(rawOfferId) || rawOfferId <= 0) {
      return res.status(400).json({ ok: false, error: 'El identificador de la oferta no es válido.' });
    }

    try {
      const userId = await getUserIdFromAccessToken(accessToken);

      if (!userId) {
        return res
          .status(401)
          .json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
      }

      const coverLetter =
        typeof req.body?.coverLetter === 'string' ? req.body.coverLetter : null;

      let answersJson = '[]';

      try {
        answersJson = serializeOfferAnswers(req.body?.answers ?? req.body?.respuestas);
      } catch (validationError) {
        const message =
          validationError instanceof Error
            ? validationError.message
            : 'Las respuestas enviadas no son válidas.';

        return res.status(400).json({ ok: false, error: message });
      }

      const application = await applyToOffer(rawOfferId, userId, coverLetter, answersJson);

      return res.status(201).json({
        ok: true,
        message: 'Postulación enviada correctamente.',
        application
      });
    } catch (error) {
      if (error instanceof OfferApplicationError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code
        });
      }

      console.error('[Offers] Failed to submit application', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo registrar la postulación.' });
    }
  });
}

module.exports = {
  registerOfferRoutes
};
