// ═══════════════════════════════════════════════
// Auth Models — TypeScript interfaces for all API contracts
// Derived from design.md API specifications
// ═══════════════════════════════════════════════

// ── Enums ──────────────────────────────────────

export enum UserType {
  Worker = 'worker',
  Admin = 'admin',
  PlatformAdmin = 'platform_admin',
}

export enum UserRole {
  PlatformAdmin = 'Platform_Admin',
  TenantAdmin = 'Tenant_Admin',
  FactorySupervisor = 'Factory_Supervisor',
  InwardingStaff = 'Inwarding_Staff',
  ProductionOperator = 'Production_Operator',
  PackingStaff = 'Packing_Staff',
  DispatchStaff = 'Dispatch_Staff',
  Viewer = 'Viewer',
}

export enum SubscriptionTier {
  Starter = 'starter',
  Growth = 'growth',
  Enterprise = 'enterprise',
}

export enum ResourceScope {
  Tenant = 'tenant',
  Factory = 'factory',
  Gate = 'gate',
  Self = 'self',
}

export enum PermissionModule {
  Inwarding = 'inwarding',
  Production = 'production',
  Packing = 'packing',
  Dispatch = 'dispatch',
  Inventory = 'inventory',
  Cogs = 'cogs',
  Dashboard = 'dashboard',
}

export enum PermissionAction {
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  Approve = 'approve',
}

// ── Common Types ───────────────────────────────

export interface DeviceInfo {
  deviceType: 'web' | 'android';
  userAgent: string;
  ipAddress: string;
}

export interface PlanLimits {
  maxFactories: number;
  maxUsers: number;
  maxEventsPerMonth: number;
}

export interface Permission {
  module: PermissionModule;
  action: PermissionAction;
  resourceScope: ResourceScope;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

// ── User ───────────────────────────────────────

export interface User {
  userId: string;
  tenantId: string;
  email?: string;
  phone?: string;
  name: string;
  role: UserRole;
  factoryIds: string[];
  subscriptionTier: SubscriptionTier;
  twoFaEnabled?: boolean;
}

// ── JWT Token Payload (decoded) ────────────────

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  factoryIds: string[];
  role: UserRole;
  permissions: string[];
  subscriptionTier: SubscriptionTier;
  planLimits: PlanLimits;
  userType: UserType;
  iat: number;
  exp: number;
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  tokenType: 'refresh';
  iat: number;
  exp: number;
  jti: string;
}

// ── API Request Types ──────────────────────────

// POST /auth/register/tenant
export interface RegisterTenantRequest {
  companyName: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  subscriptionTier: SubscriptionTier;
  address: Address;
}

// POST /auth/register/user
export interface RegisterUserRequest {
  userType: UserType;
  phone?: string;
  pin?: string;
  email?: string;
  password?: string;
  name: string;
  roleId: string;
  factoryIds: string[];
}

// POST /auth/login/email
export interface LoginEmailRequest {
  email: string;
  password: string;
  deviceInfo: DeviceInfo;
}

// POST /auth/login/phone
export interface LoginPhoneRequest {
  phone: string;
  pin: string;
  deviceInfo: DeviceInfo;
}

// POST /auth/refresh
export interface RefreshTokenRequest {
  refreshToken: string;
}

// POST /auth/logout
export interface LogoutRequest {
  accessToken: string;
  refreshToken: string;
}

// POST /auth/password/reset-request
export interface PasswordResetRequest {
  email: string;
}

// POST /auth/password/reset-confirm
export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

// POST /auth/pin/reset-request
export interface PinResetRequest {
  phone: string;
}

// POST /auth/pin/reset-approve
export interface PinResetApproveRequest {
  requestId: string;
  newPin: string;
}

// POST /auth/2fa/verify
export interface TwoFactorVerifyRequest {
  tempToken: string;
  totpCode: string;
}

// POST /auth/2fa/disable
export interface TwoFactorDisableRequest {
  totpCode: string;
}

// ── API Response Types ─────────────────────────

// POST /auth/register/tenant response
export interface RegisterTenantResponse {
  tenantId: string;
  adminUserId: string;
  verificationRequired: boolean;
  paymentUrl: string;
  message: string;
}

// POST /auth/register/user response
export interface RegisterUserResponse {
  userId: string;
  message: string;
}

// POST /auth/login/email response (no 2FA)
export interface LoginSuccessResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// POST /auth/login/email response (2FA required)
export interface LoginRequires2FAResponse {
  requires2FA: true;
  tempToken: string;
  message: string;
}

export type LoginEmailResponse = LoginSuccessResponse | LoginRequires2FAResponse;

// POST /auth/login/phone response
export type LoginPhoneResponse = LoginSuccessResponse;

// POST /auth/refresh response
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// POST /auth/logout response
export interface LogoutResponse {
  message: string;
}

// POST /auth/password/reset-request response
export interface PasswordResetRequestResponse {
  message: string;
}

// POST /auth/password/reset-confirm response
export interface PasswordResetConfirmResponse {
  message: string;
}

// POST /auth/pin/reset-request response
export interface PinResetRequestResponse {
  requestId: string;
  message: string;
}

// POST /auth/pin/reset-approve response
export interface PinResetApproveResponse {
  message: string;
}

// GET /auth/me response
export type GetMeResponse = User & { '2faEnabled': boolean };

// GET /auth/permissions response
export interface GetPermissionsResponse {
  permissions: Permission[];
}

// POST /auth/2fa/enable response
export interface TwoFactorEnableResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

// POST /auth/2fa/verify response
export type TwoFactorVerifyResponse = LoginSuccessResponse;

// POST /auth/2fa/disable response
export interface TwoFactorDisableResponse {
  message: string;
}

// ── Error Response ─────────────────────────────

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, string[]>;
}

// ── Session Models ─────────────────────────────

export interface SessionInfo {
  sessionId: string;
  userId: string;
  tenantId: string;
  deviceType: 'web' | 'android';
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
}

// ── Type Guards ────────────────────────────────

export function isLoginRequires2FA(
  response: LoginEmailResponse
): response is LoginRequires2FAResponse {
  return 'requires2FA' in response && response.requires2FA === true;
}

export function isLoginSuccess(
  response: LoginEmailResponse
): response is LoginSuccessResponse {
  return 'accessToken' in response;
}
