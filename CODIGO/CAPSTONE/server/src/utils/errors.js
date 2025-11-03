function handleOracleError(error, res, defaultMessage = 'Error de base de datos') {
  console.error('[DB] Operation failed:', error);
  const message = error?.message || defaultMessage;
  res.status(500).json({ ok: false, error: message });
}

module.exports = {
  handleOracleError
};
