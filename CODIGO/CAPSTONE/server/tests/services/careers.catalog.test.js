const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');

const moduleCache = require.cache;

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
