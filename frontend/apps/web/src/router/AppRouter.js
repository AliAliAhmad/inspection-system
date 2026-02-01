import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../providers/AuthProvider';
import { canAccess } from '@inspection/shared';
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
const LeaveApprovalsPage = lazy(() => import('../pages/admin/LeaveApprovalsPage'));
const BonusApprovalsPage = lazy(() => import('../pages/admin/BonusApprovalsPage'));
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
    return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }, children: _jsx(Spin, { size: "large" }) }));
}
function RoleGuard({ roles, children }) {
    const { user } = useAuth();
    if (!user || !canAccess(user, ...roles)) {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
export default function AppRouter() {
    return (_jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(Routes, { children: _jsxs(Route, { element: _jsx(MainLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "notifications", element: _jsx(NotificationsPage, {}) }), _jsx(Route, { path: "leaderboard", element: _jsx(LeaderboardPage, {}) }), _jsx(Route, { path: "leaves", element: _jsx(LeavesPage, {}) }), _jsx(Route, { path: "profile", element: _jsx(ProfilePage, {}) }), _jsxs(Route, { path: "admin", children: [_jsx(Route, { path: "users", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(UsersPage, {}) }) }), _jsx(Route, { path: "equipment", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(EquipmentPage, {}) }) }), _jsx(Route, { path: "checklists", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(ChecklistsPage, {}) }) }), _jsx(Route, { path: "schedules", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(SchedulesPage, {}) }) }), _jsx(Route, { path: "assignments", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(InspectionAssignmentsPage, {}) }) }), _jsx(Route, { path: "inspections", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(AllInspectionsPage, {}) }) }), _jsx(Route, { path: "specialist-jobs", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(AllSpecialistJobsPage, {}) }) }), _jsx(Route, { path: "engineer-jobs", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(AllEngineerJobsPage, {}) }) }), _jsx(Route, { path: "quality-reviews", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(QualityReviewsAdminPage, {}) }) }), _jsx(Route, { path: "leave-approvals", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(LeaveApprovalsPage, {}) }) }), _jsx(Route, { path: "bonus-approvals", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(BonusApprovalsPage, {}) }) }), _jsx(Route, { path: "reports", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(ReportsPage, {}) }) }), _jsx(Route, { path: "routines", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(InspectionRoutinesPage, {}) }) }), _jsx(Route, { path: "defects", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(DefectsPage, {}) }) }), _jsx(Route, { path: "backlog", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(BacklogPage, {}) }) }), _jsx(Route, { path: "roster", element: _jsx(RoleGuard, { roles: ['admin', 'engineer'], children: _jsx(TeamRosterPage, {}) }) }), _jsx(Route, { path: "pause-approvals", element: _jsx(RoleGuard, { roles: ['admin'], children: _jsx(PauseApprovalsPage, {}) }) })] }), _jsxs(Route, { path: "inspector", children: [_jsx(Route, { path: "assignments", element: _jsx(RoleGuard, { roles: ['inspector'], children: _jsx(MyAssignmentsPage, {}) }) }), _jsx(Route, { path: "inspection/:id", element: _jsx(RoleGuard, { roles: ['inspector'], children: _jsx(InspectionChecklistPage, {}) }) }), _jsx(Route, { path: "assessment/:id", element: _jsx(RoleGuard, { roles: ['inspector'], children: _jsx(AssessmentPage, {}) }) })] }), _jsxs(Route, { path: "specialist", children: [_jsx(Route, { path: "jobs", element: _jsx(RoleGuard, { roles: ['specialist'], children: _jsx(SpecialistJobsPage, {}) }) }), _jsx(Route, { path: "jobs/:id", element: _jsx(RoleGuard, { roles: ['specialist'], children: _jsx(SpecialistJobDetailPage, {}) }) })] }), _jsxs(Route, { path: "engineer", children: [_jsx(Route, { path: "jobs", element: _jsx(RoleGuard, { roles: ['engineer'], children: _jsx(EngineerJobsPage, {}) }) }), _jsx(Route, { path: "jobs/create", element: _jsx(RoleGuard, { roles: ['engineer'], children: _jsx(CreateJobPage, {}) }) }), _jsx(Route, { path: "jobs/:id", element: _jsx(RoleGuard, { roles: ['engineer'], children: _jsx(EngineerJobDetailPage, {}) }) }), _jsx(Route, { path: "pause-approvals", element: _jsx(RoleGuard, { roles: ['engineer'], children: _jsx(PauseApprovalsPage, {}) }) }), _jsx(Route, { path: "team-assignment", element: _jsx(RoleGuard, { roles: ['engineer'], children: _jsx(TeamAssignmentPage, {}) }) })] }), _jsxs(Route, { path: "quality", children: [_jsx(Route, { path: "reviews", element: _jsx(RoleGuard, { roles: ['quality_engineer'], children: _jsx(PendingReviewsPage, {}) }) }), _jsx(Route, { path: "reviews/:id", element: _jsx(RoleGuard, { roles: ['quality_engineer'], children: _jsx(ReviewDetailPage, {}) }) }), _jsx(Route, { path: "overdue", element: _jsx(RoleGuard, { roles: ['quality_engineer'], children: _jsx(OverdueReviewsPage, {}) }) }), _jsx(Route, { path: "bonus-requests", element: _jsx(RoleGuard, { roles: ['quality_engineer'], children: _jsx(BonusRequestsPage, {}) }) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }));
}
//# sourceMappingURL=AppRouter.js.map