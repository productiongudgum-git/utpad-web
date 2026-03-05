import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenService } from '../auth/token.service';

export const authGuard: CanActivateFn = () => {
  const tokenService = inject(TokenService);
  const router = inject(Router);
  if (tokenService.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/auth/login']);
};
