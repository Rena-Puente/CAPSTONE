function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || (req.socket ? req.socket.remoteAddress : undefined);
}

function extractBearerToken(req) {
  const authorization = req.headers?.authorization;

  if (!authorization || typeof authorization !== 'string') {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

module.exports = {
  getClientIp,
  extractBearerToken
};
