import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { TokenService } from './auth/token.service';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public client: SupabaseClient;

  constructor(private readonly tokenService: TokenService) {
    this.client = createClient(
      environment.supabase.apiUrl,
      environment.supabase.publishableKey,
      { auth: { persistSession: false } }
    );
    // Restore session on page refresh — TokenService has already read tokens
    // from sessionStorage by the time this constructor runs.
    this.restoreSession();
  }

  private restoreSession(): void {
    const accessToken = this.tokenService.getAccessToken();
    const refreshToken = this.tokenService.getRefreshToken();
    if (accessToken && refreshToken) {
      void this.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
  }
}
