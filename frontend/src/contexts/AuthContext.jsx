import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

// Platform-level roles (not tied to an org)
const PLATFORM_ROLES = ['platform_owner', 'super_admin'];
// Org admin roles
const ORG_ADMIN_ROLES = ['org_admin', 'admin'];
// Roles with management permissions
const MANAGER_ROLES = [...ORG_ADMIN_ROLES, 'org_manager'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    // DEV BYPASS: skip auth and use a fake platform_owner user
    // (so /admin panel + all other routes are accessible during dev)
    if (import.meta.env.DEV) {
      setUser({
        id: 'dev-admin',
        name: 'Platform Owner',
        full_name: 'Platform Owner',
        email: 'apansuvi1@gmail.com',
        role: 'platform_owner',
        is_platform_owner: true,
        permissions: ['*'],
      });
      setOrganization({
        id: 'dev-org',
        name: 'Dev Organization',
        slug: 'dev-org',
        plan: 'agency',
      });
      setLoading(false);
      return;
    }
    try {
      const data = await api.get('/auth/me');
      const u = data.data;
      // Flatten role from object to string and extract permissions
      setUser({
        ...u,
        role: u.role?.name || u.role,
        permissions: u.role?.permissions || u.permissions || [],
      });
      // Set organization context if present
      if (u.organization) {
        setOrganization(u.organization);
      }
    } catch {
      setUser(null);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    // Backend wraps in { success, data: { user, organization } }
    const payload = res.data || res;
    const u = payload.user;

    if (!u) {
      throw new Error('Unexpected login response');
    }

    setUser({
      ...u,
      role: u.role?.name || u.role,
      permissions: u.role?.permissions || u.permissions || [],
    });

    if (payload.organization) {
      setOrganization(payload.organization);
    }

    return res;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    setUser(null);
    setOrganization(null);
  };

  // Role checks
  const role = user?.role || '';
  const isPlatformOwner = role === 'platform_owner';
  const isSuperAdmin = role === 'super_admin';
  const isOrgAdmin = ORG_ADMIN_ROLES.includes(role);
  const isManager = MANAGER_ROLES.includes(role);
  const isPlatformLevel = PLATFORM_ROLES.includes(role);
  // isAdmin = has admin-level access (org_admin, admin, or platform roles)
  const isAdmin = isOrgAdmin || isPlatformLevel;

  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.permissions?.includes('*')) return true;
    return user.permissions?.includes(perm);
  };

  return (
    <AuthContext.Provider value={{
      user,
      organization,
      loading,
      login,
      logout,
      fetchUser,
      // Role booleans
      isPlatformOwner,
      isSuperAdmin,
      isOrgAdmin,
      isManager,
      isPlatformLevel,
      isAdmin,
      // Permission check
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
