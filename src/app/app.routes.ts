import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'auth',
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
      { path: '2fa', loadComponent: () => import('./features/auth/two-factor/two-factor.component').then(m => m.TwoFactorComponent) },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard-shell.component').then(m => m.DashboardShellComponent),
    children: [
      { path: '', redirectTo: 'command-center', pathMatch: 'full' },
      { path: 'command-center', loadComponent: () => import('./features/dashboard/command-center/command-center.component').then(m => m.CommandCenterComponent) },
      { path: 'recipes', loadComponent: () => import('./features/dashboard/recipes/recipes-admin.component').then(m => m.RecipesAdminComponent) },
      { path: 'inwarding', loadComponent: () => import('./features/dashboard/inwarding/inwarding.component').then(m => m.InwardingComponent) },
      { path: 'production', loadComponent: () => import('./features/dashboard/production/production.component').then(m => m.ProductionComponent) },
      { path: 'packing', loadComponent: () => import('./features/dashboard/packing/packing.component').then(m => m.PackingComponent) },
      { path: 'dispatch', loadComponent: () => import('./features/dashboard/dispatch/dispatch.component').then(m => m.DispatchComponent) },
      { path: 'users', loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent) },
      { path: 'sessions', loadComponent: () => import('./features/sessions/sessions.component').then(m => m.SessionsComponent) },
    ],
  },
  { path: '**', redirectTo: '/auth/login' },
];
