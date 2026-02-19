import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigation/navigationRef';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { LanguageProvider } from './providers/LanguageProvider';
import { OfflineProvider } from './providers/OfflineProvider';
import { VoiceCommandProvider } from './providers/VoiceCommandProvider';
import { ThemeProvider, useThemeContext } from './providers/ThemeProvider';
import { AccessibilityProvider } from './providers/AccessibilityProvider';
import { AIPhotoAnalysisProvider } from './providers/AIPhotoAnalysisProvider';
import { UrgentAlertProvider } from './providers/UrgentAlertProvider';
import { NotificationAlertProvider } from './providers/NotificationAlertProvider';
import OfflineBanner from './components/common/OfflineBanner';
import VoiceCommandOverlay from './components/VoiceCommandOverlay';
import BigButtonOverlay from './components/BigButtonOverlay';
import RootNavigator from './navigation/RootNavigator';
import LoginScreen from './screens/auth/LoginScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ActivityIndicator, View, StyleSheet, Text, TextInput, Platform } from 'react-native';
import { useTheme } from './hooks/useTheme';

// SafeAreaProvider crashes on web ("Cannot read properties of null (reading 'useContext')")
// Only import and use it on native platforms
let SafeAreaProvider: React.ComponentType<{ children: React.ReactNode }>;
if (Platform.OS !== 'web') {
  SafeAreaProvider = require('react-native-safe-area-context').SafeAreaProvider;
} else {
  SafeAreaProvider = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, { style: { flex: 1 } }, children);
}

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Global font defaults ────────────────────────────────────
if (!(Text as any).defaultProps) (Text as any).defaultProps = {};
(Text as any).defaultProps.allowFontScaling = true;
if (!(TextInput as any).defaultProps) (TextInput as any).defaultProps = {};
(TextInput as any).defaultProps.allowFontScaling = true;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function ThemedStatusBar() {
  const { isDark } = useThemeContext();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background || '#fff' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AccessibilityProvider>
            <OfflineProvider>
              <LanguageProvider>
                <NavigationContainer ref={navigationRef}>
                  <AuthProvider>
                    <NotificationAlertProvider>
                      <AIPhotoAnalysisProvider>
                        <UrgentAlertProvider>
                          <VoiceCommandProvider>
                            <ErrorBoundary>
                              <ThemedStatusBar />
                              <OfflineBanner />
                              <VoiceCommandOverlay />
                              <AppContent />
                              <BigButtonOverlay />
                            </ErrorBoundary>
                          </VoiceCommandProvider>
                        </UrgentAlertProvider>
                      </AIPhotoAnalysisProvider>
                    </NotificationAlertProvider>
                  </AuthProvider>
                </NavigationContainer>
              </LanguageProvider>
            </OfflineProvider>
          </AccessibilityProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
