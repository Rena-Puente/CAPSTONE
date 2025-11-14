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
const studyHouseService = require('../../src/services/study-houses');

beforeEach(() => {
  oracleMock.__setExecuteQueryMock(async () => {
    throw new Error('executeQuery mock not configured');
  });
});

test('listStudyHouses parses entries from JSON payload', async () => {
  const entries = [
    { id: 5, casa_estudios: 'Universidad de Chile' },
    { ID_CASA_ESTUDIOS: '6', NAME: 'Duoc UC' },
    { id: 7, name: 'Universidad Técnica Federico Santa María' }
  ];

  oracleMock.__setExecuteQueryMock(async () => ({
    rows: [
      {
        JSON_DATA: JSON.stringify(entries)
      }
    ]
  }));

  const result = await studyHouseService.listStudyHouses();

  assert.equal(result.length, 3);
  assert.deepEqual(result, [
    { id: 6, name: 'Duoc UC' },
    { id: 5, name: 'Universidad de Chile' },
    { id: 7, name: 'Universidad Técnica Federico Santa María' }
  ]);
});

test('createStudyHouse returns created identifier', async () => {
  let capturedSql = null;
  let capturedBinds = null;

  oracleMock.__setExecuteQueryMock(async (sql, binds) => {
    capturedSql = sql;
    capturedBinds = binds;
    return { outBinds: { houseId: 42 } };
  });

  const result = await studyHouseService.createStudyHouse('Instituto Profesional DUOC UC');

  assert.equal(result.id, 42);
  assert.equal(result.name, 'Instituto Profesional DUOC UC');
  assert.match(capturedSql, /sp_casa_crear/i);
  assert.equal(capturedBinds.houseName, 'Instituto Profesional DUOC UC');
  assert.equal(typeof capturedBinds.houseId, 'object');
});

test('deleteStudyHouse forwards parameters to stored procedure', async () => {
  let capturedSql = null;
  let capturedBinds = null;

  oracleMock.__setExecuteQueryMock(async (sql, binds) => {
    capturedSql = sql;
    capturedBinds = binds;
    return {};
  });

  await studyHouseService.deleteStudyHouse({ id: 10 });
  assert.match(capturedSql, /sp_casa_eliminar/i);
  assert.equal(capturedBinds.houseId, 10);
  assert.equal(capturedBinds.houseName, null);

  await studyHouseService.deleteStudyHouse({ name: 'Universidad de Santiago' });
  assert.match(capturedSql, /sp_casa_eliminar/i);
  assert.equal(capturedBinds.houseId, null);
  assert.equal(capturedBinds.houseName, 'Universidad de Santiago');
});
