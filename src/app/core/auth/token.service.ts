import { Injectable, signal, computed } from '@angular/core';
import { AccessTokenPayload } from '../../shared/models/auth.models';

/**
 * TokenService — Manages JWT tokens in memory (not localStorage).
 *
 * Security: Tokens are stored in memory + sessionStorage (not localStorage)
 * to reduce XSS exposure. sessionStorage is cleared on tab close.
 *
 * Access tokens are short-lived (15 min) and refresh tokens are longer (7 days for web).
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly SESSION_ACCESS_KEY = 'utpad_at';
  private readonly SESSION_REFRESH_KEY = 'utpad_rt';

  // In-memory primary store
  private _accessToken = signal<string | null>(null);
  private _refreshToken = signal<string | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();

  readonly isAuthenticated = computed(() => {
    const token = this._accessToken();
    if (!token) return false;
    const payload = this.decodeToken(token);
    return payload !== null && payload.exp * 1000 > Date.now();
  });

  readonly decodedToken = computed(() => {
    const token = this._accessToken();
    return token ? this.decodeToken(token) : null;
  });

  constructor() {
    this.restoreFromSession();
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this._accessToken.set(accessToken);
    this._refreshToken.set(refreshToken);
    sessionStorage.setItem(this.SESSION_ACCESS_KEY, accessToken);
    sessionStorage.setItem(this.SESSION_REFRESH_KEY, refreshToken);
  }

  clearTokens(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    sessionStorage.removeItem(this.SESSION_ACCESS_KEY);
    sessionStorage.removeItem(this.SESSION_REFRESH_KEY);
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  getRefreshToken(): string | null {
    return this._refreshToken();
  }

  isAccessTokenExpired(): boolean {
    const token = this._accessToken();
    if (!token) return true;
    const payload = this.decodeToken(token);
    if (!payload) return true;
    // Consider expired 60s before actual expiry (buffer for network latency)
    return payload.exp * 1000 - 60_000 < Date.now();
  }

  decodeToken(token: string): AccessTokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload as AccessTokenPayload;
    } catch {
      return null;
    }
  }

  private restoreFromSession(): void {
    const accessToken = sessionStorage.getItem(this.SESSION_ACCESS_KEY);
    const refreshToken = sessionStorage.getItem(this.SESSION_REFRESH_KEY);
    if (accessToken && refreshToken) {
      this._accessToken.set(accessToken);
      this._refreshToken.set(refreshToken);
    }
  }
}
