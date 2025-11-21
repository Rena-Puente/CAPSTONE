const { executeQuery, oracledb } = require('../db/oracle');

const defaultExecutiveSummary = Object.freeze({
  postulantes_por_mes: [],
  empresas_por_mes: [],
  ofertas_por_mes: [],
  postulaciones_por_mes: [],
  avg_postulantes_por_oferta: 0,
  ofertas_activas: 0,
  empresas_inactivas: 0
});

function parseExecutiveSummary(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return { raw: null, parsed: { ...defaultExecutiveSummary } };
  }

  const raw = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);

  try {
    const parsed = JSON.parse(raw);
    return { raw, parsed: parsed && typeof parsed === 'object' ? parsed : { ...defaultExecutiveSummary } };
  } catch (error) {
    console.warn('[Admin] Failed to parse executive summary payload, falling back to defaults', error);
    return { raw, parsed: { ...defaultExecutiveSummary } };
  }
}

async function fetchExecutiveSummary(startDate, endDate) {
  const result = await executeQuery(
    `BEGIN sp_resumen_ejecutivo(
         p_fecha_inicio => :startDate,
         p_fecha_fin    => :endDate,
         o_resultado    => :summary
       ); END;`,
    {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      summary: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
    }
  );

  const outBinds = result.outBinds || {};
  const { raw, parsed } = parseExecutiveSummary(outBinds.summary ?? null);

  return { raw, parsed };
}

module.exports = {
  fetchExecutiveSummary,
  defaultExecutiveSummary
};
