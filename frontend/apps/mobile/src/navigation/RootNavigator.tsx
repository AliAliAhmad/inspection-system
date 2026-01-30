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

export type RootStackParamList = {
  MainTabs: undefined;
  InspectionChecklist: { id: number };
  Assessment: { id: number };
  SpecialistJobDetail: { id: number };
  EngineerJobDetail: { id: number };
  CreateJob: undefined;
  TeamAssignment: undefined;
  ReviewDetail: { id: number };
  OverdueReviews: undefined;
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
    </Stack.Navigator>
  );
}
