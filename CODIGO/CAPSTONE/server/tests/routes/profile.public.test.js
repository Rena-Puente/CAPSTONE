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
    oracledb: {},
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

function registerEducationMock() {
  const modulePath = path.resolve(__dirname, '../../src/services/education.js');
  let listEducationImpl = async () => [];
  let getEducationStatusImpl = async () => null;

  const exports = {
    normalizeEducationPayload: () => {
      throw new Error('normalizeEducationPayload mock not implemented');
    },
    listEducation: (...args) => listEducationImpl(...args),
    getEducationEntry: async () => null,
    getEducationStatus: (...args) => getEducationStatusImpl(...args),
    __setListEducationMock: (fn) => {
      listEducationImpl = fn;
    },
    __setEducationStatusMock: (fn) => {
      getEducationStatusImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

function registerExperienceMock() {
  const modulePath = path.resolve(__dirname, '../../src/services/experience.js');
  let listExperienceImpl = async () => [];
  let getExperienceStatusImpl = async () => null;

  const exports = {
    normalizeExperiencePayload: () => {
      throw new Error('normalizeExperiencePayload mock not implemented');
    },
    listExperience: (...args) => listExperienceImpl(...args),
    getExperienceEntry: async () => null,
    getExperienceStatus: (...args) => getExperienceStatusImpl(...args),
    __setListExperienceMock: (fn) => {
      listExperienceImpl = fn;
    },
    __setExperienceStatusMock: (fn) => {
      getExperienceStatusImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

function registerSkillsMock() {
  const modulePath = path.resolve(__dirname, '../../src/services/skills.js');
  let listSkillsImpl = async () => [];
  let getSkillStatusImpl = async () => null;

  const exports = {
    normalizeSkillPayload: () => {
      throw new Error('normalizeSkillPayload mock not implemented');
    },
    listSkills: (...args) => listSkillsImpl(...args),
    listSkillCatalog: async () => [],
    getSkillEntry: async () => null,
    getSkillStatus: (...args) => getSkillStatusImpl(...args),
    __setListSkillsMock: (fn) => {
      listSkillsImpl = fn;
    },
    __setSkillStatusMock: (fn) => {
      getSkillStatusImpl = fn;
    }
  };

  moduleCache[modulePath] = { exports };
  return exports;
}

const oracleMock = registerOracleMock();
const educationMock = registerEducationMock();
const experienceMock = registerExperienceMock();
const skillsMock = registerSkillsMock();

const { createApp } = require('../../src/app');

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
  const body = await response.json();
  await new Promise((resolve) => server.close(resolve));
  return { status: response.status, body };
}

beforeEach(() => {
  oracleMock.__setExecuteQueryMock(async () => {
    throw new Error('executeQuery mock not configured');
  });
  educationMock.__setListEducationMock(async () => []);
  educationMock.__setEducationStatusMock(async () => null);
  experienceMock.__setListExperienceMock(async () => []);
  experienceMock.__setExperienceStatusMock(async () => null);
  skillsMock.__setListSkillsMock(async () => []);
  skillsMock.__setSkillStatusMock(async () => null);
});

test('GET /profiles/:slug returns the public profile when it exists', { concurrency: false }, async () => {
  const capturedCalls = [];
  oracleMock.__setExecuteQueryMock(async (...args) => {
    capturedCalls.push(args);
    return {
      rows: [
        {
          ID_USUARIO: 42,
          NOMBRE_MOSTRAR: ' Ada Lovelace ',
          TITULAR: 'Ingeniería de Software',
          BIOGRAFIA: 'A'.repeat(120),
          PAIS: 'PE',
          CIUDAD: 'Lima',
          URL_AVATAR: 'https://example.com/avatar.png',
          SLUG: 'ada-lovelace'
        }
      ]
    };
  });

  const educationEntries = [
    {
      id: 1,
      institution: 'Universidad Nacional',
      degree: 'Ingeniería',
      startDate: '2020-01-01T00:00:00.000Z',
      endDate: null,
      description: null,
      fieldOfStudy: null
    }
  ];
  const experienceEntries = [
    {
      id: 3,
      title: 'Desarrolladora',
      company: 'Tech Corp',
      startDate: '2021-01-01T00:00:00.000Z',
      endDate: null,
      location: 'Remoto',
      description: 'Construcción de APIs'
    }
  ];
  const skillEntries = [
    {
      id: 10,
      skillId: 10,
      name: 'Node.js',
      category: 'Backend',
      level: 5,
      yearsExperience: 4,
      endorsementCount: 12
    }
  ];

  educationMock.__setListEducationMock(async () => educationEntries);
  educationMock.__setEducationStatusMock(async () => ({
    hasEducation: true,
    totalRecords: 1,
    invalidDateCount: 0
  }));
  experienceMock.__setListExperienceMock(async () => experienceEntries);
  experienceMock.__setExperienceStatusMock(async () => ({
    hasExperience: true,
    totalRecords: 1,
    currentCount: 1,
    invalidDateCount: 0
  }));
  skillsMock.__setListSkillsMock(async () => skillEntries);
  skillsMock.__setSkillStatusMock(async () => ({
    totalSkills: 1,
    averageLevel: 4.5,
    maxLevel: 5,
    minLevel: 3
  }));

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/ada-lovelace');

  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    profile: {
      displayName: 'Ada Lovelace',
      career: 'Ingeniería de Software',
      biography: 'A'.repeat(120),
      country: 'PE',
      city: 'Lima',
      avatarUrl: 'https://example.com/avatar.png',
      slug: 'ada-lovelace'
    },
    education: {
      entries: educationEntries,
      summary: {
        totalRecords: 1,
        hasEducation: true,
        invalidDateCount: 0
      }
    },
    experience: {
      entries: experienceEntries,
      summary: {
        totalRecords: 1,
        currentCount: 1
      }
    },
    skills: {
      entries: skillEntries,
      summary: {
        totalSkills: 1,
        averageLevel: 4.5,
        maxLevel: 5,
        minLevel: 3
      }
    }
  });

  assert.equal(capturedCalls.length, 1);
  assert.match(capturedCalls[0][0], /WHERE slug = :slug/);
  assert.deepEqual(capturedCalls[0][1], { slug: 'ada-lovelace' });
});

test('GET /profiles/:slug rejects invalid slug format', { concurrency: false }, async () => {
  let wasCalled = false;
  oracleMock.__setExecuteQueryMock(async () => {
    wasCalled = true;
    return { rows: [] };
  });

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/INVALID!!');

  assert.equal(status, 400);
  assert.deepEqual(body, {
    ok: false,
    error: 'La URL personalizada proporcionada no es válida.'
  });
  assert.equal(wasCalled, false);
});

test('GET /profiles/:slug returns 404 when no profile matches', { concurrency: false }, async () => {
  oracleMock.__setExecuteQueryMock(async () => ({ rows: [] }));

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/not-found');

  assert.equal(status, 404);
  assert.deepEqual(body, {
    ok: false,
    error: 'No se encontró ningún perfil público con la URL proporcionada.'
  });
});

test('GET /profiles/:slug returns 409 when duplicates are detected', { concurrency: false }, async () => {
  oracleMock.__setExecuteQueryMock(async () => ({
    rows: [
      { ID_USUARIO: 10, SLUG: 'duplicated' },
      { ID_USUARIO: 11, SLUG: 'duplicated' }
    ]
  }));

  const app = createApp();
  const { status, body } = await makeRequest(app, '/profiles/duplicated');

  assert.equal(status, 409);
  assert.deepEqual(body, {
    ok: false,
    error: 'Se encontraron múltiples perfiles con la misma URL personalizada.'
  });
});
