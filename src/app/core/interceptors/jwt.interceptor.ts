import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { TokenService } from '../auth/token.service';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const jwtInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = tokenService.getAccessToken();
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !req.url.includes('/auth/')) {
        if (!isRefreshing) {
          isRefreshing = true;
          refreshTokenSubject.next(null);
          return authService.refreshAccessToken().pipe(
            switchMap((response) => {
              isRefreshing = false;
              refreshTokenSubject.next(response.accessToken);
              return next(req.clone({ setHeaders: { Authorization: `Bearer ${response.accessToken}` } }));
            }),
            catchError((refreshError) => {
              isRefreshing = false;
              router.navigate(['/auth/login']);
              return throwError(() => refreshError);
            })
          );
        }
        return refreshTokenSubject.pipe(
          filter((token) => token !== null),
          take(1),
          switchMap((token) => next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })))
        );
      }
      return throwError(() => error);
    })
  );
};
