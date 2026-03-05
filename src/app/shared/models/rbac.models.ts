// ═══════════════════════════════════════════════
// RBAC Models — Role-Permission Matrix
// ═══════════════════════════════════════════════

import {
  PermissionAction,
  PermissionModule,
  ResourceScope,
  UserRole,
} from './auth.models';

export interface RolePermission {
  module: PermissionModule;
  action: PermissionAction;
  scope: ResourceScope;
}

/**
 * Role-Permission Matrix
 *
 * Platform_Admin → all modules, all actions, tenant scope
 * Tenant_Admin → all modules, all actions, tenant scope
 * Factory_Supervisor → all modules, all actions, factory scope + user creation
 * Inwarding_Staff → inwarding module, create/read, gate scope
 * Production_Operator → production module, create/read/update, gate scope
 * Packing_Staff → packing module, create/read/update, gate scope
 * Dispatch_Staff → dispatch module, create/read/update, gate scope
 * Viewer → all modules, read only, tenant scope
 */
export const ROLE_PERMISSION_MATRIX: Record<UserRole, RolePermission[]> = {
  [UserRole.PlatformAdmin]: Object.values(PermissionModule).flatMap((mod) =>
    Object.values(PermissionAction).map((action) => ({
      module: mod,
      action,
      scope: ResourceScope.Tenant,
    }))
  ),

  [UserRole.TenantAdmin]: Object.values(PermissionModule).flatMap((mod) =>
    Object.values(PermissionAction).map((action) => ({
      module: mod,
      action,
      scope: ResourceScope.Tenant,
    }))
  ),

  [UserRole.FactorySupervisor]: Object.values(PermissionModule).flatMap((mod) =>
    Object.values(PermissionAction).map((action) => ({
      module: mod,
      action,
      scope: ResourceScope.Factory,
    }))
  ),

  [UserRole.InwardingStaff]: [
    { module: PermissionModule.Inwarding, action: PermissionAction.Create, scope: ResourceScope.Gate },
    { module: PermissionModule.Inwarding, action: PermissionAction.Read, scope: ResourceScope.Gate },
    { module: PermissionModule.Inwarding, action: PermissionAction.Update, scope: ResourceScope.Gate },
    { module: PermissionModule.Dashboard, action: PermissionAction.Read, scope: ResourceScope.Gate },
  ],

  [UserRole.ProductionOperator]: [
    { module: PermissionModule.Production, action: PermissionAction.Create, scope: ResourceScope.Gate },
    { module: PermissionModule.Production, action: PermissionAction.Read, scope: ResourceScope.Gate },
    { module: PermissionModule.Production, action: PermissionAction.Update, scope: ResourceScope.Gate },
    { module: PermissionModule.Dashboard, action: PermissionAction.Read, scope: ResourceScope.Gate },
  ],

  [UserRole.PackingStaff]: [
    { module: PermissionModule.Packing, action: PermissionAction.Create, scope: ResourceScope.Gate },
    { module: PermissionModule.Packing, action: PermissionAction.Read, scope: ResourceScope.Gate },
    { module: PermissionModule.Packing, action: PermissionAction.Update, scope: ResourceScope.Gate },
    { module: PermissionModule.Dashboard, action: PermissionAction.Read, scope: ResourceScope.Gate },
  ],

  [UserRole.DispatchStaff]: [
    { module: PermissionModule.Dispatch, action: PermissionAction.Create, scope: ResourceScope.Gate },
    { module: PermissionModule.Dispatch, action: PermissionAction.Read, scope: ResourceScope.Gate },
    { module: PermissionModule.Dispatch, action: PermissionAction.Update, scope: ResourceScope.Gate },
    { module: PermissionModule.Dashboard, action: PermissionAction.Read, scope: ResourceScope.Gate },
  ],

  [UserRole.Viewer]: Object.values(PermissionModule).map((mod) => ({
    module: mod,
    action: PermissionAction.Read,
    scope: ResourceScope.Tenant,
  })),
};

/**
 * Check if a role has a specific permission.
 * Used by route guards and UI directives to show/hide features.
 */
export function roleHasPermission(
  role: UserRole,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  const permissions = ROLE_PERMISSION_MATRIX[role];
  return permissions.some((p) => p.module === module && p.action === action);
}

/**
 * Navigation items visible per role.
 * Controls sidebar/menu rendering.
 */
export interface NavItem {
  label: string;
  icon: string;
  route: string;
  requiredModule: PermissionModule;
  requiredAction: PermissionAction;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', requiredModule: PermissionModule.Dashboard, requiredAction: PermissionAction.Read },
  { label: 'Users', icon: 'people', route: '/users', requiredModule: PermissionModule.Dashboard, requiredAction: PermissionAction.Read },
  { label: 'Sessions', icon: 'devices', route: '/sessions', requiredModule: PermissionModule.Dashboard, requiredAction: PermissionAction.Read },
  { label: 'Inwarding', icon: 'input', route: '/inwarding', requiredModule: PermissionModule.Inwarding, requiredAction: PermissionAction.Read },
  { label: 'Production', icon: 'precision_manufacturing', route: '/production', requiredModule: PermissionModule.Production, requiredAction: PermissionAction.Read },
  { label: 'Packing', icon: 'inventory_2', route: '/packing', requiredModule: PermissionModule.Packing, requiredAction: PermissionAction.Read },
  { label: 'Dispatch', icon: 'local_shipping', route: '/dispatch', requiredModule: PermissionModule.Dispatch, requiredAction: PermissionAction.Read },
  { label: 'Inventory', icon: 'warehouse', route: '/inventory', requiredModule: PermissionModule.Inventory, requiredAction: PermissionAction.Read },
  { label: 'COGS', icon: 'calculate', route: '/cogs', requiredModule: PermissionModule.Cogs, requiredAction: PermissionAction.Read },
];
