const cors = require('cors');

const { executeQuery } = require('../db/oracle');
const { requireAccessToken } = require('../middleware/auth');
const { getClientIp, extractBearerToken } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const {
  isAccessTokenValid,
  logAuthEvent,
  summarizeToken,
  findUserByOAuth,
  saveGithubTokens,
  getUserIdFromAccessToken,
  syncGithubProfileMetadata
} = require('../services/auth');
const { getEducationStatus, listEducation } = require('../services/education');
const { getExperienceStatus, listExperience } = require('../services/experience');
const { getSkillStatus, listSkills } = require('../services/skills');
const {
  PROFILE_FIELD_METADATA,
  PROFILE_FIELD_KEYS,
  mapRowToProfile,
  buildProfileEnvelope,
  createEmptyProfileValues,
  createDefaultFieldStatuses,
  validateProfilePayload,
  computeProfileMissingFields,
  isSlugValid
} = require('../services/profile');
const {
  GithubOAuthError,
  GithubApiError,
  buildGithubAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubUserProfile,
  fetchGithubRepositories,
  fetchGithubLanguageSummary
} = require('../services/github');
const { rememberGithubState, consumeGithubState } = require('../services/github-state');
const { toIsoString } = require('../utils/format');

const SLUG_CONFLICT_MESSAGE = 'La URL personalizada ya está en uso. Elige otra distinta.';

function registerProfileRoutes(app) {
  const emptyGithubAccount = Object.freeze({
    linked: false,
    username: null,
    profileUrl: null,
    providerId: null,
    lastSyncedAt: null
  });

  function parseRepositoryLimitParam(rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 6;
    }

    return Math.min(parsed, 50);
  }

  function parseRepositorySortParam(rawSort) {
    const normalized = typeof rawSort === 'string' ? rawSort.trim().toLowerCase() : '';

    return normalized === 'stars' ? 'stars' : 'recent';
  }

  async function fetchGithubAccountStatus(userId) {
    if (!Number.isInteger(userId) || userId <= 0) {
      return { ...emptyGithubAccount };
    }

    try {
      const result = await executeQuery(
        `SELECT
           (SELECT usuario_github FROM perfiles WHERE id_usuario = :userId) AS usuario_github,
           (SELECT id_proveedor_usuario
              FROM (
                SELECT id_proveedor_usuario, id_oauth
                  FROM cuentas_oauth
                 WHERE id_usuario = :userId
                   AND proveedor = 'GITHUB'
                 ORDER BY id_oauth DESC
              )
             WHERE ROWNUM = 1) AS provider_id,
           (SELECT expira_token
              FROM (
                SELECT expira_token, id_oauth
                  FROM cuentas_oauth
                 WHERE id_usuario = :userId
                   AND proveedor = 'GITHUB'
                 ORDER BY id_oauth DESC
              )
             WHERE ROWNUM = 1) AS expira_token
         FROM dual`,
        { userId }
      );

      const row = result.rows?.[0] ?? {};
      const usernameRaw = row.USUARIO_GITHUB ?? row.usuario_github ?? null;
      const providerIdRaw = row.PROVIDER_ID ?? row.provider_id ?? null;
      const expiresRaw = row.EXPIRA_TOKEN ?? row.expira_token ?? null;

      const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
      const providerId = providerIdRaw !== undefined && providerIdRaw !== null
        ? String(providerIdRaw)
        : null;
      const lastSyncedAt = expiresRaw ? toIsoString(expiresRaw) : null;

      return {
        linked: Boolean(providerId),
        username: username || null,
        profileUrl: username ? `https://github.com/${username}` : null,
        providerId,
        lastSyncedAt
      };
    } catch (error) {
      console.error('[Profile] Failed to resolve GitHub account status', {
        userId,
        error: error?.message || error
      });

      return { ...emptyGithubAccount };
    }
  }

  app.options('/profile/status/:userId', cors());
  app.options('/profile/:userId', cors());
  app.options('/profile/:userId/github/authorize', cors());
  app.options('/profile/:userId/github/link', cors());
  app.options('/profile/:userId/github/repositories', cors());

  app.get('/profiles/:slug', async (req, res) => {
    const startedAt = Date.now();
    const rawSlug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';

    console.info('[Profile] Public profile request received', {
      method: req.method,
      path: req.originalUrl,
      slug: req.params.slug,
      ip: getClientIp(req)
    });

    if (!rawSlug || !isSlugValid(rawSlug)) {
      console.warn('[Profile] Public profile request rejected: invalid slug', {
        path: req.originalUrl,
        slug: req.params.slug
      });
      return res
        .status(400)
        .json({ ok: false, error: 'La URL personalizada proporcionada no es válida.' });
    }

    try {
      const result = await executeQuery(
        `SELECT id_usuario,
                nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                telefono,
                url_avatar,
                slug
           FROM perfiles
          WHERE slug = :slug`,
        { slug: rawSlug }
      );

      const rows = Array.isArray(result.rows) ? result.rows : [];

      if (rows.length === 0) {
        console.warn('[Profile] Public profile request not found', {
          path: req.originalUrl,
          slug: rawSlug
        });
        return res
          .status(404)
          .json({ ok: false, error: 'No se encontró ningún perfil público con la URL proporcionada.' });
      }

      if (rows.length > 1) {
        console.error('[Profile] Public profile request failed: duplicate slug', {
          path: req.originalUrl,
          slug: rawSlug,
          matches: rows.length
        });
        return res.status(409).json({
          ok: false,
          error: 'Se encontraron múltiples perfiles con la misma URL personalizada.'
        });
      }

      const row = rows[0];
      const profileValues = mapRowToProfile(row);
      const userIdValue = Number.parseInt(row.ID_USUARIO ?? row.id_usuario ?? null, 10);
      const userId = Number.isInteger(userIdValue) && userIdValue > 0 ? userIdValue : null;

      let educationEntries = [];
      let experienceEntries = [];
      let skillEntries = [];
      let educationSummary = null;
      let experienceSummary = null;
      let skillsSummary = null;

      if (userId) {
        [
          educationEntries,
          experienceEntries,
          skillEntries,
          educationSummary,
          experienceSummary,
          skillsSummary
        ] = await Promise.all([
          listEducation(userId).catch((error) => {
            console.error('[Profile] Failed to list education for public profile', {
              userId,
              error: error?.message || error
            });
            return [];
          }),
          listExperience(userId).catch((error) => {
            console.error('[Profile] Failed to list experience for public profile', {
              userId,
              error: error?.message || error
            });
            return [];
          }),
          listSkills(userId).catch((error) => {
            console.error('[Profile] Failed to list skills for public profile', {
              userId,
              error: error?.message || error
            });
            return [];
          }),
          getEducationStatus(userId).catch((error) => {
            console.error('[Profile] Failed to compute education summary for public profile', {
              userId,
              error: error?.message || error
            });
            return null;
          }),
          getExperienceStatus(userId).catch((error) => {
            console.error('[Profile] Failed to compute experience summary for public profile', {
              userId,
              error: error?.message || error
            });
            return null;
          }),
          getSkillStatus(userId).catch((error) => {
            console.error('[Profile] Failed to compute skill summary for public profile', {
              userId,
              error: error?.message || error
            });
            return null;
          })
        ]);
      }

      const response = {
        ok: true,
        profile: profileValues,
        education: {
          entries: educationEntries,
          summary: educationSummary
            ? {
                totalRecords: Number(educationSummary.totalRecords ?? educationEntries.length ?? 0),
                hasEducation: Boolean(educationSummary.hasEducation),
                invalidDateCount: Number(educationSummary.invalidDateCount ?? 0)
              }
            : null
        },
        experience: {
          entries: experienceEntries,
          summary: experienceSummary
            ? {
                totalRecords: Number(experienceSummary.totalRecords ?? experienceEntries.length ?? 0),
                currentCount: Number(experienceSummary.currentCount ?? 0)
              }
            : null
        },
        skills: {
          entries: skillEntries,
          summary: skillsSummary
            ? {
                totalSkills: Number(skillsSummary.totalSkills ?? skillEntries.length ?? 0),
                averageLevel: Number.isFinite(skillsSummary.averageLevel)
                  ? skillsSummary.averageLevel
                  : null,
                maxLevel: Number.isFinite(skillsSummary.maxLevel) ? skillsSummary.maxLevel : null,
                minLevel: Number.isFinite(skillsSummary.minLevel) ? skillsSummary.minLevel : null
              }
            : null
        }
      };

      console.info('[Profile] Public profile response sent', {
        slug: rawSlug,
        userId,
        educationCount: educationEntries.length,
        experienceCount: experienceEntries.length,
        skillsCount: skillEntries.length,
        elapsedMs: Date.now() - startedAt
      });

      return res.json(response);
    } catch (error) {
      console.error('[Profile] Public profile request failed', {
        slug: rawSlug,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      return handleOracleError(error, res, 'No se pudo obtener el perfil público.');
    }
  });

  app.get('/profile/:userId/github/repositories', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const userId = Number.parseInt(req.params.userId, 10);
    const accessToken = req.auth?.accessToken ?? extractBearerToken(req);
    const limit = parseRepositoryLimitParam(req.query?.limit);
    const sort = parseRepositorySortParam(req.query?.sort);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    try {
      const sessionUserId = await getUserIdFromAccessToken(accessToken);

      if (!sessionUserId || sessionUserId !== userId) {
        return res.status(403).json({ ok: false, error: 'No estás autorizado para consultar los repositorios de GitHub de este usuario.' });
      }

      const githubAccount = await fetchGithubAccountStatus(userId);

      if (!githubAccount.linked || !githubAccount.username) {
        return res.status(404).json({ ok: false, error: 'El usuario no tiene una cuenta de GitHub vinculada.' });
      }

      const repositories = await fetchGithubRepositories(githubAccount.username, { limit, sort });
      const languages = await fetchGithubLanguageSummary(githubAccount.username, repositories, { limit });

      console.info('[Profile] GitHub repositories fetched (private)', {
        userId,
        githubUsername: githubAccount.username,
        repositoryCount: repositories.length,
        totalLanguageBytes: languages.totalBytes ?? 0,
        elapsedMs: Date.now() - startedAt
      });

      return res.json({ ok: true, repositories, languages });
    } catch (error) {
      console.error('[Profile] Failed to fetch GitHub repositories (private)', {
        userId,
        error: error?.message || error,
        elapsedMs: Date.now() - startedAt
      });

      if (error instanceof GithubApiError) {
        const status = error.status >= 400 && error.status < 600 ? error.status : 502;
        return res.status(status).json({ ok: false, error: 'No se pudo obtener los repositorios de GitHub.' });
      }

      return res.status(500).json({ ok: false, error: 'No se pudo obtener los repositorios de GitHub.' });
    }
  });

  app.get('/profiles/:slug/github/repositories', async (req, res) => {
    const startedAt = Date.now();
    const rawSlug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
    const limit = parseRepositoryLimitParam(req.query?.limit);
    const sort = parseRepositorySortParam(req.query?.sort);

    if (!rawSlug || !isSlugValid(rawSlug)) {
      return res.status(400).json({ ok: false, error: 'La URL personalizada proporcionada no es válida.' });
    }

    try {
      const result = await executeQuery(
        `SELECT id_usuario
           FROM perfiles
          WHERE slug = :slug`,
        { slug: rawSlug }
      );

      const row = Array.isArray(result.rows) ? result.rows[0] : null;

      if (!row) {
        return res.status(404).json({ ok: false, error: 'No se encontró ningún perfil público con la URL proporcionada.' });
      }

      const rawUserId = row.ID_USUARIO ?? row.id_usuario ?? null;
      const userId = Number.parseInt(String(rawUserId ?? ''), 10);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(204).end();
      }

      const githubAccount = await fetchGithubAccountStatus(userId);
      const githubUsername = typeof githubAccount.username === 'string'
        ? githubAccount.username.trim()
        : '';

      if (!githubUsername) {
        return res.status(204).end();
      }

      const repositories = await fetchGithubRepositories(githubUsername, { limit, sort });
      const languages = await fetchGithubLanguageSummary(githubUsername, repositories, { limit });

      console.info('[Profile] GitHub repositories fetched (public)', {
        slug: rawSlug,
        githubUsername,
        repositoryCount: repositories.length,
        totalLanguageBytes: languages.totalBytes ?? 0,
        elapsedMs: Date.now() - startedAt
      });

      return res.json({ ok: true, repositories, languages });
    } catch (error) {
      console.error('[Profile] Failed to fetch GitHub repositories (public)', {
        slug: rawSlug,
        error: error?.message || error,
        elapsedMs: Date.now() - startedAt
      });

      if (error instanceof GithubApiError) {
        const status = error.status >= 400 && error.status < 600 ? error.status : 502;
        return res.status(status).json({ ok: false, error: 'No se pudo obtener los repositorios públicos de GitHub.' });
      }

      return res.status(500).json({ ok: false, error: 'No se pudo obtener los repositorios públicos de GitHub.' });
    }
  });

  app.get('/profile/status/:userId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Profile] Status request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Profile] Status request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Profile] Status request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Profile] Status request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      console.info('[Profile] Status request authorized', {
        userId,
        elapsedMs: Date.now() - startedAt
      });

      await executeQuery(
        'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
        { userId },
        { autoCommit: true }
      );

      const result = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                telefono,
                url_avatar,
                slug,
                perfil_completo
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const row = result.rows?.[0] ?? null;
      const [educationSummary, experienceSummary, skillsSummary] = await Promise.all([
        getEducationStatus(userId),
        getExperienceStatus(userId),
        getSkillStatus(userId)
      ]);
      const missingFields = computeProfileMissingFields(
        row,
        educationSummary,
        experienceSummary,
        skillsSummary
      );
      const profileValues = row ? mapRowToProfile(row) : null;
      const githubAccount = await fetchGithubAccountStatus(userId);

      if (!row) {
        return res.json({
          ok: true,
          profile: null,
          isComplete: false,
          missingFields,
          educationSummary,
          experienceSummary,
          skillsSummary,
          githubAccount
        });
      }

      const isComplete = String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S';

      res.json({
        ok: true,
        profile: profileValues,
        isComplete,
        missingFields,
        educationSummary,
        experienceSummary,
        skillsSummary,
        githubAccount
      });
    } catch (error) {
      console.error('[Profile] Status request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener el estado del perfil.');
    }
  });

  app.get('/profile/:userId', async (req, res) => {
    const startedAt = Date.now();
    const accessToken = extractBearerToken(req);
    const userId = Number.parseInt(req.params.userId, 10);

    console.info('[Profile] Detail request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Profile] Detail request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!accessToken) {
      console.warn('[Profile] Detail request rejected: missing access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      const isValid = await isAccessTokenValid(accessToken);

      if (!isValid) {
        console.warn('[Profile] Detail request rejected: invalid access token', {
          path: req.originalUrl,
          userId
        });
        return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
      }

      const result = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                telefono,
                url_avatar,
                slug,
                perfil_completo
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const row = result.rows?.[0] ?? null;
      const profileValues = mapRowToProfile(row);
      const [educationSummary, experienceSummary, skillsSummary] = await Promise.all([
        getEducationStatus(userId),
        getExperienceStatus(userId),
        getSkillStatus(userId)
      ]);
      const missingFields = computeProfileMissingFields(
        row,
        educationSummary,
        experienceSummary,
        skillsSummary
      );
      const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
      const isComplete = isCompleteFlag && missingFields.length === 0;
      const message = row ? null : 'Aún no has configurado tu perfil.';
      const githubAccount = await fetchGithubAccountStatus(userId);
      const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
        isComplete,
        missingFields,
        message,
        educationSummary,
        experienceSummary,
        skillsSummary,
        githubAccount
      });

      console.info('[Profile] Detail response sent', {
        userId,
        hasProfile: Boolean(row),
        isComplete,
        missingFieldsCount: missingFields.length,
        educationRecords: educationSummary?.totalRecords ?? 0,
        experienceRecords: experienceSummary?.totalRecords ?? 0,
        skillsRecords: skillsSummary?.totalSkills ?? 0,
        elapsedMs: Date.now() - startedAt
      });

      res.json(response);
    } catch (error) {
      console.error('[Profile] Detail request failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo obtener el perfil.');
    }
  });

  app.post('/profile/:userId/github/authorize', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const userId = Number.parseInt(req.params.userId, 10);
    const rawState = typeof req.body?.state === 'string' ? req.body.state.trim() : '';

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!rawState) {
      return res.status(400).json({ ok: false, error: 'El parámetro state es obligatorio.' });
    }

    if (rawState.length > 512) {
      return res.status(400).json({ ok: false, error: 'El parámetro state es demasiado largo.' });
    }

    const accessToken = req.auth?.accessToken ?? null;

    try {
      const sessionUserId = await getUserIdFromAccessToken(accessToken);

      if (!sessionUserId || sessionUserId !== userId) {
        return res.status(403).json({ ok: false, error: 'No estás autorizado para vincular GitHub para este usuario.' });
      }

      const authorizeUrl = buildGithubAuthorizeUrl(rawState);

      rememberGithubState(rawState, { purpose: 'link', userId });

      logAuthEvent('GitHub link authorization URL generated', {
        userId,
        stateLength: rawState.length,
        authorizeUrl
      });

      res.json({ ok: true, url: authorizeUrl });
    } catch (error) {
      console.error('[Profile] GitHub link authorize failed', {
        userId,
        stateLength: rawState.length,
        error: error?.message || error,
        elapsedMs: Date.now() - startedAt
      });

      if (error instanceof GithubOAuthError && error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }

      return res.status(500).json({ ok: false, error: 'No se pudo generar la URL de autorización de GitHub.' });
    }
  });

  app.post('/profile/:userId/github/link', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const userId = Number.parseInt(req.params.userId, 10);
    const { code, state } = req.body ?? {};

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      return res.status(400).json({ ok: false, error: 'El código de autorización y el estado son obligatorios.' });
    }

    const normalizedState = state.trim();
    const accessToken = req.auth?.accessToken ?? null;

    try {
      const sessionUserId = await getUserIdFromAccessToken(accessToken);

      if (!sessionUserId || sessionUserId !== userId) {
        return res.status(403).json({ ok: false, error: 'No estás autorizado para vincular GitHub para este usuario.' });
      }

      const stateContext = consumeGithubState(normalizedState);

      if (!stateContext || stateContext.purpose !== 'link' || stateContext.userId !== userId) {
        logAuthEvent('GitHub link rejected (invalid state)', {
          userId,
          normalizedState,
          context: stateContext ?? null
        });

        return res.status(400).json({ ok: false, error: 'La validación de seguridad para vincular GitHub falló. Intenta nuevamente.' });
      }

      const tokenResponse = await exchangeCodeForToken({ code, state: normalizedState });

      logAuthEvent('GitHub link token exchange successful', {
        userId,
        scope: tokenResponse.scope,
        expiresIn: tokenResponse.expiresIn ?? null
      });

      const { profile, primaryEmail } = await fetchGithubUserProfile(tokenResponse.accessToken);
      const providerId = profile?.id ?? profile?.node_id ?? null;

      if (!providerId) {
        throw new GithubOAuthError('GitHub no devolvió un identificador de usuario.', 500, profile);
      }

      const providerIdString = String(providerId);
      const existingLinkedUserId = await findUserByOAuth('GITHUB', providerIdString);

      if (existingLinkedUserId && existingLinkedUserId !== userId) {
        return res.status(409).json({
          ok: false,
          error: 'Esta cuenta de GitHub ya está vinculada a otro usuario de InfoTex.'
        });
      }

      const displayName = profile?.name || profile?.login || primaryEmail?.email || null;
      const avatarUrl = profile?.avatar_url || null;
      const githubUsername = typeof profile?.login === 'string' ? profile.login : null;
      const expiresAt = tokenResponse.expiresIn
        ? new Date(Date.now() + Number(tokenResponse.expiresIn) * 1000)
        : null;

      await saveGithubTokens({
        userId,
        providerId: providerIdString,
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken,
        scope: tokenResponse.scope,
        expiresAt
      });

      await syncGithubProfileMetadata({
        userId,
        displayName,
        avatarUrl,
        githubUsername
      });

      const githubAccount = await fetchGithubAccountStatus(userId);

      logAuthEvent('GitHub account linked', {
        userId,
        providerId: providerIdString,
        scope: tokenResponse.scope,
        accessToken: summarizeToken(tokenResponse.accessToken),
        refreshToken: summarizeToken(tokenResponse.refreshToken)
      });

      res.json({
        ok: true,
        githubAccount,
        message: 'Tu cuenta de GitHub se vinculó correctamente.'
      });
    } catch (error) {
      console.error('[Profile] GitHub link failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      if (error instanceof GithubOAuthError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 500;

        return res.status(status).json({ ok: false, error: error.message });
      }

      return res.status(500).json({ ok: false, error: 'No se pudo vincular tu cuenta de GitHub.' });
    }
  });

  app.delete('/profile/:userId/github/link', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const userId = Number.parseInt(req.params.userId, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    const accessToken = req.auth?.accessToken ?? null;

    try {
      const sessionUserId = await getUserIdFromAccessToken(accessToken);

      if (!sessionUserId || sessionUserId !== userId) {
        return res.status(403).json({ ok: false, error: 'No estás autorizado para desvincular GitHub para este usuario.' });
      }

      await executeQuery(
        `DELETE FROM cuentas_oauth
          WHERE id_usuario = :userId
            AND proveedor = 'GITHUB'`,
        { userId },
        { autoCommit: true }
      );

      await executeQuery(
        `UPDATE perfiles
            SET usuario_github = NULL
          WHERE id_usuario = :userId`,
        { userId },
        { autoCommit: true }
      );

      const githubAccount = await fetchGithubAccountStatus(userId);

      logAuthEvent('GitHub account unlinked', { userId });

      res.json({
        ok: true,
        githubAccount,
        message: 'Tu cuenta de GitHub se desvinculó correctamente.'
      });
    } catch (error) {
      console.error('[Profile] GitHub unlink failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });

      return handleOracleError(error, res, 'No se pudo desvincular tu cuenta de GitHub.');
    }
  });

  app.put('/profile/:userId', requireAccessToken, async (req, res) => {
    const startedAt = Date.now();
    const userId = Number.parseInt(req.params.userId, 10);
    let validation = null;

    console.info('[Profile] Update request received', {
      method: req.method,
      path: req.originalUrl,
      userId: Number.isNaN(userId) ? req.params.userId : userId,
      hasAuthorization: Boolean(req.auth?.accessToken),
      ip: getClientIp(req)
    });

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn('[Profile] Update request rejected: invalid user id', {
        path: req.originalUrl,
        userId: req.params.userId
      });
      return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
    }

    try {
      const existingProfileResult = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                telefono,
                url_avatar,
                slug
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const existingRow = existingProfileResult.rows?.[0] ?? null;
      const existingProfileValues = existingRow ? mapRowToProfile(existingRow) : null;
      const githubAccount = await fetchGithubAccountStatus(userId);

      validation = validateProfilePayload(req.body || {}, existingProfileValues);

      if (!validation.isValid) {
        console.warn('[Profile] Update request validation failed', {
          userId,
          missingFields: validation.missingFields,
          elapsedMs: Date.now() - startedAt
        });

        const response = buildProfileEnvelope(validation.values, validation.statuses, {
          isComplete: false,
          missingFields: validation.missingFields,
          message: 'Corrige la información resaltada e inténtalo nuevamente.',
          githubAccount
        });

        return res.json(response);
      }

      const dbPayload = {
        displayName: validation.values.displayName || null,
        career: validation.values.career || null,
        biography: validation.values.biography || null,
        country: validation.values.country || null,
        city: validation.values.city || null,
        phoneNumber: validation.values.phoneNumber || null,
        avatarUrl: validation.values.avatarUrl || null,
        slug: validation.values.slug || null
      };

      if (dbPayload.slug) {
        const slugConflict = await executeQuery(
          `SELECT id_usuario
             FROM perfiles
            WHERE slug = :slug
              AND id_usuario <> :userId`,
          { slug: dbPayload.slug, userId }
        );

        if (Array.isArray(slugConflict.rows) && slugConflict.rows.length > 0) {
          const statuses = {
            ...validation.statuses,
            slug: {
              ok: false,
              error: SLUG_CONFLICT_MESSAGE
            }
          };

          const missingFields = PROFILE_FIELD_KEYS.filter((field) => !statuses[field].ok).map((field) => {
            const metadata = PROFILE_FIELD_METADATA[field];
            return metadata ? metadata.label : field;
          });

          const response = buildProfileEnvelope(validation.values, statuses, {
            isComplete: false,
            missingFields,
            message: 'Corrige la información resaltada e inténtalo nuevamente.',
            githubAccount
          });

          return res.json(response);
        }
      }

      await executeQuery(
        `MERGE INTO perfiles dest
         USING (SELECT :userId AS id_usuario,
                       :displayName AS nombre_mostrar,
                       :career AS titular,
                       :biography AS biografia,
                       :country AS pais,
                       :city AS ciudad,
                       :phoneNumber AS telefono,
                       :avatarUrl AS url_avatar,
                       :slug AS slug
                  FROM dual) src
            ON (dest.id_usuario = src.id_usuario)
        WHEN MATCHED THEN
          UPDATE
             SET dest.nombre_mostrar = src.nombre_mostrar,
                 dest.titular = src.titular,
                 dest.biografia = src.biografia,
                 dest.pais = src.pais,
                 dest.ciudad = src.ciudad,
                 dest.telefono = src.telefono,
                 dest.url_avatar = src.url_avatar,
                 dest.slug = src.slug
        WHEN NOT MATCHED THEN
          INSERT (
            id_usuario,
            nombre_mostrar,
            titular,
            biografia,
            pais,
            ciudad,
            telefono,
            url_avatar,
            slug
          ) VALUES (
            src.id_usuario,
            src.nombre_mostrar,
            src.titular,
            src.biografia,
            src.pais,
            src.ciudad,
            src.telefono,
            src.url_avatar,
            src.slug
          )`,
        {
          userId,
          ...dbPayload
        },
        { autoCommit: true }
      );

      await executeQuery(
        'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
        { userId },
        { autoCommit: true }
      );

      const result = await executeQuery(
        `SELECT nombre_mostrar,
                titular,
                biografia,
                pais,
                ciudad,
                telefono,
                url_avatar,
                slug,
                perfil_completo
           FROM perfiles
          WHERE id_usuario = :userId`,
        { userId }
      );

      const row = result.rows?.[0] ?? null;
      const profileValues = mapRowToProfile(row);
      const [educationSummary, experienceSummary, skillsSummary] = await Promise.all([
        getEducationStatus(userId),
        getExperienceStatus(userId),
        getSkillStatus(userId)
      ]);
      const missingFields = computeProfileMissingFields(
        row,
        educationSummary,
        experienceSummary,
        skillsSummary
      );
      const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
      const isComplete = isCompleteFlag && missingFields.length === 0;

      const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
        isComplete,
        missingFields,
        message: 'Perfil actualizado correctamente.',
        educationSummary,
        experienceSummary,
        skillsSummary,
        githubAccount
      });

      console.info('[Profile] Update successful', {
        userId,
        isComplete,
        missingFieldsCount: missingFields.length,
        educationRecords: educationSummary?.totalRecords ?? 0,
        experienceRecords: experienceSummary?.totalRecords ?? 0,
        skillsRecords: skillsSummary?.totalSkills ?? 0,
        elapsedMs: Date.now() - startedAt
      });

      res.json(response);
    } catch (error) {
      if (
        error &&
        (error.errorNum === 1 ||
          (typeof error.message === 'string' && error.message.includes('ORA-00001')))
      ) {
        const baseStatuses = validation?.statuses
          ? { ...createDefaultFieldStatuses(true), ...validation.statuses }
          : createDefaultFieldStatuses(true);
        const statuses = {
          ...baseStatuses,
          slug: { ok: false, error: SLUG_CONFLICT_MESSAGE }
        };
        const values = validation?.values ?? createEmptyProfileValues();
        const missingFields = PROFILE_FIELD_KEYS.filter((field) => !statuses[field].ok).map((field) => {
          const metadata = PROFILE_FIELD_METADATA[field];
          return metadata ? metadata.label : field;
        });

        const response = buildProfileEnvelope(values, statuses, {
          isComplete: false,
          missingFields,
          message: 'Corrige la información resaltada e inténtalo nuevamente.',
          githubAccount
        });

        return res.json(response);
      }

      console.error('[Profile] Update failed', {
        userId,
        path: req.originalUrl,
        elapsedMs: Date.now() - startedAt,
        error: error?.message || error
      });
      handleOracleError(error, res, 'No se pudo actualizar el perfil.');
    }
  });
}

module.exports = {
  registerProfileRoutes
};
