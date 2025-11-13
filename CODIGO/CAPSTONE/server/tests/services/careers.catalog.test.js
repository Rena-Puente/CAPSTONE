const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');

const moduleCache = require.cache;
const defaultCatalogSeed = require('../../src/data/default-career-catalog.json');

function registerOracleMock() {
  const modulePath = path.resolve(__dirname, '../../src/db/oracle.js');
  let executeQueryImpl = async () => {
    throw new Error('executeQuery mock not configured');
  };

  const exports = {
    config: {},
    oracledb: {
      BIND_IN: Symbol('BIND_IN'),
      STRING: 'STRING',
      BIND_OUT: Symbol('BIND_OUT'),
      NUMBER: 'NUMBER'
    },
    executeQuery: (...args) => executeQueryImpl(...args),
    __setExecuteQueryMock: (fn) => {
      executeQueryImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

const oracleMock = registerOracleMock();
const careersService = require('../../src/services/careers');

beforeEach(() => {
  oracleMock.__setExecuteQueryMock(async () => {
    throw new Error('executeQuery mock not configured');
  });
});

test('listCareerCatalog parses item collections provided as JSON strings', async () => {
  const categories = [
    {
      categoria: 'Tecnología',
      items: JSON.stringify([
        { id: 10, carrera: 'Backend' },
        { id: 11, CARRERA: 'Frontend' },
        { id: '12', name: 'QA Automation' }
      ])
    },
    {
      category: 'Idiomas',
      items: JSON.stringify([
        { ID: 1, career: 'Inglés' },
        { ID_CARRERA: 2, NAME: 'Francés' }
      ])
    }
  ];

  oracleMock.__setExecuteQueryMock(async () => ({
    rows: [
      {
        JSON_DATA: JSON.stringify(categories)
      }
    ]
  }));

  const result = await careersService.listCareerCatalog();

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    category: 'Idiomas',
    items: [
      { id: 2, name: 'Francés' },
      { id: 1, name: 'Inglés' }
    ]
  });
  assert.deepEqual(result[1], {
    category: 'Tecnología',
    items: [
      { id: 10, name: 'Backend' },
      { id: 11, name: 'Frontend' },
      { id: 12, name: 'QA Automation' }
    ]
  });
});

test('listCareerCatalog returns default dataset when database returns no rows', async () => {
  let fallbackSelects = 0;
  let createCalls = 0;

  oracleMock.__setExecuteQueryMock(async (sql) => {
    if (/fn_carreras_por_categoria_json/.test(sql)) {
      return { rows: [{ JSON_DATA: '[]' }] };
    }

    if (/FROM carreras/i.test(sql)) {
      fallbackSelects += 1;
      return { rows: [] };
    }

    if (/sp_carrera_crear/.test(sql)) {
      createCalls += 1;
      return { outBinds: { careerId: createCalls } };
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  const result = await careersService.listCareerCatalog();

  assert.equal(createCalls, 0);
  assert.equal(fallbackSelects, 1);
  assert.equal(result.length > 0, true);

  const expected = (Array.isArray(defaultCatalogSeed) ? defaultCatalogSeed : [])
    .map((entry) => ({
      category: entry.category.trim(),
      items: entry.items
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  const normalizedResult = result
    .map((entry) => ({
      category: entry.category,
      items: entry.items.map((item) => item.name)
    }))
    .map((entry) => ({
      category: entry.category,
      items: entry.items.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  assert.deepEqual(normalizedResult, expected);
});

test('listCareerCatalog consistently uses default dataset when database stays empty', async () => {
  let fallbackSelects = 0;
  let createCalls = 0;

  oracleMock.__setExecuteQueryMock(async (sql) => {
    if (/fn_carreras_por_categoria_json/.test(sql)) {
      return { rows: [{ JSON_DATA: '[]' }] };
    }

    if (/FROM carreras/i.test(sql)) {
      fallbackSelects += 1;
      return { rows: [] };
    }

    if (/sp_carrera_crear/.test(sql)) {
      createCalls += 1;
      return { outBinds: { careerId: createCalls } };
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  const firstResult = await careersService.listCareerCatalog();
  const secondResult = await careersService.listCareerCatalog();

  assert.equal(createCalls, 0);
  assert.equal(fallbackSelects, 2);
  assert.equal(Array.isArray(firstResult), true);
  assert.equal(Array.isArray(secondResult), true);
  assert.equal(firstResult.length > 0, true);
  assert.equal(secondResult.length > 0, true);

  const mapToComparable = (collection) =>
    collection
      .map((entry) => ({
        category: entry.category,
        items: entry.items.map((item) => item.name)
      }))
      .map((entry) => ({
        category: entry.category,
        items: entry.items.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  assert.deepEqual(mapToComparable(firstResult), mapToComparable(secondResult));
});
