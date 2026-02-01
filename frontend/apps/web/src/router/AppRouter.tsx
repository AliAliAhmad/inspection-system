import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../providers/AuthProvider';
import { canAccess, UserRole } from '@inspection/shared';

// Lazy-loaded pages for code splitting
// Shared pages
const DashboardPage = lazy(() => import('../pages/shared/DashboardPage'));
const NotificationsPage = lazy(() => import('../pages/shared/NotificationsPage'));
const LeaderboardPage = lazy(() => import('../pages/shared/LeaderboardPage'));
const LeavesPage = lazy(() => import('../pages/shared/LeavesPage'));
const ProfilePage = lazy(() => import('../pages/shared/ProfilePage'));

// Admin pages
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const EquipmentPage = lazy(() => import('../pages/admin/EquipmentPage'));
const ChecklistsPage = lazy(() => import('../pages/admin/ChecklistsPage'));
const SchedulesPage = lazy(() => import('../pages/admin/SchedulesPage'));
const InspectionAssignmentsPage = lazy(() => import('../pages/admin/InspectionAssignmentsPage'));
const AllInspectionsPage = lazy(() => import('../pages/admin/AllInspectionsPage'));
const AllSpecialistJobsPage = lazy(() => import('../pages/admin/AllSpecialistJobsPage'));
const AllEngineerJobsPage = lazy(() => import('../pages/admin/AllEngineerJobsPage'));
const QualityReviewsAdminPage = lazy(() => import('../pages/admin/QualityReviewsAdminPage'));
const ApprovalsPage = lazy(() => import('../pages/admin/ApprovalsPage'));
const ReportsPage = lazy(() => import('../pages/admin/ReportsPage'));
const InspectionRoutinesPage = lazy(() => import('../pages/admin/InspectionRoutinesPage'));
const DefectsPage = lazy(() => import('../pages/admin/DefectsPage'));
const BacklogPage = lazy(() => import('../pages/admin/BacklogPage'));
const TeamRosterPage = lazy(() => import('../pages/admin/TeamRosterPage'));

// Inspector pages
const MyAssignmentsPage = lazy(() => import('../pages/inspector/MyAssignmentsPage'));
const InspectionChecklistPage = lazy(() => import('../pages/inspector/InspectionChecklistPage'));
const AssessmentPage = lazy(() => import('../pages/inspector/AssessmentPage'));

// Specialist pages
const SpecialistJobsPage = lazy(() => import('../pages/specialist/SpecialistJobsPage'));
const SpecialistJobDetailPage = lazy(() => import('../pages/specialist/SpecialistJobDetailPage'));

// Engineer pages
const EngineerJobsPage = lazy(() => import('../pages/engineer/EngineerJobsPage'));
const CreateJobPage = lazy(() => import('../pages/engineer/CreateJobPage'));
const EngineerJobDetailPage = lazy(() => import('../pages/engineer/EngineerJobDetailPage'));
const PauseApprovalsPage = lazy(() => import('../pages/engineer/PauseApprovalsPage'));
const TeamAssignmentPage = lazy(() => import('../pages/engineer/TeamAssignmentPage'));

// Quality Engineer pages
const PendingReviewsPage = lazy(() => import('../pages/quality_engineer/PendingReviewsPage'));
const ReviewDetailPage = lazy(() => import('../pages/quality_engineer/ReviewDetailPage'));
const OverdueReviewsPage = lazy(() => import('../pages/quality_engineer/OverdueReviewsPage'));
const BonusRequestsPage = lazy(() => import('../pages/quality_engineer/BonusRequestsPage'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
      <Spin size="large" />
    </div>
  );
}

function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !canAccess(user, ...(roles as UserRole[]))) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<MainLayout />}>
          {/* Shared routes - all roles */}
          <Route index element={<DashboardPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="leaves" element={<LeavesPage />} />
          <Route path="profile" element={<ProfilePage />} />

          {/* Admin routes */}
          <Route path="admin">
            <Route path="users" element={<RoleGuard roles={['admin']}><UsersPage /></RoleGuard>} />
            <Route path="equipment" element={<RoleGuard roles={['admin']}><EquipmentPage /></RoleGuard>} />
            <Route path="checklists" element={<RoleGuard roles={['admin']}><ChecklistsPage /></RoleGuard>} />
            <Route path="schedules" element={<RoleGuard roles={['admin']}><SchedulesPage /></RoleGuard>} />
            <Route path="assignments" element={<RoleGuard roles={['admin']}><InspectionAssignmentsPage /></RoleGuard>} />
            <Route path="inspections" element={<RoleGuard roles={['admin']}><AllInspectionsPage /></RoleGuard>} />
            <Route path="specialist-jobs" element={<RoleGuard roles={['admin']}><AllSpecialistJobsPage /></RoleGuard>} />
            <Route path="engineer-jobs" element={<RoleGuard roles={['admin']}><AllEngineerJobsPage /></RoleGuard>} />
            <Route path="quality-reviews" element={<RoleGuard roles={['admin']}><QualityReviewsAdminPage /></RoleGuard>} />
            <Route path="approvals" element={<RoleGuard roles={['admin']}><ApprovalsPage /></RoleGuard>} />
            {/* Redirects from old approval routes */}
            <Route path="leave-approvals" element={<Navigate to="/admin/approvals?tab=leaves" replace />} />
            <Route path="bonus-approvals" element={<Navigate to="/admin/approvals?tab=bonus" replace />} />
            <Route path="reports" element={<RoleGuard roles={['admin']}><ReportsPage /></RoleGuard>} />
            <Route path="routines" element={<RoleGuard roles={['admin']}><InspectionRoutinesPage /></RoleGuard>} />
            <Route path="defects" element={<RoleGuard roles={['admin']}><DefectsPage /></RoleGuard>} />
            <Route path="backlog" element={<RoleGuard roles={['admin']}><BacklogPage /></RoleGuard>} />
            <Route path="roster" element={<RoleGuard roles={['admin', 'engineer']}><TeamRosterPage /></RoleGuard>} />
            <Route path="pause-approvals" element={<Navigate to="/admin/approvals?tab=pauses" replace />} />
          </Route>

          {/* Inspector routes */}
          <Route path="inspector">
            <Route path="assignments" element={<RoleGuard roles={['inspector']}><MyAssignmentsPage /></RoleGuard>} />
            <Route path="inspection/:id" element={<RoleGuard roles={['inspector']}><InspectionChecklistPage /></RoleGuard>} />
            <Route path="assessment/:id" element={<RoleGuard roles={['inspector']}><AssessmentPage /></RoleGuard>} />
          </Route>

          {/* Specialist routes */}
          <Route path="specialist">
            <Route path="jobs" element={<RoleGuard roles={['specialist']}><SpecialistJobsPage /></RoleGuard>} />
            <Route path="jobs/:id" element={<RoleGuard roles={['specialist']}><SpecialistJobDetailPage /></RoleGuard>} />
          </Route>

          {/* Engineer routes */}
          <Route path="engineer">
            <Route path="jobs" element={<RoleGuard roles={['engineer']}><EngineerJobsPage /></RoleGuard>} />
            <Route path="jobs/create" element={<RoleGuard roles={['engineer']}><CreateJobPage /></RoleGuard>} />
            <Route path="jobs/:id" element={<RoleGuard roles={['engineer']}><EngineerJobDetailPage /></RoleGuard>} />
            <Route path="pause-approvals" element={<RoleGuard roles={['engineer']}><PauseApprovalsPage /></RoleGuard>} />
            <Route path="team-assignment" element={<RoleGuard roles={['engineer']}><TeamAssignmentPage /></RoleGuard>} />
          </Route>

          {/* Quality Engineer routes */}
          <Route path="quality">
            <Route path="reviews" element={<RoleGuard roles={['quality_engineer']}><PendingReviewsPage /></RoleGuard>} />
            <Route path="reviews/:id" element={<RoleGuard roles={['quality_engineer']}><ReviewDetailPage /></RoleGuard>} />
            <Route path="overdue" element={<RoleGuard roles={['quality_engineer']}><OverdueReviewsPage /></RoleGuard>} />
            <Route path="bonus-requests" element={<RoleGuard roles={['quality_engineer']}><BonusRequestsPage /></RoleGuard>} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
