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
    .nav-item { display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:8px;text-decoration:none;color:rgba(255,255,255,0.65);font-size:14px;font-weight:500;cursor:pointer;transition:all 0.15s;white-space:nowrap;overflow:hidden; }
    .nav-item:hover { background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.9); }
    .nav-item.active { background:#01AC51;color:#fff; }
    .nav-item .mat-icon { font-size:20px;width:20px;height:20px;flex-shrink:0; }
  `],
  template: `
    <div style="display:flex;min-height:100vh;background:#f8f9fa;">

      <!-- ── SIDEBAR ───────────────────────────────────── -->
      <aside style="width:220px;min-height:100vh;background:#1a1a2e;display:flex;flex-direction:column;flex-shrink:0;position:fixed;top:0;left:0;z-index:30;"
             [style.left]="sidebarOpen() ? '0' : '-220px'"
             [style.transition]="'left 0.25s ease'"
             class="sidebar-panel">

        <!-- Brand -->
        <div style="padding:20px 16px 16px;border-bottom:1px solid rgba(255,255,255,0.07);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:38px;height:38px;background:#01AC51;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:#fff;font-family:'Cabin',sans-serif;font-weight:700;font-size:14px;">GG</span>
            </div>
            <div>
              <p style="color:#fff;font-family:'Cabin',sans-serif;font-weight:700;font-size:15px;margin:0;line-height:1.2;">Gud Gum</p>
              <p style="color:rgba(255,255,255,0.45);font-size:10px;margin:0;letter-spacing:1.5px;text-transform:uppercase;">Production Ops</p>
            </div>
          </div>
        </div>

        <!-- Nav -->
        <nav style="flex:1;padding:12px 10px;overflow-y:auto;">
          @for (item of navItems; track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active" class="nav-item" style="margin-bottom:2px;">
              <span class="material-icons-round mat-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <!-- User + Logout -->
        <div style="padding:14px 10px;border-top:1px solid rgba(255,255,255,0.07);">
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.05);margin-bottom:8px;">
            <div style="width:30px;height:30px;background:#01AC51;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:#fff;font-size:12px;font-weight:700;">{{ userInitial() }}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <p style="color:#fff;font-size:13px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ userName() }}</p>
              <p style="color:rgba(255,255,255,0.45);font-size:11px;margin:0;">Admin</p>
            </div>
          </div>
          <button (click)="logout()" style="width:100%;padding:8px;background:#FF2828;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
            <span class="material-icons-round" style="font-size:16px;">logout</span>
            Log out
          </button>
        </div>
      </aside>

      <!-- Sidebar overlay (mobile) -->
      @if (sidebarOpen() && isMobile()) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:29;" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- ── MAIN CONTENT ────────────────────────────── -->
      <div style="flex:1;display:flex;flex-direction:column;margin-left:220px;" [style.marginLeft]="isMobile() ? '0' : '220px'">

        <!-- Top bar (mobile) -->
        <header style="display:none;background:#1a1a2e;padding:12px 16px;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;"
                [style.display]="isMobile() ? 'flex' : 'none'">
          <button (click)="toggleSidebar()" style="background:none;border:none;color:#fff;cursor:pointer;display:flex;">
            <span class="material-icons-round">menu</span>
          </button>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;background:#01AC51;border-radius:50%;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:11px;font-weight:700;">GG</span>
            </div>
            <span style="color:#fff;font-family:'Cabin',sans-serif;font-weight:700;font-size:14px;">Gud Gum</span>
          </div>
          <button (click)="logout()" style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;display:flex;">
            <span class="material-icons-round" style="font-size:20px;">logout</span>
          </button>
        </header>

        <!-- Page content -->
        <main style="flex:1;overflow-y:auto;">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class DashboardShellComponent {
  private readonly authService = inject(AuthService);

  sidebarOpen = signal(true);

  navItems: NavItem[] = [
    { label: 'Dashboard',   icon: 'dashboard',          route: 'home' },
    { label: 'Live Kanban', icon: 'view_kanban',         route: 'kanban' },
    { label: 'Recipes',     icon: 'science',             route: 'recipes' },
    { label: 'Inventory',   icon: 'inventory_2',         route: 'inventory' },
    { label: 'Ingredients', icon: 'category',            route: 'ingredients' },
    { label: 'Flavors',     icon: 'local_dining',        route: 'flavors' },
    { label: 'Vendors',     icon: 'storefront',          route: 'vendors' },
    { label: 'Customers',   icon: 'people',              route: 'customers' },
    { label: 'Team',        icon: 'group',               route: 'team' },
    { label: 'History',     icon: 'history',             route: 'history' },
  ];

  userName = () => this.authService.currentUser()?.name ?? 'Admin User';
  userInitial = () => (this.authService.currentUser()?.name ?? 'A').charAt(0).toUpperCase();

  isMobile(): boolean {
    return window.innerWidth < 768;
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  logout(): void {
    this.authService.logout();
  }
}
