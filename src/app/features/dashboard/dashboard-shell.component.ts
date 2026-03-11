import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="min-h-screen flex bg-background-light dark:bg-background-dark transition-colors duration-200">
      <!-- Desktop Sidebar -->
      <aside class="hidden md:flex md:flex-col md:w-64 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark">
        <!-- Logo -->
        <div class="px-6 py-5 border-b border-border-light dark:border-border-dark">
          <div class="flex items-center space-x-3 justify-center">
            <img src="gudgum-logo.webp" alt="Gud Gum" class="h-10 w-auto object-contain dark:invert">
          </div>
        </div>

        <!-- Nav Links -->
        <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          @for (item of navItems; track item.route) {
            <a [routerLink]="item.route"
               routerLinkActive="bg-primary/10 text-primary dark:text-primary font-semibold"
               class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-text-sub-light dark:text-text-sub-dark hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm">
              <span class="material-icons-round text-xl">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <!-- User info + logout -->
        <div class="px-4 py-4 border-t border-border-light dark:border-border-dark">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span class="text-primary text-sm font-bold">{{ userInitial() }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-text-main-light dark:text-text-main-dark truncate">{{ userName() }}</p>
              <p class="text-xs text-text-sub-light dark:text-text-sub-dark">{{ userRole() }}</p>
            </div>
            <button (click)="onLogout()" class="p-1.5 rounded-lg text-text-sub-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Logout">
              <span class="material-icons-round text-xl">logout</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col min-h-screen">
        <!-- Top Header (mobile + desktop) -->
        <header class="bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div class="flex items-center space-x-3 md:hidden">
            <img src="gudgum-logo.webp" alt="Gud Gum" class="h-8 w-auto object-contain dark:invert">
          </div>
          <div class="hidden md:block"></div>
          <div class="flex items-center space-x-3">
            <!-- Online indicator -->
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></span>
              Online
            </span>
            <!-- Dark mode toggle -->
            <button (click)="toggleDarkMode()" class="p-2 rounded-lg text-text-sub-light dark:text-text-sub-dark hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span class="material-icons-round text-xl" [class.hidden]="isDark()">dark_mode</span>
              <span class="material-icons-round text-xl" [class.hidden]="!isDark()">light_mode</span>
            </button>
            <!-- User badge (desktop) -->
            <div class="hidden md:flex items-center space-x-2">
              <span class="text-sm font-medium text-text-main-light dark:text-text-main-dark">{{ userName() }}</span>
              <span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">{{ userRole() }}</span>
            </div>
            <!-- Logout (mobile) -->
            <button (click)="onLogout()" class="md:hidden p-2 rounded-lg text-text-sub-light hover:text-red-500 transition-colors">
              <span class="material-icons-round text-xl">logout</span>
            </button>
          </div>
        </header>

        <!-- Page Content -->
        <main class="flex-1 overflow-y-auto pb-20 md:pb-4">
          <router-outlet />
        </main>
      </div>

      <!-- Mobile Bottom Nav -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark z-20 pb-safe">
        <div class="flex justify-around items-center py-2">
          @for (item of mobileNavItems; track item.route) {
            <a [routerLink]="item.route"
               routerLinkActive="text-primary"
               #rla="routerLinkActive"
               class="flex flex-col items-center gap-0.5 px-2 py-1 text-text-sub-light dark:text-text-sub-dark transition-colors"
               [class.text-primary]="rla.isActive">
              <span class="material-icons-round text-2xl">{{ item.icon }}</span>
              <span class="text-[10px] font-medium">{{ item.label }}</span>
            </a>
          }
        </div>
      </nav>
    </div>
  `,
})
export class DashboardShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  isDark = signal(false);

  navItems: NavItem[] = [
    { label: 'Kanban Board', icon: 'view_kanban', route: 'kanban' },
    { label: 'Recipes', icon: 'science', route: 'recipes' },
    { label: 'Inventory', icon: 'warehouse', route: 'inventory' },
    { label: 'Reports', icon: 'bar_chart', route: 'reports' },
    { label: 'Traceability', icon: 'account_tree', route: 'traceability' },
    { label: 'Alerts', icon: 'notifications_active', route: 'alerts' },
    { label: 'Users', icon: 'group', route: 'users' },
  ];

  mobileNavItems: NavItem[] = [
    { label: 'Kanban', icon: 'view_kanban', route: 'kanban' },
    { label: 'Inventory', icon: 'warehouse', route: 'inventory' },
    { label: 'Alerts', icon: 'notifications_active', route: 'alerts' },
    { label: 'Reports', icon: 'bar_chart', route: 'reports' },
    { label: 'Users', icon: 'group', route: 'users' },
  ];

  userName = () => this.authService.currentUser()?.name ?? 'User';
  userRole = () => this.authService.currentUser()?.role ?? 'Operator';
  userInitial = () => (this.authService.currentUser()?.name ?? 'U').charAt(0).toUpperCase();

  toggleDarkMode(): void {
    this.isDark.update(v => !v);
    document.documentElement.classList.toggle('dark');
  }

  onLogout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => this.router.navigate(['/auth/login']),
    });
  }
}
