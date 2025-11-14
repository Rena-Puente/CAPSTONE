const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { once } = require('node:events');
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
      STRING: Symbol('STRING'),
      NUMBER: Symbol('NUMBER'),
      DB_TYPE_TIMESTAMP: Symbol('DB_TYPE_TIMESTAMP'),
      BIND_OUT: Symbol('BIND_OUT')
    },
    initPool: async () => {},
    closePool: async () => {},
    executeQuery: (...args) => executeQueryImpl(...args),
    withConnection: async (callback) => callback({}),
    fetchCursorRows: async () => [],
    normalizeCursorRow: async (row) => row,
    resolveLobValue: async (value) => value,
    __setExecuteQueryMock: (fn) => {
      executeQueryImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

function registerEmailMock() {
  const modulePath = path.resolve(__dirname, '../../src/services/email.js');
  let sendPasswordResetImpl = async () => {};

  const exports = {
    sendEmailVerification: async () => {},
    sendPasswordReset: (...args) => sendPasswordResetImpl(...args),
    buildVerificationUrl: () => {
      throw new Error('buildVerificationUrl mock no implementado');
    },
    buildPasswordResetUrl: () => {
      throw new Error('buildPasswordResetUrl mock no implementado');
    },
    __setSendPasswordResetMock: (fn) => {
      sendPasswordResetImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

const oracleMock = registerOracleMock();
const emailMock = registerEmailMock();

const { createApp } = require('../../src/app');

async function makeRequest(app, url, options = {}) {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json();
  await new Promise((resolve) => server.close(resolve));
  return { status: response.status, body };
}

beforeEach(() => {
  oracleMock.__setExecuteQueryMock(async () => {
    throw new Error('executeQuery mock not configured');
  });
  emailMock.__setSendPasswordResetMock(async () => {});
});

test('POST /auth/password/request requiere correo', async () => {
  const app = createApp();
  const { status, body } = await makeRequest(app, '/auth/password/request', {
    method: 'POST',
    body: JSON.stringify({})
  });

  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /correo/i);
});

test('POST /auth/password/request genera token y envía correo cuando existe el usuario', async () => {
  const captured = [];
  oracleMock.__setExecuteQueryMock(async (sql, binds) => {
    assert.match(sql, /sp_crear_recuperacion_contrasena/i);
    assert.equal(binds.correo, 'usuario@example.com');

    return {
      outBinds: {
        resultado: 'OK',
        token: 'abc123'
      }
    };
  });

  emailMock.__setSendPasswordResetMock(async ({ to, token }) => {
    captured.push({ to, token });
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/auth/password/request', {
    method: 'POST',
    body: JSON.stringify({ email: 'Usuario@Example.com ' })
  });

  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].to, 'usuario@example.com');
  assert.equal(captured[0].token, 'abc123');
});

test('POST /auth/password/request responde éxito aunque no exista token', async () => {
  emailMock.__setSendPasswordResetMock(async () => {
    throw new Error('No debe enviarse correo');
  });

  oracleMock.__setExecuteQueryMock(async () => ({
    outBinds: {
      resultado: 'OK',
      token: null
    }
  }));

  const app = createApp();
  const { status, body } = await makeRequest(app, '/auth/password/request', {
    method: 'POST',
    body: JSON.stringify({ email: 'sin-token@example.com' })
  });

  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
});

test('POST /auth/password/reset requiere token y contraseñas', async () => {
  let app = createApp();
  let response = await makeRequest(app, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ password: 'a', passwordConfirmation: 'a' })
  });
  assert.equal(response.status, 400);

  app = createApp();
  response = await makeRequest(app, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token: 'abc' })
  });
  assert.equal(response.status, 400);
});

test('POST /auth/password/reset actualiza la contraseña con token válido', async () => {
  oracleMock.__setExecuteQueryMock(async (sql, binds) => {
    assert.match(sql, /sp_confirmar_recuperacion_contrasena/i);
    assert.equal(binds.token, 'abc123');
    assert.equal(binds.password, 'NuevaContraseña123');
    assert.equal(binds.password2, 'NuevaContraseña123');

    return {
      outBinds: {
        resultado: 'OK'
      }
    };
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: 'abc123',
      password: 'NuevaContraseña123',
      passwordConfirmation: 'NuevaContraseña123'
    })
  });

  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
});

test('POST /auth/password/reset maneja errores de token inválido y usuario no encontrado', async () => {
  const responses = [
    { outBinds: { resultado: 'ERROR:TOKEN_INVALID' } },
    { outBinds: { resultado: 'ERROR:USER_NOT_FOUND' } }
  ];

  oracleMock.__setExecuteQueryMock(async () => {
    return responses.shift();
  });

  let app = createApp();
  let result = await makeRequest(app, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: 'zzz',
      password: 'NuevaContraseña123',
      passwordConfirmation: 'NuevaContraseña123'
    })
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.match(result.body.error, /no es válido/i);

  app = createApp();
  result = await makeRequest(app, '/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token: 'zzz',
      password: 'NuevaContraseña123',
      passwordConfirmation: 'NuevaContraseña123'
    })
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.ok, false);
  assert.match(result.body.error, /no se encontró/i);
});
