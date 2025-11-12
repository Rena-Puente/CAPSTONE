export interface CareerCatalogItem {
  id: number | null;
  name: string;
}

export interface CareerCatalogCategory {
  category: string;
  items: CareerCatalogItem[];
}

export interface CareerCatalogItemDetail extends CareerCatalogItem {
  category: string;
}

export interface CareerCatalogItemResponse {
  id?: number | string | null;
  ID?: number | string | null;
  id_carrera?: number | string | null;
  ID_CARRERA?: number | string | null;
  name?: string | null;
  career?: string | null;
  carrera?: string | null;
  nombre?: string | null;
  category?: string | null;
  categoria?: string | null;
}

export interface CareerCatalogCategoryResponse {
  category?: string | null;
  categoria?: string | null;
  items?: (CareerCatalogItemResponse | null | undefined)[] | null;
}

export interface CareerCatalogResponse {
  ok?: boolean;
  categories?: (CareerCatalogCategoryResponse | null | undefined)[] | null;
  error?: string | null;
  message?: string | null;
}

function normalizeCategoryName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function parseCareerId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.trunc(value) : null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function normalizeCareerItemEntry(
  entry: CareerCatalogItemResponse | null | undefined,
  fallbackCategory?: string
): CareerCatalogItemDetail | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rawCategory =
    entry.category ??
    entry.categoria ??
    (typeof fallbackCategory === 'string' ? fallbackCategory : '');
  const category = normalizeCategoryName(rawCategory);

  if (!category) {
    return null;
  }

  const rawName = entry.carrera ?? entry.career ?? entry.name ?? entry.nombre ?? null;
  const name = typeof rawName === 'string' ? rawName.trim() : '';

  if (!name) {
    return null;
  }

  const id = parseCareerId(entry.id ?? entry.ID ?? entry.id_carrera ?? entry.ID_CARRERA ?? null);

  return { id, name, category };
}

export function ensureCareerItem(
  entry: CareerCatalogItemResponse | null | undefined,
  fallbackCategory?: string
): CareerCatalogItemDetail {
  const normalized = normalizeCareerItemEntry(entry, fallbackCategory);

  if (!normalized) {
    throw new Error('Los datos de la carrera no son válidos.');
  }

  return normalized;
}

export function normalizeCareerCatalogResponse(
  response: CareerCatalogResponse | null | undefined
): CareerCatalogCategory[] {
  if (!response || typeof response !== 'object') {
    throw new Error('No se pudo cargar el catálogo de carreras.');
  }

  if (response.ok === false) {
    const message = response.error || response.message || 'No se pudo cargar el catálogo de carreras.';
    throw new Error(message);
  }

  const categories = new Map<string, Map<string, CareerCatalogItem>>();
  const rawCategories = Array.isArray(response.categories) ? response.categories : [];

  for (const entry of rawCategories) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const categoryName = normalizeCategoryName(entry.category ?? entry.categoria ?? '');

    if (!categoryName) {
      continue;
    }

    const target = categories.get(categoryName) ?? new Map<string, CareerCatalogItem>();
    const rawItems = Array.isArray(entry.items) ? entry.items : [];

    for (const item of rawItems) {
      const normalized = normalizeCareerItemEntry(item, categoryName);

      if (!normalized) {
        continue;
      }

      const key = normalized.name.toLocaleLowerCase('es');
      const existing = target.get(key);

      if (!existing) {
        target.set(key, { id: normalized.id, name: normalized.name });
      } else if (!existing.id && normalized.id) {
        existing.id = normalized.id;
      }
    }

    categories.set(categoryName, target);
  }

  const result: CareerCatalogCategory[] = Array.from(categories.entries()).map(([category, items]) => ({
    category,
    items: Array.from(items.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    )
  }));

  result.sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  return result;
}
