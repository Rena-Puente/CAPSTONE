const { getClientIp } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const {
  normalizeCompanyPayload,
  createCompany,
  getCompanyForUser,
  createOffer,
  listApplicants,
  updateApplicationStatus,
  ApplicationStatusUpdateError,
  APPLICATION_STATUS_VALUES
} = require('../services/companies');
const { getUserIdFromAccessToken } = require('../services/auth');
const { requireAccessToken } = require('../middleware/auth');

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

  app.get('/companies/me', requireAccessToken, async (req, res) => {
    const accessToken = req.auth?.accessToken ?? null;

    try {
      const userId = await getUserIdFromAccessToken(accessToken);

      if (!userId) {
        return res.status(401).json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
      }

      const company = await getCompanyForUser(userId);

      if (!company) {
        return res.status(404).json({ ok: false, error: 'No se encontró una empresa asociada al usuario.' });
      }

      return res.json({ ok: true, company });
    } catch (error) {
      console.error('[Companies] Failed to fetch company profile', {
        path: req.originalUrl,
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo obtener la información de la empresa.' });
    }
  });

  app.post('/companies/offers', requireAccessToken, async (req, res) => {
    const accessToken = req.auth?.accessToken ?? null;

    try {
      const userId = await getUserIdFromAccessToken(accessToken);

      if (!userId) {
        return res.status(401).json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
      }

      const company = await getCompanyForUser(userId);

      if (!company || !company.id) {
        return res.status(404).json({ ok: false, error: 'No se encontró una empresa asociada al usuario.' });
      }

      let offer;

      try {
        offer = await createOffer(company.id, req.body || {});
      } catch (validationError) {
        const message = validationError instanceof Error ? validationError.message : 'Los datos de la oferta no son válidos.';
        return res.status(400).json({ ok: false, error: message });
      }

      return res.status(201).json({
        ok: true,
        message: 'Oferta creada correctamente.',
        offer
      });
    } catch (error) {
      console.error('[Companies] Failed to create offer', {
        path: req.originalUrl,
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo crear la oferta.' });
    }
  });

  app.get('/companies/me/applicants', requireAccessToken, async (req, res) => {
    const accessToken = req.auth?.accessToken ?? null;

    try {
      const userId = await getUserIdFromAccessToken(accessToken);

      if (!userId) {
        return res.status(401).json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
      }

      const company = await getCompanyForUser(userId);

      if (!company || !company.id) {
        return res.status(404).json({ ok: false, error: 'No se encontró una empresa asociada al usuario.' });
      }

      const applicants = await listApplicants(company.id);

      return res.json({ ok: true, applicants });
    } catch (error) {
      console.error('[Companies] Failed to list applicants', {
        path: req.originalUrl,
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo obtener la lista de postulantes.' });
    }
  });

  app.patch('/companies/me/applicants/:applicationId/status', requireAccessToken, async (req, res) => {
    const accessToken = req.auth?.accessToken ?? null;
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const requestedStatus =
      req.body?.status ?? req.body?.estado ?? req.body?.state ?? req.body?.nuevoEstado ?? null;

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      return res.status(400).json({ ok: false, error: 'El identificador de la postulación no es válido.' });
    }

    try {
      const userId = await getUserIdFromAccessToken(accessToken);

      if (!userId) {
        return res.status(401).json({ ok: false, error: 'No se pudo determinar el usuario de la sesión.' });
      }

      const company = await getCompanyForUser(userId);

      if (!company || !company.id) {
        return res.status(404).json({ ok: false, error: 'No se encontró una empresa asociada al usuario.' });
      }

      const application = await updateApplicationStatus(company.id, applicationId, requestedStatus);

      return res.json({
        ok: true,
        message: 'Estado de la postulación actualizado correctamente.',
        application: {
          id: application.applicationId,
          status: application.status,
          previousStatus: application.previousStatus
        }
      });
    } catch (error) {
      if (error instanceof ApplicationStatusUpdateError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.message,
          code: error.code,
          allowedStatuses: APPLICATION_STATUS_VALUES
        });
      }

      console.error('[Companies] Failed to update application status', {
        path: req.originalUrl,
        method: req.method,
        applicationId,
        error: error?.message || error
      });

      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo actualizar el estado de la postulación.' });
    }
  });
}

module.exports = {
  registerCompanyRoutes
};
