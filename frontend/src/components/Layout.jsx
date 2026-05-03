import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import DarkModeToggle from './DarkModeToggle';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard,
  Send,
  Users,
  BarChart3,
  MessageSquare,
  Building2,
  Server,
  Plug,
  UserCog,
  Bot,
  Phone,
  ScrollText,
  FileText,
  LogOut,
  ChevronDown,
  ChevronLeft,
  Menu,
  X,
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
  Sparkles,
  User,
  Settings as SettingsIcon,
  KeyRound,
  AlertTriangle,
  Search,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Sidebar nav — **only functional work**. Settings belong in the avatar menu.
// Grouped by job-to-be-done (Work / Grow / Setup), not by taxonomy.
// ---------------------------------------------------------------------------
const workNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/replies', icon: MessageSquare, label: 'Inbox' },
  { to: '/campaigns', icon: Send, label: 'Campaigns' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/phone-calls', icon: Phone, label: 'Phone Calls', permission: 'phone_calls.view' },
];

const growNav = [
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/ai-chat', icon: Sparkles, label: 'AI Assistant', adminOnly: true },
];

const setupNav = [
  { to: '/brands', icon: Building2, label: 'Brands' },
  { to: '/smtp', icon: Server, label: 'Email Accounts' },
  { to: '/integrations', icon: Plug, label: 'Integrations' },
  { to: '/ai-agent', icon: Bot, label: 'AI Agents' },
];

// ---------------------------------------------------------------------------
// Avatar dropdown — all settings live here, Jotform/Stripe/Linear pattern
// ---------------------------------------------------------------------------
const personalMenu = [
  { to: '/account', icon: User, label: 'My Account' },
  { to: '/account?tab=preferences', icon: SettingsIcon, label: 'Preferences' },
];

const orgMenu = [
  { to: '/account?tab=team', icon: UserCog, label: 'Team Members' },
  { to: '/account?tab=organization', icon: Building2, label: 'Organization' },
  { to: '/account?tab=billing', icon: CreditCard, label: 'Billing & Plans' },
  { to: '/account?tab=ai-usage', icon: BarChart3, label: 'API Usage' },
  { to: '/account?tab=system-settings', icon: SettingsIcon, label: 'System Settings' },
  { to: '/account?tab=audit-log', icon: ScrollText, label: 'Audit Log' },
];

const platformMenu = [
  { to: '/admin', icon: Crown, label: 'Admin Panel' },
  { to: '/account?tab=platform-admin', icon: Crown, label: 'Platform Admin' },
];

const pageTitles = {
  '/': 'Dashboard',
  '/campaigns': 'Campaigns',
  '/leads': 'Leads',
  '/analytics': 'Analytics',
  '/replies': 'Inbox',
  '/brands': 'Brands',
  '/smtp': 'Email Accounts',
  '/integrations': 'Integrations',
  '/settings': 'System Settings',
  '/users': 'Team Members',
  '/audit-logs': 'Audit Log',
  '/ai-chat': 'AI Assistant',
  '/ai-agent': 'AI Agents',
  '/ai-usage': 'API Usage',
  '/phone-calls': 'Phone Calls',
  '/templates': 'Templates',
  '/org': 'Organization',
  '/platform': 'Platform Admin',
  '/org/billing': 'Billing & Plans',
  '/org/settings': 'Organization',
  '/account': 'My Account',
  '/onboarding': 'Setup Wizard',
};

function SidebarLink({ to, icon: Icon, label, end, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 ${
          collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
        } ${
          isActive
            ? 'bg-white/20 text-white shadow-sm'
            : 'text-white/75 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function MenuItem({ to, icon: Icon, label, onClick, danger }) {
  const classes = `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
    danger
      ? 'text-red-600 hover:bg-red-50'
      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
  }`;
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        <Icon className="w-4 h-4 text-gray-400" />
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={classes}>
      <Icon className="w-4 h-4 text-gray-400" />
      <span>{label}</span>
    </button>
  );
}

export default function Layout() {
  const {
    user, isAdmin, isOrgAdmin, isPlatformOwner, isPlatformLevel,
    hasPermission, logout, organization,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [setupOpen, setSetupOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };
  const userMenuRef = useRef(null);

  const currentPath = '/' + location.pathname.split('/').filter(Boolean).slice(0, 1).join('/');
  const pageTitle =
    pageTitles[location.pathname] ||
    pageTitles[currentPath] ||
    (location.pathname.startsWith('/campaigns/') ? 'Campaign'
      : location.pathname.startsWith('/leads/') ? 'Lead'
      : location.pathname.startsWith('/org/') ? 'Organization'
      : 'Dashboard');

  useEffect(() => { setSidebarOpen(false); setUserMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut placeholder — opens search focus (Cmd+K full palette in Step 5)
  const searchRef = useRef(null);
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const roleDisplay = (user?.role || 'user').replace(/_/g, ' ');

  // Filter setup items to admin
  const showSetup = isAdmin || isOrgAdmin || isPlatformLevel;

  return (
    <div className="min-h-screen flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===================== SIDEBAR ===================== */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-gradient-sidebar transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo + collapse toggle */}
          <div className={`flex items-center border-b border-white/10 h-14 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
            {!sidebarCollapsed && (
              <Link to="/" className="flex items-center gap-2.5 min-w-0">
                <img src="/ataflex-logo.svg" alt="AtAflex" className="w-8 h-8 flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-white leading-tight truncate">
                    {organization?.name || 'AtAflex'}
                  </span>
                  <span className="text-[10px] text-white/50 font-medium tracking-wider uppercase truncate">
                    {organization?.slug ? `${organization.slug}.coldaf` : 'Solutions'}
                  </span>
                </div>
              </Link>
            )}
            {sidebarCollapsed && (
              <Link to="/" title={organization?.name || 'AtAflex'}>
                <img src="/ataflex-logo.svg" alt="AtAflex" className="w-8 h-8 flex-shrink-0" />
              </Link>
            )}
            <div className="flex items-center gap-1">
              {/* Desktop collapse toggle */}
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
              {/* Mobile close */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Nav */}
          <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {/* WORK */}
            {!sidebarCollapsed && (
              <div className="pb-1.5 px-3">
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Work</p>
              </div>
            )}
            {sidebarCollapsed && <div className="pb-1.5" />}
            {workNav
              .filter(i => !i.permission || hasPermission(i.permission) || isAdmin || isOrgAdmin)
              .map(i => <SidebarLink key={i.to} {...i} collapsed={sidebarCollapsed} />)}

            {/* GROW */}
            {!sidebarCollapsed ? (
              <div className="pt-5 pb-1.5 px-3">
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Grow</p>
              </div>
            ) : <div className="pt-3 pb-1.5 border-t border-white/10 mt-2" />}
            {growNav
              .filter(i => !i.adminOnly || isAdmin || isOrgAdmin)
              .map(i => <SidebarLink key={i.to} {...i} collapsed={sidebarCollapsed} />)}

            {/* SETUP — admins, collapsible, day-one config not daily work */}
            {showSetup && (
              <>
                {!sidebarCollapsed ? (
                  <button
                    onClick={() => setSetupOpen(o => !o)}
                    className="w-full flex items-center justify-between pt-5 pb-1.5 px-3 hover:bg-transparent"
                  >
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Setup</p>
                    <ChevronRight className={`w-3 h-3 text-white/40 transition-transform ${setupOpen ? 'rotate-90' : ''}`} />
                  </button>
                ) : (
                  <div className="pt-3 pb-1.5 border-t border-white/10 mt-2" />
                )}
                {(setupOpen || sidebarCollapsed) && setupNav.map(i => <SidebarLink key={i.to} {...i} collapsed={sidebarCollapsed} />)}
              </>
            )}

            {/* Platform Owner quick link (above fold for owner) */}
            {isPlatformOwner && (
              <>
                {!sidebarCollapsed && (
                  <div className="pt-5 pb-1.5 px-3">
                    <p className="text-[10px] font-semibold text-amber-300/70 uppercase tracking-widest">Platform</p>
                  </div>
                )}
                {sidebarCollapsed && <div className="pt-3 pb-1.5 border-t border-white/10 mt-2" />}
                <SidebarLink to="/account?tab=platform-admin" icon={Crown} label="Platform Admin" collapsed={sidebarCollapsed} />
              </>
            )}
          </nav>

          {/* User footer */}
          <div className={`py-3 border-t border-white/10 ${sidebarCollapsed ? 'px-2 flex justify-center' : 'px-3'}`}>
            <Link
              to="/account"
              title={sidebarCollapsed ? `${user?.name || user?.fullName || 'User'} — My Account` : undefined}
              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() || user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {user?.name || user?.fullName || 'User'}
                  </p>
                  <p className="text-[10px] text-white/40 truncate capitalize">{roleDisplay}</p>
                </div>
              )}
            </Link>
          </div>
        </div>
      </aside>

      {/* ===================== MAIN ===================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30" style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.35)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.04)',
        }}>
          <div className="flex items-center justify-between h-14 px-4 sm:px-6 gap-4">
            {/* Left: mobile menu + page title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-gray-500 hover:text-brand-600 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base font-semibold text-gray-800 truncate">{pageTitle}</h1>
            </div>

            {/* Center: search (Cmd+K) */}
            <div className="hidden md:flex flex-1 max-w-md">
              <div className="w-full relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search or jump to…"
                  onFocus={(e) => e.target.select()}
                  className="w-full pl-9 pr-14 py-1.5 rounded-lg text-sm bg-white/60 border border-gray-200/70 focus:bg-white focus:border-brand-400 focus:outline-none transition-colors placeholder:text-gray-400"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 rounded border border-gray-200">
                  ⌘K
                </kbd>
              </div>
            </div>

            {/* Right: dark mode + bell + avatar */}
            <div className="flex items-center gap-1">
              <DarkModeToggle />

              {/* Notifications */}
              <NotificationBell />

              {/* Avatar dropdown — Jotform pattern: ALL settings live here */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-purple flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl py-1.5 z-50" style={{
                    background: 'rgba(255, 255, 255, 0.97)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    boxShadow: '0 12px 50px rgba(0, 0, 0, 0.12)',
                  }}>
                    {/* User header */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-purple flex items-center justify-center text-white text-sm font-bold">
                          {user?.name?.charAt(0)?.toUpperCase() || user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {user?.name || user?.fullName || 'User'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>
                      </div>
                      {isPlatformOwner && (
                        <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                          <Crown className="w-3 h-3" /> Platform Owner
                        </span>
                      )}
                      {organization?.name && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span className="truncate">{organization.name}</span>
                          {organization.plan && (
                            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold uppercase">
                              {organization.plan}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Personal */}
                    <div className="px-1.5 py-1.5">
                      <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Personal</p>
                      {personalMenu.map(i => (
                        <MenuItem key={i.to} {...i} onClick={() => setUserMenuOpen(false)} />
                      ))}
                    </div>

                    {/* Platform (owner only) */}
                    {isPlatformOwner && (
                      <div className="px-1.5 py-1.5 border-t border-gray-100">
                        <p className="px-3 py-1 text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Platform</p>
                        {platformMenu.map(i => (
                          <MenuItem key={i.to} {...i} onClick={() => setUserMenuOpen(false)} />
                        ))}
                      </div>
                    )}

                    {/* Logout */}
                    <div className="px-1.5 py-1.5 border-t border-gray-100">
                      <MenuItem
                        icon={LogOut}
                        label="Log out"
                        danger
                        onClick={() => { setUserMenuOpen(false); logout(); }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Dunning / trial banner */}
        <BillingStatusBannerInline />

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing status banner
// ---------------------------------------------------------------------------
function BillingStatusBannerInline() {
  const [usage, setUsage] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/billing/usage');
        if (!cancelled) setUsage(res.data.data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!usage || dismissed) return null;

  const delinquent = usage?.stripe?.delinquent;
  const trialWarning = usage.plan === 'trial'
    && usage.trialDaysRemaining !== null
    && usage.trialDaysRemaining <= 3;

  if (!delinquent && !trialWarning && !usage.trialExpired) return null;

  const severity = delinquent || usage.trialExpired ? 'red' : 'amber';
  const palette = severity === 'red'
    ? { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500' }
    : { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' };

  const message = delinquent
    ? 'Your last payment failed. Campaigns are paused until payment is restored.'
    : usage.trialExpired
      ? 'Your free trial has expired. Your account is in read-only mode until you upgrade.'
      : `Your trial ends in ${usage.trialDaysRemaining} day${usage.trialDaysRemaining === 1 ? '' : 's'}. Upgrade to keep sending.`;

  return (
    <div className={`flex items-center gap-3 px-4 sm:px-6 py-2 border-b ${palette.bg} ${palette.border}`}>
      <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${palette.icon}`} />
      <p className={`text-sm flex-1 ${palette.text}`}>{message}</p>
      <Link to="/account?tab=billing" className={`text-sm font-medium underline ${palette.text}`}>
        {delinquent ? 'Fix payment' : 'Upgrade now'}
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className={`text-sm ${palette.text} hover:opacity-70`}
        aria-label="Dismiss"
      >×</button>
    </div>
  );
}
