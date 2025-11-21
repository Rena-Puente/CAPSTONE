import { Injectable } from '@angular/core';

import { AuthTokens } from './auth.service';

export interface SessionData {
  tokens: AuthTokens;
  userId: number | null;
  userType: number | string | null;
  companyId?: number | null;
  isProfileComplete?: boolean | null;
}

const TOKEN_STORAGE_KEY = 'infotex.auth.tokens';
const SESSION_STORAGE_KEY = 'infotex.session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private sessionCache: SessionData | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.sessionCache = this.restoreSession();

    this.initialized = true;
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    await this.setSession({
      tokens,
      userId: null,
      userType: null,
      companyId: null,
      isProfileComplete: null,
    });
  }

  async setSession(session: SessionData): Promise<void> {
    await this.ensureInitialized();
    this.sessionCache = session;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.sessionCache = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  async getAccessToken(): Promise<string | null> {
    await this.ensureInitialized();
    return this.sessionCache?.tokens?.accessToken ?? null;
  }

  async getUserId(): Promise<number | null> {
    await this.ensureInitialized();
    return this.sessionCache?.userId ?? null;
  }

  async getUserType(): Promise<number | string | null> {
    await this.ensureInitialized();
    return this.sessionCache?.userType ?? null;
  }

  async getCompanyId(): Promise<number | null> {
    await this.ensureInitialized();
    return this.sessionCache?.companyId ?? null;
  }

  async getProfileCompletionStatus(): Promise<boolean | null> {
    await this.ensureInitialized();
    return this.sessionCache?.isProfileComplete ?? null;
  }

  async isLoggedIn(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    return Boolean(accessToken);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private restoreSession(): SessionData | null {
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession) as SessionData;
        if (parsed?.tokens?.accessToken && parsed?.tokens?.refreshToken) {
          return parsed;
        }
      } catch (error) {
        console.error('Error parsing stored session', error);
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    const legacyTokens = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (legacyTokens) {
      try {
        const parsedTokens = JSON.parse(legacyTokens) as AuthTokens;
        if (parsedTokens?.accessToken && parsedTokens?.refreshToken) {
          const legacySession: SessionData = {
            tokens: parsedTokens,
            userId: null,
            userType: null,
            companyId: null,
            isProfileComplete: null,
          };
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacySession));
          return legacySession;
        }
      } catch (error) {
        console.error('Error parsing stored tokens', error);
      }

      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    return null;
  }
}