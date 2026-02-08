import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../providers/AuthProvider';
import { useTranslation } from 'react-i18next';

// Shared screens
import DashboardScreen from '../screens/shared/DashboardScreen';
import NotificationsScreen from '../screens/shared/NotificationsScreen';
import LeaderboardScreen from '../screens/shared/LeaderboardScreen';
import LeavesScreen from '../screens/shared/LeavesScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';
import MyWorkPlanScreen from '../screens/shared/MyWorkPlanScreen';
import WorkPlanOverviewScreen from '../screens/admin/WorkPlanOverviewScreen';

// Role screens
import MyAssignmentsScreen from '../screens/inspector/MyAssignmentsScreen';
import SpecialistJobsScreen from '../screens/specialist/SpecialistJobsScreen';
import EngineerJobsScreen from '../screens/engineer/EngineerJobsScreen';
import PauseApprovalsScreen from '../screens/engineer/PauseApprovalsScreen';
import PendingReviewsScreen from '../screens/quality_engineer/PendingReviewsScreen';
import BonusRequestsScreen from '../screens/quality_engineer/BonusRequestsScreen';

// Admin screens
import AdminApprovalsScreen from '../screens/admin/AdminApprovalsScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminReportsScreen from '../screens/admin/AdminReportsScreen';

const Tab = createBottomTabNavigator();

function InspectorTabs({ t }: { t: (key: string) => string }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: t('nav.dashboard') }} />
      <Tab.Screen name="Assignments" component={MyAssignmentsScreen} options={{ tabBarLabel: t('nav.my_assignments') }} />
      <Tab.Screen name="WorkPlan" component={MyWorkPlanScreen} options={{ tabBarLabel: t('nav.my_work_plan') }} />
      <Tab.Screen name="Leaves" component={LeavesScreen} options={{ tabBarLabel: t('nav.leaves') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

function SpecialistTabs({ t }: { t: (key: string) => string }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: t('nav.dashboard') }} />
      <Tab.Screen name="Jobs" component={SpecialistJobsScreen} options={{ tabBarLabel: t('nav.my_jobs') }} />
      <Tab.Screen name="WorkPlan" component={MyWorkPlanScreen} options={{ tabBarLabel: t('nav.my_work_plan') }} />
      <Tab.Screen name="Leaves" component={LeavesScreen} options={{ tabBarLabel: t('nav.leaves') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

function EngineerTabs({ t }: { t: (key: string) => string }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: t('nav.dashboard') }} />
      <Tab.Screen name="Jobs" component={EngineerJobsScreen} options={{ tabBarLabel: t('nav.my_jobs') }} />
      <Tab.Screen name="WorkPlan" component={WorkPlanOverviewScreen} options={{ tabBarLabel: t('nav.work_planning') }} />
      <Tab.Screen name="Approvals" component={PauseApprovalsScreen} options={{ tabBarLabel: t('nav.pause_approvals') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

function QETabs({ t }: { t: (key: string) => string }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: t('nav.dashboard') }} />
      <Tab.Screen name="Reviews" component={PendingReviewsScreen} options={{ tabBarLabel: t('nav.pending_reviews') }} />
      <Tab.Screen name="WorkPlan" component={MyWorkPlanScreen} options={{ tabBarLabel: t('nav.my_work_plan') }} />
      <Tab.Screen name="Leaves" component={LeavesScreen} options={{ tabBarLabel: t('nav.leaves') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

function AdminTabs({ t }: { t: (key: string) => string }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: t('nav.dashboard') }} />
      <Tab.Screen name="WorkPlan" component={WorkPlanOverviewScreen} options={{ tabBarLabel: t('nav.work_planning') }} />
      <Tab.Screen name="Approvals" component={AdminApprovalsScreen} options={{ tabBarLabel: t('nav.approvals') }} />
      <Tab.Screen name="Reports" component={AdminReportsScreen} options={{ tabBarLabel: t('nav.reports') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

export default function MainTabNavigator() {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;

  switch (user.role) {
    case 'inspector':
      return <InspectorTabs t={t} />;
    case 'specialist':
      return <SpecialistTabs t={t} />;
    case 'engineer':
      return <EngineerTabs t={t} />;
    case 'quality_engineer':
      return <QETabs t={t} />;
    case 'admin':
      return <AdminTabs t={t} />;
    default:
      return <InspectorTabs t={t} />;
  }
}
