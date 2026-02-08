import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';

// Detail screens that push on top of tabs
import InspectionChecklistScreen from '../screens/inspector/InspectionChecklistScreen';
import AssessmentScreen from '../screens/inspector/AssessmentScreen';
import SpecialistJobDetailScreen from '../screens/specialist/SpecialistJobDetailScreen';
import EngineerJobDetailScreen from '../screens/engineer/EngineerJobDetailScreen';
import CreateJobScreen from '../screens/engineer/CreateJobScreen';
import TeamAssignmentScreen from '../screens/engineer/TeamAssignmentScreen';
import ReviewDetailScreen from '../screens/quality_engineer/ReviewDetailScreen';
import OverdueReviewsScreen from '../screens/quality_engineer/OverdueReviewsScreen';
import InspectionRoutinesScreen from '../screens/admin/InspectionRoutinesScreen';
import DefectsScreen from '../screens/admin/DefectsScreen';

// New admin screens
import EquipmentScreen from '../screens/admin/EquipmentScreen';
import ChecklistsScreen from '../screens/admin/ChecklistsScreen';
import AllInspectionsScreen from '../screens/admin/AllInspectionsScreen';
import AllSpecialistJobsScreen from '../screens/admin/AllSpecialistJobsScreen';
import AllEngineerJobsScreen from '../screens/admin/AllEngineerJobsScreen';
import SchedulesScreen from '../screens/admin/SchedulesScreen';
import TeamRosterScreen from '../screens/admin/TeamRosterScreen';
import BacklogScreen from '../screens/admin/BacklogScreen';
import LeaveApprovalsScreen from '../screens/admin/LeaveApprovalsScreen';
import BonusApprovalsScreen from '../screens/admin/BonusApprovalsScreen';
import InspectionAssignmentsScreen from '../screens/admin/InspectionAssignmentsScreen';
import QualityReviewsAdminScreen from '../screens/admin/QualityReviewsAdminScreen';

// Work Planning screens
import WorkPlanOverviewScreen from '../screens/admin/WorkPlanOverviewScreen';
import WorkPlanJobDetailScreen from '../screens/admin/WorkPlanJobDetailScreen';
import UnassignedJobsScreen from '../screens/admin/UnassignedJobsScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  InspectionChecklist: { id: number };
  Assessment: { id: number };
  SpecialistJobDetail: { jobId: number };
  EngineerJobDetail: { jobId: number };
  CreateJob: undefined;
  TeamAssignment: undefined;
  ReviewDetail: { id: number };
  OverdueReviews: undefined;
  InspectionRoutines: undefined;
  Defects: undefined;
  // Admin screens
  Equipment: undefined;
  Checklists: undefined;
  AllInspections: undefined;
  AllSpecialistJobs: undefined;
  AllEngineerJobs: undefined;
  Schedules: undefined;
  TeamRoster: undefined;
  Backlog: undefined;
  LeaveApprovals: undefined;
  BonusApprovals: undefined;
  InspectionAssignments: undefined;
  QualityReviewsAdmin: undefined;
  // Work Planning
  WorkPlanOverview: undefined;
  WorkPlanJobDetail: { jobId: number; planId: number; dayId: number };
  UnassignedJobs: { planId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="InspectionChecklist" component={InspectionChecklistScreen} options={{ headerShown: true, title: 'Inspection' }} />
      <Stack.Screen name="Assessment" component={AssessmentScreen} options={{ headerShown: true, title: 'Assessment' }} />
      <Stack.Screen name="SpecialistJobDetail" component={SpecialistJobDetailScreen} options={{ headerShown: true, title: 'Job Detail' }} />
      <Stack.Screen name="EngineerJobDetail" component={EngineerJobDetailScreen} options={{ headerShown: true, title: 'Job Detail' }} />
      <Stack.Screen name="CreateJob" component={CreateJobScreen} options={{ headerShown: true, title: 'Create Job' }} />
      <Stack.Screen name="TeamAssignment" component={TeamAssignmentScreen} options={{ headerShown: true, title: 'Team Assignment' }} />
      <Stack.Screen name="ReviewDetail" component={ReviewDetailScreen} options={{ headerShown: true, title: 'Review' }} />
      <Stack.Screen name="OverdueReviews" component={OverdueReviewsScreen} options={{ headerShown: true, title: 'Overdue Reviews' }} />
      <Stack.Screen name="InspectionRoutines" component={InspectionRoutinesScreen} options={{ headerShown: true, title: 'Inspection Routines' }} />
      <Stack.Screen name="Defects" component={DefectsScreen} options={{ headerShown: true, title: 'Defects' }} />
      {/* Admin screens */}
      <Stack.Screen name="Equipment" component={EquipmentScreen} options={{ headerShown: true, title: 'Equipment' }} />
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={{ headerShown: true, title: 'Checklists' }} />
      <Stack.Screen name="AllInspections" component={AllInspectionsScreen} options={{ headerShown: true, title: 'All Inspections' }} />
      <Stack.Screen name="AllSpecialistJobs" component={AllSpecialistJobsScreen} options={{ headerShown: true, title: 'Specialist Jobs' }} />
      <Stack.Screen name="AllEngineerJobs" component={AllEngineerJobsScreen} options={{ headerShown: true, title: 'Engineer Jobs' }} />
      <Stack.Screen name="Schedules" component={SchedulesScreen} options={{ headerShown: true, title: 'Schedules' }} />
      <Stack.Screen name="TeamRoster" component={TeamRosterScreen} options={{ headerShown: true, title: 'Team Roster' }} />
      <Stack.Screen name="Backlog" component={BacklogScreen} options={{ headerShown: true, title: 'Backlog' }} />
      <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} options={{ headerShown: true, title: 'Leave Approvals' }} />
      <Stack.Screen name="BonusApprovals" component={BonusApprovalsScreen} options={{ headerShown: true, title: 'Bonus Approvals' }} />
      <Stack.Screen name="InspectionAssignments" component={InspectionAssignmentsScreen} options={{ headerShown: true, title: 'Assignments' }} />
      <Stack.Screen name="QualityReviewsAdmin" component={QualityReviewsAdminScreen} options={{ headerShown: true, title: 'Quality Reviews' }} />
      {/* Work Planning screens */}
      <Stack.Screen name="WorkPlanOverview" component={WorkPlanOverviewScreen} options={{ headerShown: true, title: 'Work Planning' }} />
      <Stack.Screen name="WorkPlanJobDetail" component={WorkPlanJobDetailScreen} options={{ headerShown: true, title: 'Job Details' }} />
      <Stack.Screen name="UnassignedJobs" component={UnassignedJobsScreen} options={{ headerShown: true, title: 'Unassigned Jobs' }} />
    </Stack.Navigator>
  );
}
