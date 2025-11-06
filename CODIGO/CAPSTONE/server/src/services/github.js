const { fetch } = require('undici');

const { config } = require('../config');
const { createMemoryCache } = require('../utils/cache');

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_USER_AGENT = 'CAPSTONE-OAuth-Server';

const DEFAULT_REPOSITORY_LIMIT = 6;
const MAX_REPOSITORY_LIMIT = 50;
const DEFAULT_REPOSITORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const DEFAULT_LANGUAGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 30_000;

const repositoryCache = createMemoryCache({
  ttlMs: DEFAULT_REPOSITORY_CACHE_TTL,
  maxEntries: 200
});

const languageCache = createMemoryCache({
  ttlMs: DEFAULT_LANGUAGE_CACHE_TTL,
  maxEntries: 400
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GithubApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
    this.details = details;
  }
}

class GithubOAuthError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'GithubOAuthError';
    this.status = status;
    this.details = details;
  }
}

function buildGithubAuthorizeUrl(state) {
  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    throw new GithubOAuthError('El parámetro state es obligatorio para iniciar el flujo OAuth.', 400);
  }

  const { clientId, redirectUri, scope } = config.oauth.github;
  const url = new URL(GITHUB_AUTHORIZE_URL);

  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');

  return url.toString();
}

async function exchangeCodeForToken({ code, state }) {
  if (!code || typeof code !== 'string') {
    throw new GithubOAuthError('El código de autorización es obligatorio.', 400);
  }

  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    client_secret: config.oauth.github.clientSecret,
    code,
    redirect_uri: config.oauth.github.redirectUri
  });

  if (state) {
    params.set('state', state);
  }

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json'
    },
    body: params
  });

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new GithubOAuthError('No se pudo interpretar la respuesta de GitHub.', response.status || 500, {
      cause: error
    });
  }

  if (!response.ok || payload.error) {
    const message = payload.error_description || payload.error || 'GitHub rechazó la solicitud de intercambio de código.';
    const status = response.status >= 400 && response.status < 500 ? 401 : response.status || 500;

    throw new GithubOAuthError(message, status, payload);
  }

  if (!payload.access_token) {
    throw new GithubOAuthError('GitHub no devolvió un token de acceso.', 401, payload);
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type || 'bearer',
    scope: payload.scope || '',
    refreshToken: payload.refresh_token || null,
    expiresIn: payload.expires_in || null
  };
}

async function fetchGithubUserProfile(accessToken) {
  if (!accessToken) {
    throw new GithubOAuthError('Se requiere un token de acceso válido para consultar el perfil.', 400);
  }

  const profile = await githubApiRequest('/user', accessToken);
  const emails = await githubApiRequest('/user/emails', accessToken);
  const primaryEmail = extractPrimaryEmail(emails);

  if (!primaryEmail) {
    throw new GithubOAuthError('GitHub no devolvió un correo electrónico principal verificado.', 500, emails);
  }

  return { profile, primaryEmail, emails };
}

async function githubApiRequest(path, accessToken) {
  const url = new URL(path.startsWith('http') ? path : `${GITHUB_API_BASE_URL}${path}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': GITHUB_USER_AGENT
    }
  });

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new GithubOAuthError('No se pudo interpretar la respuesta del API de GitHub.', response.status || 500, {
      url: url.toString(),
      cause: error
    });
  }

  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status || 500;
    const message = payload.message || 'GitHub rechazó la solicitud.';

    throw new GithubOAuthError(message, status, payload);
  }

  return payload;
}

function extractPrimaryEmail(emails) {
  if (!Array.isArray(emails)) {
    return null;
  }

  const primary = emails.find((item) => item && item.primary && item.verified);

  if (primary) {
    return primary;
  }

  const verified = emails.find((item) => item && item.verified);

  return verified || emails[0] || null;
}

function parseRepositoryLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_REPOSITORY_LIMIT;
  }

  return Math.min(parsed, MAX_REPOSITORY_LIMIT);
}

function normalizeRepositorySort(rawSort) {
  const normalized = typeof rawSort === 'string' ? rawSort.trim().toLowerCase() : '';

  return normalized === 'stars' ? 'stars' : 'recent';
}

async function githubPublicRequest(path, { query, retries = 2, signal } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${GITHUB_API_BASE_URL}${path}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let attempt = 0;
  let delayMs = DEFAULT_RETRY_DELAY_MS;

  while (true) {
    attempt += 1;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': GITHUB_USER_AGENT
        },
        signal
      });

      let payload;

      try {
        payload = await response.json();
      } catch (error) {
        throw new GithubApiError('No se pudo interpretar la respuesta de GitHub.', response.status || 500, {
          url: url.toString(),
          cause: error
        });
      }

      if (response.ok) {
        return payload;
      }

      const rateRemaining = response.headers?.get?.('x-ratelimit-remaining');
      const rateResetRaw = response.headers?.get?.('x-ratelimit-reset');
      const retryAfterHeader = response.headers?.get?.('retry-after');
      const status = response.status || 500;
      const message = payload?.message || 'GitHub rechazó la solicitud.';

      const error = new GithubApiError(message, status, {
        url: url.toString(),
        response: payload
      });

      const reachedRateLimit = status === 403 && rateRemaining === '0';
      const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const resetSeconds = rateResetRaw ? Number.parseInt(rateResetRaw, 10) : null;

      if ((status >= 500 || status === 429 || reachedRateLimit) && attempt <= retries + 1) {
        let waitMs = delayMs;

        if (retryAfterSeconds && Number.isFinite(retryAfterSeconds)) {
          waitMs = Math.max(retryAfterSeconds * 1000, waitMs);
        } else if (resetSeconds && Number.isFinite(resetSeconds) && resetSeconds > nowSeconds) {
          waitMs = Math.max((resetSeconds - nowSeconds) * 1000, waitMs);
        }

        await wait(Math.min(waitMs, MAX_RETRY_DELAY_MS));
        delayMs = Math.min(delayMs * 2, MAX_RETRY_DELAY_MS);
        continue;
      }

      throw error;
    } catch (error) {
      if (error instanceof GithubApiError) {
        if (attempt <= retries + 1 && (error.status >= 500 || error.status === 429)) {
          await wait(Math.min(delayMs, MAX_RETRY_DELAY_MS));
          delayMs = Math.min(delayMs * 2, MAX_RETRY_DELAY_MS);
          continue;
        }

        throw error;
      }

      if (attempt <= retries + 1) {
        await wait(Math.min(delayMs, MAX_RETRY_DELAY_MS));
        delayMs = Math.min(delayMs * 2, MAX_RETRY_DELAY_MS);
        continue;
      }

      throw new GithubApiError('No se pudo completar la solicitud hacia GitHub.', 502, {
        url: url.toString(),
        cause: error
      });
    }
  }
}

function normalizeRepositoryPayload(repo) {
  if (!repo || typeof repo !== 'object') {
    return null;
  }

  return {
    id: repo.id ?? null,
    nodeId: repo.node_id ?? null,
    name: repo.name ?? null,
    fullName: repo.full_name ?? null,
    description: repo.description ?? null,
    htmlUrl: repo.html_url ?? null,
    homepage: repo.homepage || null,
    language: repo.language ?? null,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    stargazersCount: repo.stargazers_count ?? 0,
    watchersCount: repo.watchers_count ?? 0,
    forksCount: repo.forks_count ?? 0,
    openIssuesCount: repo.open_issues_count ?? 0,
    visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
    license: repo.license
      ? {
        key: repo.license?.key ?? null,
        name: repo.license?.name ?? null,
        spdxId: repo.license?.spdx_id ?? null
      }
      : null,
    createdAt: repo.created_at ?? null,
    updatedAt: repo.updated_at ?? null,
    pushedAt: repo.pushed_at ?? null,
    archived: Boolean(repo.archived),
    disabled: Boolean(repo.disabled)
  };
}

async function fetchGithubRepositories(username, options = {}) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';

  if (!normalizedUsername) {
    throw new GithubApiError('El usuario de GitHub es obligatorio para consultar repositorios.', 400);
  }

  const limit = parseRepositoryLimit(options.limit);
  const sort = normalizeRepositorySort(options.sort);
  const cacheKey = JSON.stringify({ kind: 'repos', username: normalizedUsername.toLowerCase(), limit, sort });
  const ttlMs = options.cacheTtlMs ?? DEFAULT_REPOSITORY_CACHE_TTL;

  return repositoryCache.remember(cacheKey, async () => {
    const perPage = Math.min(Math.max(limit * 2, limit), 100);
    const payload = await githubPublicRequest(`/users/${encodeURIComponent(normalizedUsername)}/repos`, {
      query: {
        sort: 'updated',
        direction: 'desc',
        per_page: perPage
      },
      retries: options.retries ?? 2
    });

    if (!Array.isArray(payload)) {
      throw new GithubApiError('GitHub devolvió una respuesta inesperada al listar repositorios.', 502, payload);
    }

    const repositories = payload
      .filter((repo) => repo && !repo.fork)
      .map((repo) => ({
        ...normalizeRepositoryPayload(repo),
        size: repo.size ?? 0
      }));

    if (sort === 'stars') {
      repositories.sort((a, b) => (b.stargazersCount ?? 0) - (a.stargazersCount ?? 0));
    } else {
      repositories.sort((a, b) => {
        const pushedA = a.pushedAt ? Date.parse(a.pushedAt) || 0 : 0;
        const pushedB = b.pushedAt ? Date.parse(b.pushedAt) || 0 : 0;
        return pushedB - pushedA;
      });
    }

    return repositories.slice(0, limit);
  }, ttlMs);
}

async function fetchRepositoryLanguages(owner, repoName, options = {}) {
  const normalizedOwner = typeof owner === 'string' ? owner.trim() : '';
  const normalizedRepo = typeof repoName === 'string' ? repoName.trim() : '';

  if (!normalizedOwner || !normalizedRepo) {
    return {};
  }

  const cacheKey = JSON.stringify({ kind: 'languages', owner: normalizedOwner.toLowerCase(), repo: normalizedRepo.toLowerCase() });
  const ttlMs = options.cacheTtlMs ?? DEFAULT_LANGUAGE_CACHE_TTL;

  return languageCache.remember(cacheKey, async () => {
    const payload = await githubPublicRequest(
      `/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepo)}/languages`,
      { retries: options.retries ?? 2 }
    );

    if (!payload || typeof payload !== 'object') {
      return {};
    }

    return payload;
  }, ttlMs);
}

async function fetchGithubLanguageSummary(owner, repositories, options = {}) {
  const normalizedOwner = typeof owner === 'string' ? owner.trim() : '';

  if (!normalizedOwner) {
    throw new GithubApiError('El usuario de GitHub es obligatorio para consultar lenguajes.', 400);
  }

  const limit = parseRepositoryLimit(options.limit ?? repositories?.length ?? DEFAULT_REPOSITORY_LIMIT);
  const repoList = Array.isArray(repositories) ? repositories.slice(0, limit) : [];
  const languageTotals = new Map();
  let totalBytes = 0;

  for (const repo of repoList) {
    const repoName = typeof repo?.name === 'string' ? repo.name : null;

    if (!repoName) {
      continue;
    }

    const languages = await fetchRepositoryLanguages(normalizedOwner, repoName, options);

    for (const [language, bytes] of Object.entries(languages)) {
      const parsedBytes = Number.parseInt(bytes, 10);

      if (!Number.isFinite(parsedBytes) || parsedBytes <= 0) {
        continue;
      }

      totalBytes += parsedBytes;
      languageTotals.set(language, (languageTotals.get(language) ?? 0) + parsedBytes);
    }
  }

  const breakdown = Array.from(languageTotals.entries())
    .map(([language, bytes]) => ({
      language,
      bytes,
      percentage: totalBytes > 0 ? bytes / totalBytes : 0
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return { totalBytes, breakdown };
}

function __clearGithubCaches() {
  repositoryCache.clear();
  languageCache.clear();
}

module.exports = {
  GithubOAuthError,
  GithubApiError,
  buildGithubAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubUserProfile,
  fetchGithubRepositories,
  fetchGithubLanguageSummary,
  __clearGithubCaches
};
