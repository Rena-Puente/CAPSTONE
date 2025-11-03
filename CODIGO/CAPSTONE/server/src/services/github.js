const { fetch } = require('undici');

const { config } = require('../config');

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_USER_AGENT = 'CAPSTONE-OAuth-Server';

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

module.exports = {
  GithubOAuthError,
  buildGithubAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubUserProfile
};
