import { Injectable } from '@angular/core';

import { AuthTokens } from './auth.service';

const TOKEN_STORAGE_KEY = 'infotex.auth.tokens';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private tokensCache: AuthTokens | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      try {
        this.tokensCache = JSON.parse(stored) as AuthTokens;
      } catch (error) {
        console.error('Error parsing stored tokens', error);
        this.tokensCache = null;
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }

    this.initialized = true;
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    await this.ensureInitialized();
    this.tokensCache = tokens;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.tokensCache = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  async getAccessToken(): Promise<string | null> {
    await this.ensureInitialized();
    return this.tokensCache?.accessToken ?? null;
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
}