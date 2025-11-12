const { fetch } = require('undici');
const { config } = require('../config');

function ensureEmailServiceConfigured() {
  const emailConfig = config.email || {};

  if (emailConfig.enabled) {
    return;
  }

  const missing = Array.isArray(emailConfig.missingVariables) && emailConfig.missingVariables.length > 0
    ? emailConfig.missingVariables.join(', ')
    : 'las variables de entorno requeridas';

  const error = new Error(`El servicio de envío de correos no está configurado. Faltan ${missing}.`);
  error.code = 'EMAIL_CONFIGURATION_MISSING';
  throw error;
}

function buildVerificationUrl(token) {
  const baseUrl = config.email.verificationBaseUrl;

  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('La URL base de verificación no está configurada.');
  }

  if (baseUrl.includes('{token}')) {
    return baseUrl.replace('{token}', encodeURIComponent(token));
  }

  if (baseUrl.includes('{{token}}')) {
    return baseUrl.replace('{{token}}', encodeURIComponent(token));
  }

  if (baseUrl.includes('%token%')) {
    return baseUrl.replace('%token%', encodeURIComponent(token));
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  } catch (error) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
  }
}

async function sendEmailVerification({ to, token }) {
  if (!to || !token) {
    throw new Error('El correo y el token son obligatorios para enviar la verificación.');
  }

  ensureEmailServiceConfigured();

  const verificationUrl = buildVerificationUrl(token);
  const payload = {
    from: config.email.from,
    to: [to],
    subject: 'Verifica tu correo electrónico',
    html: `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933;">` +
      `<h1 style=\"font-size:20px;\">¡Bienvenido!</h1>` +
      `<p>Para activar tu cuenta, confirma tu correo electrónico haciendo clic en el siguiente botón:</p>` +
      `<p style=\"text-align:center;margin:24px 0;\"><a href=\"${verificationUrl}\" style=\"background-color:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;\">Verificar correo</a></p>` +
      `<p>Si el botón anterior no funciona, copia y pega este enlace en tu navegador:</p>` +
      `<p style=\"word-break:break-all;\"><a href=\"${verificationUrl}\">${verificationUrl}</a></p>` +
      `<p>Si no creaste una cuenta, puedes ignorar este mensaje.</p>` +
      `<p style=\"margin-top:32px;\">Equipo de InfoTex</p>` +
      `</body></html>`,
    text: `Bienvenido a InfoTex. Para activar tu cuenta visita: ${verificationUrl}`
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMessage = `Resend respondió con estado ${response.status}`;

    try {
      const details = await response.text();
      if (details) {
        errorMessage += `: ${details}`;
      }
    } catch (readError) {
      // Ignorado: usamos mensaje genérico si no se puede leer la respuesta
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return { verificationUrl };
}

module.exports = {
  sendEmailVerification,
  buildVerificationUrl
};