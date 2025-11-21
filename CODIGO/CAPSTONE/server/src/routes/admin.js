const cors = require('cors');

const { requireAccessToken } = require('../middleware/auth');
const { fetchExecutiveSummary } = require('../services/admin');
const { getClientIp } = require('../utils/request');

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function registerAdminRoutes(app) {
  app.options('/admin/resumen-ejecutivo', cors());

  app.post('/admin/resumen-ejecutivo', cors(), requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const rawStartDate = req.body?.fecha_inicio ?? req.body?.fechaInicio ?? null;
    const rawEndDate = req.body?.fecha_fin ?? req.body?.fechaFin ?? null;

    const startDate = parseDate(rawStartDate);
    const endDate = parseDate(rawEndDate);

    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ ok: false, error: 'La fecha de inicio no puede ser mayor que la fecha fin.' });
    }

    try {
      const summary = await fetchExecutiveSummary(startDate, endDate);

      return res.json({
        ok: true,
        message: 'Resumen ejecutivo generado correctamente.',
        data: summary.parsed,
        clob: summary.raw
      });
    } catch (error) {
      console.error('[Admin] Failed to generate executive summary', {
        path: req.originalUrl,
        method: req.method,
        ip: getClientIp(req),
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return res.status(500).json({ ok: false, error: 'No se pudo obtener el resumen ejecutivo.' });
    }
  });
}

module.exports = {
  registerAdminRoutes
};
