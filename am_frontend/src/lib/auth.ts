export const ROLE_ADMIN = "admin";
export const ROLE_AREA_MANAGER = "qrda_areamanager";
export const ROLE_MANAGER = "manager";
export const ROLE_FIELD_OFFICER = "field_officer";

// Legacy role strings preserved for backward compatibility
export const ADMIN_ROLE = "Admin";
export const SUPERVISOR_ROLE = "Supervisor";
export const MAIN_GATE_SUPERVISOR_ROLE = "Main Gate Supervisor";
export const FIELD_OFFICER_ROLE = "Field Officer";

export interface UserIdentity {
  user_id: string;
  name: string;
  app_role: string;
  branch_oid?: number | null;
  branch_name?: string | null;
}

export interface StoredUser extends UserIdentity {
  id?: number;
  employee_id?: string;
  role?: string;
  site_id?: number | null;
  site_ids?: number[];
}

export const DEV_USERS: UserIdentity[] = [];

export const getStoredUserIdentity = (): UserIdentity | null => {
  const raw = sessionStorage.getItem("user");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const userId = parsed.user_id || parsed.employee_id || parsed.id;
    if (!userId) {
      return null;
    }
    const uStr = String(userId);

    return {
      user_id: uStr,
      name: parsed.name || (uStr.toLowerCase() === "admin" ? "Admin" : "User"),
      app_role: parsed.app_role || parsed.role || (uStr.toLowerCase() === "admin" ? ROLE_ADMIN : ROLE_AREA_MANAGER),
      branch_oid: parsed.branch_oid !== undefined ? parsed.branch_oid : null,
      branch_name: parsed.branch_name || null,
    };
  } catch {
    return null;
  }
};

export const setStoredUserIdentity = (identity: UserIdentity): void => {
  sessionStorage.setItem("user", JSON.stringify(identity));
};

export const getStoredUser = (): StoredUser | null => {
  const identity = getStoredUserIdentity();
  if (!identity) return null;
  return {
    ...identity,
    id: identity.user_id === "admin" ? 1 : (parseInt(identity.user_id, 10) || undefined),
    employee_id: identity.user_id,
    role: identity.app_role,
  };
};

export const getCurrentRole = (): string | null => {
  return getStoredUserIdentity()?.app_role ?? null;
};

export const hasAllowedRole = (allowedRoles: string[]): boolean => {
  const role = getCurrentRole();
  if (!role) {
    return false;
  }

  return allowedRoles.some(r => r.toLowerCase() === role.toLowerCase());
};

export const canManageChecklists = (): boolean => {
  const role = getCurrentRole();
  return role ? role.toLowerCase() === ROLE_ADMIN.toLowerCase() : false;
};

