import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PendingApproval from './pages/PendingApproval';
import AcceptInvite from './pages/AcceptInvite';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import SequenceBuilder from './pages/SequenceBuilder';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Brands from './pages/Brands';
import SMTP from './pages/SmtpAccounts';
import Analytics from './pages/Analytics';
import Replies from './pages/Replies';
import Tasks from './pages/Tasks';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import AIChat from './pages/AIChat';
import AIAgent from './pages/AIAgent';
import AIUsage from './pages/AIUsage';
import PhoneCalls from './pages/PhoneCalls';
import Templates from './pages/Templates';
import Unsubscribe from './pages/Unsubscribe';
import PlatformDashboard from './pages/PlatformDashboard';
import OrganizationSettings from './pages/OrganizationSettings';
import BillingDashboard from './pages/BillingDashboard';
import OnboardingWizard from './pages/OnboardingWizard';
import Account from './pages/Account';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import HealthCheck from './pages/admin/HealthCheck';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminBilling from './pages/admin/AdminBilling';
import RevenueAnalytics from './pages/admin/RevenueAnalytics';
import DiscountCodes from './pages/admin/DiscountCodes';
import LicenseKeys from './pages/admin/LicenseKeys';
import Affiliates from './pages/admin/Affiliates';
import AdminUsers from './pages/admin/AdminUsers';
import ProUsers from './pages/admin/ProUsers';
import AdminManagement from './pages/admin/AdminManagement';
import ContentManagement from './pages/admin/ContentManagement';
import AdminAIUsage from './pages/admin/AdminAIUsage';
import SecurityAudit from './pages/admin/SecurityAudit';
import RequestsIssues from './pages/admin/RequestsIssues';

function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function PermissionRoute({ permission, children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return <Navigate to="/" replace />;
  return children;
}

function PlatformOwnerRoute({ children }) {
  const { isPlatformOwner } = useAuth();
  if (!isPlatformOwner) return <Navigate to="/" replace />;
  return children;
}

function OrgAdminRoute({ children }) {
  const { isOrgAdmin, isPlatformLevel } = useAuth();
  if (!isOrgAdmin && !isPlatformLevel) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route path="/pending-approval" element={<PendingApproval />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/onboarding" element={<OnboardingWizard />} />

      {/* Platform Admin Panel — fully separate layout, platform-owner only */}
      <Route path="/admin" element={<PlatformOwnerRoute><AdminLayout /></PlatformOwnerRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="health" element={<HealthCheck />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="billing" element={<AdminBilling />} />
        <Route path="revenue" element={<RevenueAnalytics />} />
        <Route path="discount-codes" element={<DiscountCodes />} />
        <Route path="license-keys" element={<LicenseKeys />} />
        <Route path="affiliates" element={<Affiliates />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="pro-users" element={<ProUsers />} />
        <Route path="admins" element={<AdminManagement />} />
        <Route path="content" element={<ContentManagement />} />
        <Route path="ai-usage" element={<AdminAIUsage />} />
        <Route path="security" element={<SecurityAudit />} />
        <Route path="requests" element={<RequestsIssues />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="campaigns/:id/sequence" element={<AdminRoute><SequenceBuilder /></AdminRoute>} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="replies" element={<Replies />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="account" element={<Account />} />

        {/* Admin routes */}
        <Route path="brands" element={<AdminRoute><Brands /></AdminRoute>} />
        <Route path="smtp" element={<AdminRoute><SMTP /></AdminRoute>} />
        <Route path="integrations" element={<AdminRoute><Integrations /></AdminRoute>} />
        <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="audit-logs" element={<AdminRoute><AuditLogs /></AdminRoute>} />
        <Route path="ai-chat" element={<AdminRoute><AIChat /></AdminRoute>} />
        <Route path="ai-agent" element={<AdminRoute><AIAgent /></AdminRoute>} />
        <Route path="ai-usage" element={<AdminRoute><AIUsage /></AdminRoute>} />
        <Route path="templates" element={<AdminRoute><Templates /></AdminRoute>} />

        {/* Permission-gated routes */}
        <Route path="phone-calls" element={
          <PermissionRoute permission="phone_calls.view"><PhoneCalls /></PermissionRoute>
        } />

        {/* Organization management routes */}
        <Route path="org/settings" element={<OrgAdminRoute><OrganizationSettings /></OrgAdminRoute>} />
        <Route path="org/billing" element={<OrgAdminRoute><BillingDashboard /></OrgAdminRoute>} />

        {/* Platform Owner routes */}
        <Route path="platform" element={<PlatformOwnerRoute><PlatformDashboard /></PlatformOwnerRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
