import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { isLoginRequires2FA } from '../../../shared/models/auth.models';
import { environment } from '../../../../environments/environment';
import { TokenService } from '../../../core/auth/token.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="min-h-screen bg-background-light dark:bg-background-dark flex items-start justify-center pt-16 px-4">
      <div class="w-full max-w-sm">
        <!-- Logo / Header -->
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <span class="material-icons-round text-white text-3xl">precision_manufacturing</span>
          </div>
          <h1 class="text-2xl font-bold text-text-main-light dark:text-text-main-dark tracking-tight">Utpad</h1>
          <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">Manufacturing Operations</p>
        </div>

        <!-- Login Card -->
        <div class="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-6">
          <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark mb-6">Sign in to your account</h2>

          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="space-y-4">
            <!-- Email -->
            <div>
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Email</label>
              <input formControlName="email" type="email" autocomplete="email"
                     class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark placeholder-text-sub-light dark:placeholder-text-sub-dark focus:ring-primary focus:border-primary text-sm py-2.5 px-3"
                     placeholder="you&#64;company.com">
              @if (loginForm.get('email')?.touched && loginForm.get('email')?.hasError('required')) {
                <p class="text-red-500 text-xs mt-1">Email is required</p>
              }
              @if (loginForm.get('email')?.touched && loginForm.get('email')?.hasError('email')) {
                <p class="text-red-500 text-xs mt-1">Enter a valid email</p>
              }
            </div>

            <!-- Password -->
            <div>
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Password</label>
              <div class="relative">
                <input formControlName="password"
                       [type]="showPassword() ? 'text' : 'password'"
                       autocomplete="current-password"
                       class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark placeholder-text-sub-light dark:placeholder-text-sub-dark focus:ring-primary focus:border-primary text-sm py-2.5 px-3 pr-10"
                       placeholder="Enter your password">
                <button type="button" (click)="toggleShowPassword()"
                        class="absolute inset-y-0 right-0 flex items-center pr-3 text-text-sub-light dark:text-text-sub-dark">
                  <span class="material-icons-round text-lg">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
              @if (loginForm.get('password')?.touched && loginForm.get('password')?.hasError('required')) {
                <p class="text-red-500 text-xs mt-1">Password is required</p>
              }
            </div>

            <!-- Error message -->
            @if (errorMessage()) {
              <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start space-x-2">
                <span class="material-icons-round text-red-500 text-lg mt-0.5">error</span>
                <p class="text-sm text-red-700 dark:text-red-300">{{ errorMessage() }}</p>
              </div>
            }

            <!-- Submit -->
            <button type="submit"
                    [disabled]="isLoading() || loginForm.invalid"
                    class="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold shadow-md shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
              @if (isLoading()) {
                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Signing in...</span>
              } @else {
                <span>Continue</span>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  showPassword = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');

  loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    if (this.tokenService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.errorMessage.set('');
    this.isLoading.set(true);
    const { email, password } = this.loginForm.getRawValue();

    if (environment.useMockData) {
      this.handleMockLogin(email, password);
      return;
    }

    this.authService.loginWithEmail(email, password).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        if (isLoginRequires2FA(response)) {
          this.router.navigate(['/auth/2fa'], { state: { tempToken: response.tempToken } });
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 401) {
          this.errorMessage.set('Invalid credentials. Please check your email and password.');
        } else if (err.status === 423) {
          const minutes = err.error?.lockoutMinutesRemaining ?? 15;
          this.errorMessage.set(`Account locked. Try again in ${minutes} minutes.`);
        } else if (err.status === 429) {
          this.errorMessage.set('Too many requests. Please wait and try again.');
        } else {
          this.errorMessage.set('Something went wrong. Please try again.');
        }
      },
    });
  }

  toggleShowPassword(): void {
    this.showPassword.update((currentValue) => !currentValue);
  }

  private handleMockLogin(email: string, password: string): void {
    setTimeout(() => {
      this.isLoading.set(false);
      if (email && password.length >= 4) {
        const mockUser = {
          userId: 'mock-user-1',
          tenantId: 'mock-tenant-1',
          email,
          name: email.split('@')[0],
          role: 'Tenant_Admin' as const,
          factoryIds: ['factory-1'],
          subscriptionTier: 'growth' as const,
        };
        this.tokenService.setTokens(
          'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtb2NrLXVzZXItMSIsInRlbmFudElkIjoibW9jay10ZW5hbnQtMSIsInJvbGUiOiJUZW5hbnRfQWRtaW4iLCJleHAiOjk5OTk5OTk5OTl9.mock',
          'mock-refresh-token'
        );
        this.router.navigate(['/dashboard']);
      } else {
        this.errorMessage.set('Invalid credentials. Please check your email and password.');
      }
    }, 800);
  }
}
