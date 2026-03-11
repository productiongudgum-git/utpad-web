import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'auth',
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard-shell.component').then(m => m.DashboardShellComponent),
    children: [
      { path: '', redirectTo: 'kanban', pathMatch: 'full' },
      { path: 'recipes', loadComponent: () => import('./features/dashboard/recipes/recipes-admin.component').then(m => m.RecipesAdminComponent) },
      { path: 'kanban', loadComponent: () => import('./features/dashboard/kanban/kanban.component').then(m => m.KanbanComponent) },
      { path: 'traceability', loadComponent: () => import('./features/dashboard/traceability/traceability.component').then(m => m.TraceabilityComponent) },
      { path: 'alerts', loadComponent: () => import('./features/dashboard/alerts/alerts.component').then(m => m.AlertsComponent) },
      { path: 'users', loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent) },
      { path: 'sessions', loadComponent: () => import('./features/sessions/sessions.component').then(m => m.SessionsComponent) },
      { path: 'inventory', loadComponent: () => import('./features/dashboard/inventory/inventory.component').then(m => m.InventoryComponent) },
      { path: 'reports', loadComponent: () => import('./features/dashboard/reports/reports.component').then(m => m.ReportsComponent) },
    ],
  },
  { path: '**', redirectTo: '/auth/login' },
];
