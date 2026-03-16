import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  public readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      'https://zoemonbualktnxhpbebv.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZW1vbmJ1YWxrdG54aHBiZWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTU1NDksImV4cCI6MjA4ODM3MTU0OX0.ZH8Brq0SGn7KY-VzCupsjMNf_OSOlyY4GwXr42yBu3c',
      { auth: { persistSession: false } }
    );
  }
}
