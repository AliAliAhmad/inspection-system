import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainTabName, RootStackParamList } from './RootNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** A root screen, or a tab inside MainTabs — see MainTabName. */
export type Destination = keyof RootStackParamList | MainTabName;

export function navigate(name: Destination, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params);
  }
}
