require('dotenv').config();

const path = require('path');

const {
  PORT = 3000,
  DB_USER,
  DB_PASSWORD,
  DB_CONNECT_ALIAS,
  DB_WALLET_DIR,
  DB_WALLET_PASSWORD,
  ACCESS_TOKEN_MINUTES = '15',
  REFRESH_TOKEN_DAYS = '30',
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GITHUB_REDIRECT_URI,
  GITHUB_SCOPE,
  RESEND_API_KEY,
  EMAIL_FROM,
  EMAIL_VERIFICATION_BASE_URL,
  EMAIL_PASSWORD_RESET_BASE_URL
} = process.env;

function normalizeOptionalEnv(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureEnv(value, name) {
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

const projectRoot = path.resolve(__dirname, '..', '..');
const resolvedWalletDir = path.resolve(projectRoot, ensureEnv(DB_WALLET_DIR, 'DB_WALLET_DIR'));
const port = Number.parseInt(PORT, 10) || 3000;
const accessTokenMinutes = Number.parseInt(ACCESS_TOKEN_MINUTES, 10);
const refreshTokenDays = Number.parseInt(REFRESH_TOKEN_DAYS, 10);

if (!Number.isInteger(accessTokenMinutes) || accessTokenMinutes <= 0) {
  throw new Error('ACCESS_TOKEN_MINUTES must be a positive integer');
}

if (!Number.isInteger(refreshTokenDays) || refreshTokenDays <= 0) {
  throw new Error('REFRESH_TOKEN_DAYS must be a positive integer');
}

const githubScope = ensureEnv(GITHUB_SCOPE, 'GITHUB_SCOPE');
const githubScopeList = githubScope
  .split(/[\s,]+/)
  .map((item) => item.trim())
  .filter((item) => item.length > 0);

const emailConfig = {
  resendApiKey: normalizeOptionalEnv(RESEND_API_KEY),
  from: normalizeOptionalEnv(EMAIL_FROM),
  verificationBaseUrl: normalizeOptionalEnv(EMAIL_VERIFICATION_BASE_URL),
  passwordResetBaseUrl: normalizeOptionalEnv(EMAIL_PASSWORD_RESET_BASE_URL)
};

const missingEmailVariables = Object.entries({
  RESEND_API_KEY: emailConfig.resendApiKey,
  EMAIL_FROM: emailConfig.from,
  EMAIL_VERIFICATION_BASE_URL: emailConfig.verificationBaseUrl,
  EMAIL_PASSWORD_RESET_BASE_URL: emailConfig.passwordResetBaseUrl
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

emailConfig.enabled = missingEmailVariables.length === 0;
emailConfig.missingVariables = missingEmailVariables;

if (!emailConfig.enabled) {
  const message =
    missingEmailVariables.length > 0
      ? `Faltan las variables de entorno: ${missingEmailVariables.join(', ')}`
      : 'Faltan variables de entorno para habilitar el envío de correos.';

  console.warn('[Config] El envío de correos de verificación está deshabilitado.', message);
}

const config = {
  port,
  tokens: {
    accessTokenMinutes,
    refreshTokenDays
  },
  email: {
    ...emailConfig
  },
  db: {
    user: ensureEnv(DB_USER, 'DB_USER'),
    password: ensureEnv(DB_PASSWORD, 'DB_PASSWORD'),
    connectAlias: ensureEnv(DB_CONNECT_ALIAS, 'DB_CONNECT_ALIAS'),
    walletDir: resolvedWalletDir,
    walletPassword: DB_WALLET_PASSWORD || undefined
  },
  paths: {
    projectRoot,
    walletDir: resolvedWalletDir
  },
  oauth: {
    github: {
      clientId: ensureEnv(GITHUB_CLIENT_ID, 'GITHUB_CLIENT_ID'),
      clientSecret: ensureEnv(GITHUB_CLIENT_SECRET, 'GITHUB_CLIENT_SECRET'),
      redirectUri: ensureEnv(GITHUB_REDIRECT_URI, 'GITHUB_REDIRECT_URI'),
      scope: githubScope,
      scopeList: githubScopeList
    }
  }
};

module.exports = {
  config,
  ensureEnv,
  resolvedWalletDir
};
