const GITHUB_STATE_TTL_MS = 10 * 60 * 1000;

const pendingGithubStates = new Map();

function cleanupExpiredGithubStates(now = Date.now()) {
  for (const [state, entry] of pendingGithubStates.entries()) {
    if (!entry || typeof entry.storedAt !== 'number') {
      pendingGithubStates.delete(state);
      continue;
    }

    if (now - entry.storedAt > GITHUB_STATE_TTL_MS) {
      pendingGithubStates.delete(state);
    }
  }
}

function normalizeContext(context) {
  if (!context || typeof context !== 'object') {
    return { purpose: 'login' };
  }

  const purpose = context.purpose === 'link' ? 'link' : 'login';
  const userId = context.userId;
  const parsedUserId = Number.isFinite(userId) ? Number(userId) : Number.parseInt(userId, 10);

  return {
    purpose,
    userId: Number.isFinite(parsedUserId) ? parsedUserId : null
  };
}

function rememberGithubState(state, context = { purpose: 'login' }) {
  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    return;
  }

  cleanupExpiredGithubStates();

  pendingGithubStates.set(state, {
    storedAt: Date.now(),
    context: normalizeContext(context)
  });
}

function consumeGithubState(state) {
  if (!state || typeof state !== 'string') {
    return null;
  }

  cleanupExpiredGithubStates();

  const entry = pendingGithubStates.get(state);

  if (!entry) {
    return null;
  }

  pendingGithubStates.delete(state);

  if (!entry || typeof entry.storedAt !== 'number') {
    return null;
  }

  if (Date.now() - entry.storedAt > GITHUB_STATE_TTL_MS) {
    return null;
  }

  return normalizeContext(entry.context);
}

module.exports = {
  rememberGithubState,
  consumeGithubState
};
