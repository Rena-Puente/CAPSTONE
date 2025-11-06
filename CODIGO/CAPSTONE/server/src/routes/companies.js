const { getClientIp } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { normalizeCompanyPayload, createCompany } = require('../services/companies');

function registerCompanyRoutes(app) {
  app.post('/companies', async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    console.info('[Companies] Create request received', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: getClientIp(req)
    });

    let normalizedPayload;

    try {
      normalizedPayload = normalizeCompanyPayload(req.body || {});
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Los datos enviados no son válidos.';

      console.warn('[Companies] Create request rejected: validation failed', {
        requestId,
        path: req.originalUrl,
        error: message
      });

      return res.status(400).json({ ok: false, error: message });
    }

    try {
      const company = await createCompany(normalizedPayload, { skipValidation: true });

      console.info('[Companies] Create response sent', {
        requestId,
        companyId: company.id,
        name: company.name,
        elapsedMs: Date.now() - startedAt
      });

      return res.status(201).json({
        ok: true,
        message: 'Empresa registrada correctamente.',
        company
      });
    } catch (error) {
      console.error('[Companies] Create request failed', {
        requestId,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return handleOracleError(error, res, 'No se pudo registrar la empresa.');
    }
  });
}

module.exports = {
  registerCompanyRoutes
};
