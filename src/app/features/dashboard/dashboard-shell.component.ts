import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  styles: [`
    .sidebar-link {
      display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 12px;
      text-decoration: none; font-weight: 500; font-size: 14px; color: var(--muted-fg);
      transition: all 0.2s ease; cursor: pointer;
    }
    .sidebar-link:hover { background: var(--secondary); color: var(--foreground); }
    .sidebar-link:hover .link-icon { transform: scale(1.1); }
    .sidebar-link.active { background: var(--primary-light); color: var(--primary); }
    .sidebar-link .link-icon { font-size: 20px; width: 20px; height: 20px; transition: transform 0.2s; }
    .user-card:hover { filter: brightness(0.97); }
    .user-card.active { box-shadow: inset 0 0 0 1.5px var(--primary); }
    @media (max-width: 1023px) {
      .sidebar-panel { transform: translateX(-100%); }
      .sidebar-panel.open { transform: translateX(0); }
      .main-content { margin-left: 0 !important; }
      .mobile-topbar { display: flex !important; }
    }
  `],
  template: `
    <div style="display:flex;min-height:100vh;background:var(--background);">

      <!-- ── SIDEBAR ── -->
      <aside class="sidebar-panel" [class.open]="sidebarOpen()"
             style="width:288px;height:100vh;background:var(--sidebar-bg);border-right:1px solid var(--sidebar-border);display:flex;flex-direction:column;position:fixed;left:0;top:0;z-index:40;transition:transform 0.3s ease;box-shadow:4px 0 24px rgb(0 0 0 / 0.02);">

        <!-- Brand -->
        <div style="padding:24px;display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:12px;background:var(--primary);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(1,172,81,0.2);flex-shrink:0;">
            <span style="color:#fff;font-family:var(--font-display);font-weight:700;font-size:18px;">GG</span>
          </div>
          <div>
            <h1 style="font-family:var(--font-display);font-weight:700;font-size:20px;color:var(--foreground);line-height:1;">Gud Gum</h1>
            <p style="font-size:11px;color:var(--muted-fg);font-weight:500;margin-top:4px;text-transform:uppercase;letter-spacing:1.5px;">Production Ops</p>
          </div>
        </div>

        <!-- Nav -->
        <nav style="flex:1;overflow-y:auto;padding:16px 16px;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            @for (item of navItems; track item.route) {
              <a [routerLink]="item.route" routerLinkActive="active" class="sidebar-link" (click)="closeSidebarOnMobile()">
                <span class="material-icons-round link-icon">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </a>
            }
          </div>
        </nav>

        <!-- User + Logout -->
        <div style="padding:16px;border-top:1px solid var(--sidebar-border);">
          <div class="user-card" routerLink="team" routerLinkActive="active" (click)="closeSidebarOnMobile()"
               title="Manage team"
               style="padding:12px;background:var(--secondary);border-radius:12px;margin-bottom:12px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all 0.15s;">
            <div style="flex:1;min-width:0;">
              <p style="font-size:14px;font-weight:600;color:var(--foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;">{{ userName() }}</p>
              <p style="font-size:12px;color:var(--muted-fg);text-transform:capitalize;margin:0;">{{ userRole() }}</p>
            </div>
            <span class="material-icons-round" style="font-size:18px;color:var(--muted-fg);flex-shrink:0;">group</span>
          </div>
          <button (click)="logout()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:12px;font-weight:500;font-size:14px;color:var(--destructive);background:none;border:none;cursor:pointer;transition:background 0.15s;"
                  onmouseover="this.style.background='rgba(255,40,40,0.06)'" onmouseout="this.style.background='none'">
            <span class="material-icons-round" style="font-size:18px;">logout</span>
            Log out
          </button>
        </div>
      </aside>

      <!-- Mobile overlay -->
      @if (sidebarOpen() && isMobile()) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:30;" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- ── MAIN CONTENT ── -->
      <div class="main-content" style="flex:1;display:flex;flex-direction:column;margin-left:288px;">

        <!-- Mobile top bar -->
        <header class="mobile-topbar" style="display:none;background:#fff;padding:12px 16px;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border);box-shadow:0 1px 3px rgb(0 0 0 / 0.04);">
          <button (click)="toggleSidebar()" style="background:none;border:none;cursor:pointer;padding:8px;border-radius:12px;display:flex;">
            <span class="material-icons-round" style="font-size:24px;color:var(--foreground);">menu</span>
          </button>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:8px;background:var(--primary);display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-weight:700;font-size:11px;">GG</span>
            </div>
            <span style="font-family:var(--font-display);font-weight:700;font-size:15px;color:var(--foreground);">Gud Gum Ops</span>
          </div>
          <button (click)="logout()" style="background:none;border:none;cursor:pointer;padding:8px;display:flex;color:var(--muted-fg);">
            <span class="material-icons-round" style="font-size:20px;">logout</span>
          </button>
        </header>

        <!-- Page content -->
        <main style="flex:1;overflow-y:auto;">
          <div style="max-width:1280px;margin:0 auto;padding:24px;">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class DashboardShellComponent {
  private readonly authService = inject(AuthService);

  sidebarOpen = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard',   icon: 'dashboard',              route: 'home' },
    { label: 'Recipes',     icon: 'science',                 route: 'recipes' },
    // Flavors are the SKU behind each recipe — auto-created by the recipe
    // import and kept 1:1 with recipes. Hidden from nav so no one hand-creates
    // stray duplicate flavors. The /flavors route still works via direct URL
    // if you ever need to inspect or clean up.
    { label: 'Inventory',   icon: 'inventory_2',             route: 'inventory' },
    // Packing variants are the one legitimate reason to hand-create a flavour
    // row, so they get their own entry while /flavors stays hidden.
    { label: 'Packing Variants', icon: 'takeout_dining',     route: 'packing-variants' },
    { label: 'Ingredients', icon: 'category',                route: 'ingredients' },
    { label: 'Wastage',     icon: 'delete_sweep',            route: 'wastage' },
    { label: 'Invoices',    icon: 'description',             route: 'invoices' },
    { label: 'Returns',     icon: 'assignment_return',       route: 'returns' },
    { label: 'D2C',         icon: 'storefront',              route: 'd2c' },
    { label: 'Courier Analysis', icon: 'local_shipping',      route: 'courier-analysis' },
    { label: 'Reports',     icon: 'download',                route: 'reports' },
  ];

  userName = () => this.authService.currentUser()?.name ?? 'Admin User';
  userRole = () => this.authService.currentUser()?.role ?? 'admin';

  isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 1024;
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebarOnMobile(): void {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  logout(): void {
    this.authService.logout();
  }
}
