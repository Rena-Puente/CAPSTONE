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
      BIND_OUT: Symbol('BIND_OUT'),
      NUMBER: Symbol('NUMBER')
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

function registerAuthMock() {
  const modulePath = path.resolve(__dirname, '../../src/services/auth.js');
  let isAccessTokenValidImpl = async () => true;
  let getUserIdFromAccessTokenImpl = async () => null;

  const exports = {
    summarizeToken: (value) => value,
    logAuthEvent: () => {},
    findUserByOAuth: async () => null,
    saveGithubTokens: async () => {},
    syncGithubProfileMetadata: async () => {},
    isAccessTokenValid: (...args) => isAccessTokenValidImpl(...args),
    getUserIdFromAccessToken: (...args) => getUserIdFromAccessTokenImpl(...args),
    __setIsAccessTokenValidMock: (fn) => {
      isAccessTokenValidImpl = fn;
    },
    __setGetUserIdFromAccessTokenMock: (fn) => {
      getUserIdFromAccessTokenImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

function registerUndiciMock() {
  const modulePath = require.resolve('undici');
  let fetchImpl = async () => {
    throw new Error('fetch mock not configured');
  };

  const exports = {
    fetch: (...args) => fetchImpl(...args)
  };

  moduleCache[modulePath] = { exports };

  return {
    __setFetchMock: (fn) => {
      fetchImpl = fn;
    }
  };
}

function createJsonResponse(status, body, headers = {}) {
  const headerEntries = new Map(
    Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headerEntries.get(String(name).toLowerCase()) ?? null
    },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

async function makeRequest(app, url, options = {}) {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.headers || {})
    }
  });
  const rawBody = await response.text();
  await new Promise((resolve) => server.close(resolve));

  if (!rawBody) {
    return { status: response.status, body: null };
  }

  try {
    return { status: response.status, body: JSON.parse(rawBody) };
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${rawBody}`);
  }
}

const oracleMock = registerOracleMock();
const authMock = registerAuthMock();
const undiciMock = registerUndiciMock();

const { createApp } = require('../../src/app');
const { __clearGithubCaches } = require('../../src/services/github');

beforeEach(() => {
  oracleMock.__setExecuteQueryMock(async () => {
    throw new Error('executeQuery mock not configured');
  });
  authMock.__setIsAccessTokenValidMock(async () => true);
  authMock.__setGetUserIdFromAccessTokenMock(async () => null);
  undiciMock.__setFetchMock(async () => {
    throw new Error('fetch mock not configured');
  });
  __clearGithubCaches();
});

test('GET /profile/:userId/github/repositories returns repositories for linked account', { concurrency: false }, async () => {
  authMock.__setGetUserIdFromAccessTokenMock(async () => 99);

  oracleMock.__setExecuteQueryMock(async (sql) => {
    if (/FROM\s+dual/i.test(sql) && /usuario_github/i.test(sql)) {
      return {
        rows: [
          {
            USUARIO_GITHUB: 'demo-user',
            PROVIDER_ID: '12345',
            EXPIRA_TOKEN: new Date()
          }
        ]
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  undiciMock.__setFetchMock(async (input) => {
    const url = typeof input === 'string' ? input : input?.href ?? input?.toString();

    if (!url) {
      throw new Error('Invalid URL passed to fetch');
    }

    if (url.includes('/users/demo-user/repos')) {
      return createJsonResponse(200, [
        {
          id: 1,
          name: 'alpha',
          full_name: 'demo-user/alpha',
          description: 'First repo',
          html_url: 'https://github.com/demo-user/alpha',
          stargazers_count: 5,
          forks_count: 1,
          watchers_count: 5,
          open_issues_count: 0,
          language: 'JavaScript',
          topics: ['api'],
          pushed_at: '2024-03-01T10:00:00Z',
          updated_at: '2024-03-01T10:00:00Z',
          created_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 2,
          name: 'beta',
          full_name: 'demo-user/beta',
          description: 'Second repo',
          html_url: 'https://github.com/demo-user/beta',
          stargazers_count: 15,
          forks_count: 2,
          watchers_count: 15,
          open_issues_count: 1,
          language: 'TypeScript',
          topics: ['cli'],
          pushed_at: '2024-04-01T09:00:00Z',
          updated_at: '2024-04-01T09:00:00Z',
          created_at: '2022-12-01T00:00:00Z'
        }
      ]);
    }

    if (url.includes('/repos/demo-user/alpha/languages')) {
      return createJsonResponse(200, {
        JavaScript: 1500,
        HTML: 500
      });
    }

    if (url.includes('/repos/demo-user/beta/languages')) {
      return createJsonResponse(200, {
        TypeScript: 2000,
        Shell: 200
      });
    }

    throw new Error(`Unexpected fetch request: ${url}`);
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profile/99/github/repositories?limit=2&sort=stars', {
    headers: {
      authorization: 'Bearer valid-token'
    }
  });

  assert.equal(status, 200);
  assert.deepEqual(body.repositories.map((repo) => repo.name), ['beta', 'alpha']);
  assert.equal(body.repositories[0].stargazersCount, 15);
  assert.equal(body.repositories[1].stargazersCount, 5);
  assert.equal(body.languages.totalBytes, 4200);
  assert.deepEqual(body.languages.breakdown, [
    {
      language: 'TypeScript',
      bytes: 2000,
      percentage: 2000 / 4200
    },
    {
      language: 'JavaScript',
      bytes: 1500,
      percentage: 1500 / 4200
    },
    {
      language: 'HTML',
      bytes: 500,
      percentage: 500 / 4200
    },
    {
      language: 'Shell',
      bytes: 200,
      percentage: 200 / 4200
    }
  ]);
});

test('GET /profile/:userId/github/repositories returns 404 when GitHub account is not linked', { concurrency: false }, async () => {
  authMock.__setGetUserIdFromAccessTokenMock(async () => 77);

  oracleMock.__setExecuteQueryMock(async (sql) => {
    if (/FROM\s+dual/i.test(sql) && /usuario_github/i.test(sql)) {
      return {
        rows: [
          {
            USUARIO_GITHUB: null,
            PROVIDER_ID: null,
            EXPIRA_TOKEN: null
          }
        ]
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profile/77/github/repositories', {
    headers: {
      authorization: 'Bearer token-77'
    }
  });

  assert.equal(status, 404);
  assert.deepEqual(body, {
    ok: false,
    error: 'El usuario no tiene una cuenta de GitHub vinculada.'
  });
});

test('GET /profiles/:slug/github/repositories returns 204 when GitHub account is missing', { concurrency: false }, async () => {
  oracleMock.__setExecuteQueryMock(async (sql, params) => {
    if (/WHERE\s+slug\s*=\s*:slug/i.test(sql)) {
      return {
        rows: [
          {
            ID_USUARIO: 101
          }
        ]
      };
    }

    if (/FROM\s+dual/i.test(sql) && /usuario_github/i.test(sql)) {
      return {
        rows: [
          {
            USUARIO_GITHUB: null,
            PROVIDER_ID: null,
            EXPIRA_TOKEN: null
          }
        ]
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/test-slug/github/repositories');

  assert.equal(status, 204);
  assert.equal(body, null);
});

test('GET /profiles/:slug/github/repositories returns data when username exists without OAuth link', { concurrency: false }, async () => {
  oracleMock.__setExecuteQueryMock(async (sql) => {
    if (/WHERE\s+slug\s*=\s*:slug/i.test(sql)) {
      return {
        rows: [
          {
            ID_USUARIO: 303
          }
        ]
      };
    }

    if (/FROM\s+dual/i.test(sql) && /usuario_github/i.test(sql)) {
      return {
        rows: [
          {
            USUARIO_GITHUB: 'demo-user',
            PROVIDER_ID: null,
            EXPIRA_TOKEN: null
          }
        ]
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  undiciMock.__setFetchMock(async (input) => {
    const url = typeof input === 'string' ? input : input?.href ?? input?.toString();

    if (!url) {
      throw new Error('Invalid URL passed to fetch');
    }

    if (url.includes('/users/demo-user/repos')) {
      return createJsonResponse(200, [
        {
          id: 1,
          name: 'alpha',
          full_name: 'demo-user/alpha',
          stargazers_count: 7,
          forks_count: 2,
          language: 'JavaScript',
          html_url: 'https://github.com/demo-user/alpha',
          pushed_at: '2024-05-01T00:00:00Z',
          updated_at: '2024-05-01T00:00:00Z'
        }
      ]);
    }

    if (url.includes('/repos/demo-user/alpha/languages')) {
      return createJsonResponse(200, {
        JavaScript: 1000,
        HTML: 250
      });
    }

    throw new Error(`Unexpected fetch request: ${url}`);
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/demo-slug/github/repositories');

  assert.equal(status, 200);
  assert.deepEqual(body.repositories, [
    {
      id: 1,
      nodeId: null,
      name: 'alpha',
      fullName: 'demo-user/alpha',
      description: null,
      htmlUrl: 'https://github.com/demo-user/alpha',
      homepage: null,
      language: 'JavaScript',
      topics: [],
      stargazersCount: 7,
      watchersCount: 0,
      forksCount: 2,
      openIssuesCount: 0,
      visibility: 'public',
      license: null,
      createdAt: null,
      updatedAt: '2024-05-01T00:00:00Z',
      pushedAt: '2024-05-01T00:00:00Z',
      archived: false,
      disabled: false,
      size: 0
    }
  ]);
  assert.deepEqual(body.languages, {
    totalBytes: 1250,
    breakdown: [
      { language: 'JavaScript', bytes: 1000, percentage: 1000 / 1250 },
      { language: 'HTML', bytes: 250, percentage: 250 / 1250 }
    ]
  });
});

test('GET /profiles/:slug/github/repositories propagates GitHub failures', { concurrency: false }, async () => {
  oracleMock.__setExecuteQueryMock(async (sql) => {
    if (/WHERE\s+slug\s*=\s*:slug/i.test(sql)) {
      return {
        rows: [
          {
            ID_USUARIO: 202
          }
        ]
      };
    }

    if (/FROM\s+dual/i.test(sql) && /usuario_github/i.test(sql)) {
      return {
        rows: [
          {
            USUARIO_GITHUB: 'broken-user',
            PROVIDER_ID: '999',
            EXPIRA_TOKEN: new Date()
          }
        ]
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  let attempts = 0;

  undiciMock.__setFetchMock(async (input) => {
    const url = typeof input === 'string' ? input : input?.href ?? input?.toString();

    if (!url) {
      throw new Error('Invalid URL passed to fetch');
    }

    if (url.includes('/users/broken-user/repos')) {
      attempts += 1;
      return createJsonResponse(500, { message: 'GitHub internal error' }, {
        'retry-after': '0'
      });
    }

    throw new Error(`Unexpected fetch request: ${url}`);
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/error-slug/github/repositories');

  assert.equal(status, 500);
  assert.deepEqual(body, {
    ok: false,
    error: 'No se pudo obtener los repositorios públicos de GitHub.'
  });
  assert.ok(attempts >= 1);
});
