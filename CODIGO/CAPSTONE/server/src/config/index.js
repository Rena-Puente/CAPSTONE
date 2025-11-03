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
  REFRESH_TOKEN_DAYS = '30'
} = process.env;

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

const config = {
  port,
  tokens: {
    accessTokenMinutes,
    refreshTokenDays
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
  }
};

module.exports = {
  config,
  ensureEnv,
  resolvedWalletDir
};
