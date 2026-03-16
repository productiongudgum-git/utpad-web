import { HttpInterceptorFn } from '@angular/common/http';

// Simple pass-through interceptor — auth is handled directly via Supabase client
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req);
};
