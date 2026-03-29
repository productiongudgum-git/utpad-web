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
    <div style="min-height:100vh;width:100%;display:flex;overflow:hidden;background:#fff;">

      <!-- Left Panel (hidden on mobile) -->
      <div class="login-left-panel">
        <div style="position:absolute;inset:0;overflow:hidden;">
          <div style="position:absolute;top:-80px;left:-80px;width:384px;height:384px;background:rgba(1,172,81,0.1);border-radius:50%;filter:blur(48px);"></div>
          <div style="position:absolute;top:50%;right:-80px;width:320px;height:320px;background:rgba(1,172,81,0.08);border-radius:50%;filter:blur(48px);"></div>
          <div style="position:absolute;bottom:0;left:25%;width:288px;height:288px;background:rgba(1,172,81,0.12);border-radius:50%;filter:blur(32px);"></div>
        </div>
        <div style="position:relative;z-index:10;padding:64px;padding-bottom:80px;">
          <div style="margin-bottom:48px;">
            <div style="width:64px;height:64px;border-radius:16px;background:var(--primary);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(1,172,81,0.3);margin-bottom:24px;">
              <span style="color:#fff;font-family:var(--font-display);font-weight:700;font-size:24px;">GG</span>
            </div>
            <h1 style="font-size:48px;font-weight:700;color:var(--foreground);line-height:1.1;">
              Chew<br>Good.
            </h1>
          </div>
          <p style="font-size:18px;color:var(--muted-fg);line-height:1.6;max-width:380px;">
            Monitor inventory, track production batches, and manage the entire supply chain — from a single screen.
          </p>
          <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="padding:16px;border-radius:16px;background:rgba(255,255,255,0.6);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.05);">
              <p style="font-size:24px;font-weight:700;color:var(--primary);">4</p>
              <p style="font-size:12px;color:var(--muted-fg);font-weight:500;margin-top:2px;">Modules</p>
            </div>
            <div style="padding:16px;border-radius:16px;background:rgba(255,255,255,0.6);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.05);">
              <p style="font-size:24px;font-weight:700;color:var(--primary);">9+</p>
              <p style="font-size:12px;color:var(--muted-fg);font-weight:500;margin-top:2px;">Flavors</p>
            </div>
            <div style="padding:16px;border-radius:16px;background:rgba(255,255,255,0.6);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.05);">
              <p style="font-size:24px;font-weight:700;color:var(--primary);">&#10003;</p>
              <p style="font-size:12px;color:var(--muted-fg);font-weight:500;margin-top:2px;">Real-time</p>
            </div>
            <div style="padding:16px;border-radius:16px;background:rgba(255,255,255,0.6);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.05);">
              <p style="font-size:24px;font-weight:700;color:var(--primary);">&#10003;</p>
              <p style="font-size:12px;color:var(--muted-fg);font-weight:500;margin-top:2px;">Barcode</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel (full width on mobile) -->
      <div style="width:100%;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px 40px;background:#fff;" class="login-right-panel">
        <div style="width:100%;max-width:420px;">

          <!-- Mobile logo -->
          <div class="mobile-logo" style="display:none;align-items:center;gap:12px;margin-bottom:40px;">
            <div style="width:40px;height:40px;border-radius:12px;background:var(--primary);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(1,172,81,0.3);">
              <span style="color:#fff;font-family:var(--font-display);font-weight:700;font-size:14px;">GG</span>
            </div>
            <h1 style="font-size:20px;font-weight:700;">Gud Gum Ops</h1>
          </div>

          <div style="margin-bottom:32px;">
            <h2 style="font-size:30px;font-weight:700;">Welcome back</h2>
            <p style="color:var(--muted-fg);font-size:16px;margin-top:8px;">Enter your credentials to access the system.</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="submit()" style="display:flex;flex-direction:column;gap:20px;">
            <div>
              <label style="display:block;font-size:14px;font-weight:600;color:var(--foreground);margin-bottom:6px;">Username</label>
              <input formControlName="username" type="text" autocomplete="username"
                     class="beautiful-input" placeholder="e.g. admin or worker1">
            </div>

            <div>
              <label style="display:block;font-size:14px;font-weight:600;color:var(--foreground);margin-bottom:6px;">Password</label>
              <input formControlName="password"
                     [type]="showPass() ? 'text' : 'password'"
                     autocomplete="current-password"
                     class="beautiful-input" placeholder="••••••••">
            </div>

            @if (error()) {
              <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:8px;">
                <span class="material-icons-round" style="color:var(--destructive);font-size:18px;">error_outline</span>
                <span style="font-size:13px;color:#dc2626;">{{ error() }}</span>
              </div>
            }

            <button type="submit" [disabled]="loading() || form.invalid" class="beautiful-button"
                    style="width:100%;padding:14px;font-size:15px;margin-top:4px;">
              @if (loading()) {
                <span class="spinner"></span>
                <span>Signing in...</span>
              } @else {
                <span>Sign in securely</span>
              }
            </button>
          </form>

          <div style="margin-top:32px;padding:20px;border-radius:16px;background:var(--secondary);border:1px solid rgba(0,0,0,0.04);">
            <p style="font-size:11px;font-weight:700;color:var(--foreground);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;">Demo Credentials</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:14px;color:var(--muted-fg);">Admin</span>
                <span style="display:flex;gap:8px;">
                  <code style="font-family:monospace;font-size:12px;background:#fff;padding:4px 8px;border-radius:4px;border:1px solid var(--border);">admin</code>
                  <code style="font-family:monospace;font-size:12px;background:#fff;padding:4px 8px;border-radius:4px;border:1px solid var(--border);">admin123</code>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-left-panel {
      display: none;
      width: 50%;
      position: relative;
      flex-direction: column;
      justify-content: flex-end;
      background: rgba(1,172,81,0.03);
    }
    @media (min-width: 1024px) {
      .login-left-panel { display: flex; }
      .login-right-panel { width: 50% !important; }
    }
    @media (max-width: 1023px) {
      .mobile-logo { display: flex !important; }
    }
  `],
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
