import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

export interface GgUser {
  id: string;
  username: string;
  name: string;
  role: string;
  modules: string[];
  mobile_number?: string;
  active?: boolean;
}

const SESSION_KEY = 'gg_admin_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<GgUser | null>(this.restoreFromSession());

  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  // Alias so interceptor can reference isAuthenticated as a function
  isAuth(): boolean {
    return this._currentUser() !== null;
  }

  async login(username: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('gg_users')
      .select('id, username, name, role, modules, mobile_number, active, password_hash')
      .eq('username', username)
      .eq('role', 'admin')
      .maybeSingle();

    if (error) throw new Error('Database error: ' + error.message);
    if (!data) throw new Error('Invalid credentials');
    if (data.password_hash !== password) throw new Error('Invalid credentials');
    if (data.active === false) throw new Error('Account is disabled');

    const user: GgUser = {
      id: data.id,
      username: data.username,
      name: data.name ?? data.username,
      role: data.role,
      modules: data.modules ?? [],
      mobile_number: data.mobile_number,
      active: data.active,
    };

    this._currentUser.set(user);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  logout(): void {
    this._currentUser.set(null);
    sessionStorage.removeItem(SESSION_KEY);
    void this.router.navigate(['/auth/login']);
  }

  private restoreFromSession(): GgUser | null {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? (JSON.parse(stored) as GgUser) : null;
    } catch {
      return null;
    }
  }
}
