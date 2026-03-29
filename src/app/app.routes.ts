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
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', loadComponent: () => import('./features/dashboard/home/dashboard-home.component').then(m => m.DashboardHomeComponent) },
      { path: 'kanban', loadComponent: () => import('./features/dashboard/kanban/kanban.component').then(m => m.KanbanComponent) },
      { path: 'recipes', loadComponent: () => import('./features/dashboard/recipes/recipes-admin.component').then(m => m.RecipesAdminComponent) },
      { path: 'inventory', loadComponent: () => import('./features/dashboard/inventory/inventory.component').then(m => m.InventoryComponent) },
      { path: 'ingredients', loadComponent: () => import('./features/dashboard/ingredients/ingredients.component').then(m => m.IngredientsComponent) },
      { path: 'flavors', loadComponent: () => import('./features/dashboard/flavors/flavors.component').then(m => m.FlavorsComponent) },
      { path: 'vendors', loadComponent: () => import('./features/dashboard/vendors/vendors.component').then(m => m.VendorsComponent) },
      { path: 'customers', loadComponent: () => import('./features/dashboard/customers/customers.component').then(m => m.CustomersComponent) },
      { path: 'team', loadComponent: () => import('./features/dashboard/team/team.component').then(m => m.TeamComponent) },
      { path: 'sessions', loadComponent: () => import('./features/sessions/sessions.component').then(m => m.SessionsComponent) },
      { path: 'production', loadComponent: () => import('./features/dashboard/production/production.component').then(m => m.ProductionComponent) },
      { path: 'packing', loadComponent: () => import('./features/dashboard/packing/packing.component').then(m => m.PackingComponent) },
      { path: 'dispatch', loadComponent: () => import('./features/dashboard/dispatch/dispatch.component').then(m => m.DispatchComponent) },
      { path: 'history', loadComponent: () => import('./features/dashboard/history/history.component').then(m => m.HistoryComponent) },
      { path: 'bills', loadComponent: () => import('./features/dashboard/bills/bills.component').then(m => m.BillsComponent) },
    ],
  },
  { path: '**', redirectTo: '/auth/login' },
];
