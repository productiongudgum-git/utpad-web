import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="min-height:100vh;background:#f8f9fa;display:flex;align-items:center;justify-content:center;padding:16px;">
      <div style="width:100%;max-width:400px;">

        <!-- Logo -->
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:72px;height:72px;background:#01AC51;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
            <span style="color:#fff;font-family:'Cabin',sans-serif;font-weight:700;font-size:24px;">GG</span>
          </div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Gud Gum</h1>
          <p style="font-size:12px;color:#6B7280;margin:0;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Production Ops Admin</p>
        </div>

        <!-- Card -->
        <div style="background:#fff;border-radius:16px;box-shadow:0 2px 16px rgba(0,0,0,0.08);padding:32px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:18px;font-weight:600;color:#121212;margin:0 0 24px;">Sign in to continue</h2>

          <form [formGroup]="form" (ngSubmit)="submit()">

            <!-- Username -->
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Username</label>
              <input formControlName="username" type="text" autocomplete="username"
                     placeholder="admin"
                     style="width:100%;border:1.5px solid #E5E7EB;border-radius:8px;padding:10px 14px;font-size:14px;font-family:'Figtree',sans-serif;outline:none;transition:border-color 0.15s;"
                     [style.borderColor]="form.get('username')?.touched && form.get('username')?.invalid ? '#FF2828' : '#E5E7EB'">
              @if (form.get('username')?.touched && form.get('username')?.hasError('required')) {
                <p style="font-size:12px;color:#FF2828;margin:4px 0 0;">Username is required</p>
              }
            </div>

            <!-- Password -->
            <div style="margin-bottom:20px;">
              <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Password</label>
              <div style="position:relative;">
                <input formControlName="password"
                       [type]="showPass() ? 'text' : 'password'"
                       autocomplete="current-password"
                       placeholder="••••••••"
                       style="width:100%;border:1.5px solid #E5E7EB;border-radius:8px;padding:10px 44px 10px 14px;font-size:14px;font-family:'Figtree',sans-serif;outline:none;">
                <button type="button" (click)="toggleShowPass()"
                        style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;">
                  <span class="material-icons-round" style="font-size:20px;">{{ showPass() ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
              @if (form.get('password')?.touched && form.get('password')?.hasError('required')) {
                <p style="font-size:12px;color:#FF2828;margin:4px 0 0;">Password is required</p>
              }
            </div>

            <!-- Error -->
            @if (error()) {
              <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                <span class="material-icons-round" style="color:#FF2828;font-size:18px;">error_outline</span>
                <span style="font-size:13px;color:#dc2626;">{{ error() }}</span>
              </div>
            }

            <!-- Submit -->
            <button type="submit"
                    [disabled]="loading() || form.invalid"
                    style="width:100%;padding:12px;background:#01AC51;color:#fff;border:none;border-radius:10px;font-family:'Cabin',sans-serif;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity 0.15s;"
                    [style.opacity]="loading() || form.invalid ? '0.55' : '1'">
              @if (loading()) {
                <span class="spinner"></span>
                <span>Signing in...</span>
              } @else {
                <span>Sign In</span>
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
  private readonly router = inject(Router);

  showPass = signal(false);
  loading = signal(false);
  error = signal('');

  form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  constructor() {
    if (this.authService.isAuthenticated()) {
      void this.router.navigate(['/dashboard']);
    }
  }

  toggleShowPass(): void {
    this.showPass.update(v => !v);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    const { username, password } = this.form.getRawValue();
    try {
      await this.authService.login(username, password);
      await this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
