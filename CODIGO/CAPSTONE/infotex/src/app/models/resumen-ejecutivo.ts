export interface SerieMensual {
  mes: string;
  total: number;
}

export interface ResumenEjecutivoMetrics {
  avg_postulantes_por_oferta: number;
  ofertas_activas: number;
  empresas_inactivas: number;
}

export interface ResumenEjecutivo extends ResumenEjecutivoMetrics {
  postulantes_por_mes: SerieMensual[];
  empresas_por_mes: SerieMensual[];
  ofertas_por_mes: SerieMensual[];
  postulaciones_por_mes: SerieMensual[];
}

export const defaultResumenEjecutivo: ResumenEjecutivo = {
  postulantes_por_mes: [],
  empresas_por_mes: [],
  ofertas_por_mes: [],
  postulaciones_por_mes: [],
  avg_postulantes_por_oferta: 0,
  ofertas_activas: 0,
  empresas_inactivas: 0
};

function normalizeMonth(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || 'N/D';
  }

  if (value === null || value === undefined) {
    return 'N/D';
  }

  const stringified = String(value).trim();
  return stringified || 'N/D';
}

function normalizeTotal(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeSerie(value: unknown): SerieMensual[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const series = value
    .map((item) => {
      if (item && typeof item === 'object') {
        const entry = item as { mes?: unknown; total?: unknown; month?: unknown; count?: unknown };
        const mes = normalizeMonth(entry.mes ?? entry.month);
        const total = normalizeTotal(entry.total ?? entry.count);
        return { mes, total } as SerieMensual;
      }

      return { mes: normalizeMonth(undefined), total: 0 } satisfies SerieMensual;
    })
    .filter((item) => item.mes);

  const sorted = [...series].sort((a, b) => a.mes.localeCompare(b.mes, 'es', { sensitivity: 'base' }));

  return sorted;
}

function normalizeMetric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeResumenEjecutivo(payload: unknown): ResumenEjecutivo {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  return {
    postulantes_por_mes: normalizeSerie(data['postulantes_por_mes']),
    empresas_por_mes: normalizeSerie(data['empresas_por_mes']),
    ofertas_por_mes: normalizeSerie(data['ofertas_por_mes']),
    postulaciones_por_mes: normalizeSerie(data['postulaciones_por_mes']),
    avg_postulantes_por_oferta: normalizeMetric(data['avg_postulantes_por_oferta']),
    ofertas_activas: normalizeMetric(data['ofertas_activas']),
    empresas_inactivas: normalizeMetric(data['empresas_inactivas'])
  };
}
