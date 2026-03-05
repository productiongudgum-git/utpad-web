import { Component, inject, signal, OnInit, OnDestroy, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-two-factor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="min-h-screen bg-background-light dark:bg-background-dark flex items-start justify-center pt-16 px-4">
      <div class="w-full max-w-sm">
        <!-- Back link -->
        <a (click)="goBack()" class="inline-flex items-center text-sm text-text-sub-light dark:text-text-sub-dark hover:text-primary cursor-pointer mb-6 transition-colors">
          <span class="material-icons-round text-lg mr-1">arrow_back</span>
          Back to login
        </a>

        <!-- Card -->
        <div class="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-6">
          <div class="text-center mb-6">
            <!-- Timer ring -->
            <div class="relative w-20 h-20 mx-auto mb-4">
              <svg class="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke-width="4"
                        class="stroke-gray-200 dark:stroke-gray-700" />
                <circle cx="40" cy="40" r="36" fill="none" stroke-width="4"
                        class="stroke-primary transition-all duration-1000"
                        [attr.stroke-dasharray]="226.2"
                        [attr.stroke-dashoffset]="226.2 - (226.2 * countdown() / 30)"
                        stroke-linecap="round" />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-lg font-bold text-text-main-light dark:text-text-main-dark">{{ countdown() }}s</span>
              </div>
            </div>
            <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Two-Factor Authentication</h2>
            <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">Enter the 6-digit code from your authenticator app</p>
          </div>

          @if (!useBackupCode()) {
            <!-- 6-digit OTP input -->
            <div class="flex justify-center space-x-2 mb-6" [class.animate-shake]="shakeError()">
              @for (i of digitIndexes; track i) {
                <input #digitInput
                       type="text" inputmode="numeric" maxlength="1"
                       class="w-11 h-14 text-center text-xl font-bold rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                       [class.border-red-500]="shakeError()"
                       [value]="digits()[i]"
                       (input)="onDigitInput($event, i)"
                       (keydown)="onKeyDown($event, i)"
                       (paste)="onPaste($event)">
              }
            </div>
          } @else {
            <!-- Backup code input -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Backup Code</label>
              <input type="text"
                     class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark focus:ring-primary focus:border-primary text-sm py-2.5 px-3 font-mono tracking-widest"
                     placeholder="XXXX-XXXX-XXXX"
                     [(value)]="backupCode"
                     (input)="onBackupInput($event)">
            </div>
          }

          <!-- Error -->
          @if (errorMessage()) {
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 flex items-start space-x-2">
              <span class="material-icons-round text-red-500 text-lg">error</span>
              <p class="text-sm text-red-700 dark:text-red-300">{{ errorMessage() }}</p>
            </div>
          }

          <!-- Verify button -->
          <button (click)="onVerify()"
                  [disabled]="isLoading() || (!isCodeComplete() && !useBackupCode())"
                  class="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
            @if (isLoading()) {
              <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Verifying...</span>
            } @else {
              <span>Verify</span>
            }
          </button>

          <!-- Toggle backup code -->
          <div class="text-center mt-4">
            <button (click)="toggleBackupCode()" class="text-sm text-primary hover:underline">
              {{ useBackupCode() ? 'Use authenticator code instead' : 'Use a backup code' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
      20%, 40%, 60%, 80% { transform: translateX(4px); }
    }
    .animate-shake { animation: shake 0.5s ease-in-out; }
  `],
})
export class TwoFactorComponent implements OnInit, OnDestroy {
  @ViewChildren('digitInput') digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  digits = signal<string[]>(['', '', '', '', '', '']);
  digitIndexes = [0, 1, 2, 3, 4, 5];
  countdown = signal(30);
  isLoading = signal(false);
  errorMessage = signal('');
  shakeError = signal(false);
  useBackupCode = signal(false);
  backupCode = '';

  private tempToken = '';
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation();
    this.tempToken = nav?.extras?.state?.['tempToken'] ?? history.state?.tempToken ?? '';

    if (!this.tempToken) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.startCountdown();
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  isCodeComplete(): boolean {
    return this.digits().every(d => d !== '');
  }

  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    const newDigits = [...this.digits()];
    newDigits[index] = value.charAt(0) || '';
    this.digits.set(newDigits);

    if (value && index < 5) {
      const inputs = this.digitInputs.toArray();
      inputs[index + 1]?.nativeElement.focus();
    }
  }

  onKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      const inputs = this.digitInputs.toArray();
      const newDigits = [...this.digits()];
      newDigits[index - 1] = '';
      this.digits.set(newDigits);
      inputs[index - 1]?.nativeElement.focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) ?? '';
    if (pasted.length === 6) {
      this.digits.set(pasted.split(''));
      const inputs = this.digitInputs.toArray();
      inputs[5]?.nativeElement.focus();
    }
  }

  onBackupInput(event: Event): void {
    this.backupCode = (event.target as HTMLInputElement).value;
  }

  onVerify(): void {
    const code = this.useBackupCode() ? this.backupCode : this.digits().join('');
    if (!code || (!this.useBackupCode() && code.length !== 6)) return;

    this.errorMessage.set('');
    this.isLoading.set(true);

    this.authService.verify2FA(this.tempToken, code).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Invalid code. Try again.');
        this.shakeError.set(true);
        setTimeout(() => this.shakeError.set(false), 600);
        this.digits.set(['', '', '', '', '', '']);
        const inputs = this.digitInputs?.toArray();
        inputs?.[0]?.nativeElement.focus();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/auth/login']);
  }

  toggleBackupCode(): void {
    this.useBackupCode.update((currentValue) => !currentValue);
    this.errorMessage.set('');
  }

  private startCountdown(): void {
    this.countdown.set(30);
    this.timerInterval = setInterval(() => {
      this.countdown.update(v => {
        if (v <= 1) {
          if (this.timerInterval) clearInterval(this.timerInterval);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }
}
