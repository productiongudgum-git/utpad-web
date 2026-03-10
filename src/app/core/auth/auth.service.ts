import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, BehaviorSubject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';
import {
  User,
  LoginEmailRequest,
  LoginEmailResponse,
  LoginSuccessResponse,
  LoginRequires2FAResponse,
  TwoFactorVerifyRequest,
  TwoFactorVerifyResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  LogoutRequest,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  GetMeResponse,
  GetPermissionsResponse,
  TwoFactorEnableResponse,
  TwoFactorDisableRequest,
  TwoFactorDisableResponse,
  Permission,
  isLoginRequires2FA,
  isLoginSuccess,
  UserRole,
  PermissionModule,
  PermissionAction,
} from '../../shared/models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly apiUrl = `${environment.apiBaseUrl}/auth`;

  // State
  private _currentUser = signal<User | null>(null);
  private _permissions = signal<Permission[]>([]);
  private _isLoading = signal(false);

  // Refresh token mutex to prevent concurrent refresh calls
  private _isRefreshing = false;
  private _refreshTokenSubject = new BehaviorSubject<string | null>(null);

  // Public readonly signals
  readonly currentUser = this._currentUser.asReadonly();
  readonly permissions = this._permissions.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAuthenticated = this.tokenService.isAuthenticated;

  readonly currentRole = computed(() => this._currentUser()?.role ?? null);
  readonly tenantId = computed(() => this._currentUser()?.tenantId ?? null);
  readonly factoryIds = computed(() => this._currentUser()?.factoryIds ?? []);

  // Inactivity timeout
  private _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly INACTIVITY_TIMEOUT_MS = environment.sessionTimeoutMinutes * 60 * 1000;

  // ── Authentication ───────────────────────────

  loginWithPhone(phone: string, pin: string): Observable<LoginSuccessResponse> {
    this._isLoading.set(true);

    // We send phone and pin to our new endpoints.
    // The previous implementation used email/password DTOs, but we will adjust the payload.
    const request = {
      phone,
      pin,
      deviceInfo: {
        deviceType: 'web',
        userAgent: navigator.userAgent,
      },
    };

    return this.http.post<LoginSuccessResponse>(`${this.apiUrl}/login/phone`, request).pipe(
      tap((response) => {
        this.handleLoginSuccess(response);
        this._isLoading.set(false);
      }),
      catchError((err) => {
        this._isLoading.set(false);
        return throwError(() => err);
      })
    );
  }

  logout(): Observable<void> {
    const accessToken = this.tokenService.getAccessToken();
    const refreshToken = this.tokenService.getRefreshToken();

    // Clear local state immediately
    this.clearSession();

    if (accessToken && refreshToken) {
      const request: LogoutRequest = { accessToken, refreshToken };
      return this.http.post<void>(`${this.apiUrl}/logout`, request).pipe(
        catchError(() => {
          // Even if server logout fails, local state is already cleared
          return throwError(() => new Error('Server logout failed'));
        })
      );
    }

    return new Observable((subscriber) => {
      subscriber.next();
      subscriber.complete();
    });
  }

  // ── Token Refresh ────────────────────────────

  refreshAccessToken(): Observable<RefreshTokenResponse> {
    const refreshToken = this.tokenService.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    const request: RefreshTokenRequest = { refreshToken };
    return this.http.post<RefreshTokenResponse>(`${this.apiUrl}/refresh`, request).pipe(
      tap((response) => {
        this.tokenService.setTokens(response.accessToken, response.refreshToken);
        this.resetInactivityTimer();
      }),
      catchError((err) => {
        this.clearSession();
        this.router.navigate(['/auth/login']);
        return throwError(() => err);
      })
    );
  }

  get isRefreshing(): boolean {
    return this._isRefreshing;
  }

  set isRefreshing(value: boolean) {
    this._isRefreshing = value;
  }

  get refreshTokenSubject(): BehaviorSubject<string | null> {
    return this._refreshTokenSubject;
  }

  // ── Password Reset ───────────────────────────

  requestPasswordReset(email: string): Observable<PasswordResetRequestResponse> {
    const request: PasswordResetRequest = { email };
    return this.http.post<PasswordResetRequestResponse>(
      `${this.apiUrl}/password/reset-request`,
      request
    );
  }

  confirmPasswordReset(token: string, newPassword: string): Observable<PasswordResetConfirmResponse> {
    const request: PasswordResetConfirmRequest = { token, newPassword };
    return this.http.post<PasswordResetConfirmResponse>(
      `${this.apiUrl}/password/reset-confirm`,
      request
    );
  }

  // ── 2FA Management ───────────────────────────

  enable2FA(): Observable<TwoFactorEnableResponse> {
    return this.http.post<TwoFactorEnableResponse>(`${this.apiUrl}/2fa/enable`, {});
  }

  disable2FA(totpCode: string): Observable<TwoFactorDisableResponse> {
    const request: TwoFactorDisableRequest = { totpCode };
    return this.http.post<TwoFactorDisableResponse>(`${this.apiUrl}/2fa/disable`, request);
  }

  // ── User Info ────────────────────────────────

  fetchCurrentUser(): Observable<GetMeResponse> {
    return this.http.get<GetMeResponse>(`${this.apiUrl}/me`).pipe(
      tap((user) => {
        this._currentUser.set(user);
      })
    );
  }

  fetchPermissions(): Observable<GetPermissionsResponse> {
    return this.http.get<GetPermissionsResponse>(`${this.apiUrl}/permissions`).pipe(
      tap((response) => {
        this._permissions.set(response.permissions);
      })
    );
  }

  // ── Permission Checks ────────────────────────

  hasPermission(module: PermissionModule, action: PermissionAction): boolean {
    return this._permissions().some(
      (p) => p.module === module && p.action === action
    );
  }

  hasRole(role: UserRole): boolean {
    return this._currentUser()?.role === role;
  }

  hasAnyRole(...roles: UserRole[]): boolean {
    const currentRole = this._currentUser()?.role;
    return currentRole !== undefined && roles.includes(currentRole);
  }

  // ── Session Management ───────────────────────

  resetInactivityTimer(): void {
    if (this._inactivityTimer) {
      clearTimeout(this._inactivityTimer);
    }
    this._inactivityTimer = setTimeout(() => {
      this.handleSessionTimeout();
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  private handleSessionTimeout(): void {
    this.clearSession();
    this.router.navigate(['/auth/login'], {
      queryParams: { reason: 'session_timeout' },
    });
  }

  // ── Private Helpers ──────────────────────────

  private handleLoginSuccess(response: LoginSuccessResponse): void {
    this.tokenService.setTokens(response.accessToken, response.refreshToken);
    this._currentUser.set(response.user);
    this.resetInactivityTimer();
    this.fetchPermissions().subscribe();
  }

  private clearSession(): void {
    this.tokenService.clearTokens();
    this._currentUser.set(null);
    this._permissions.set([]);
    if (this._inactivityTimer) {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = null;
    }
  }
}
