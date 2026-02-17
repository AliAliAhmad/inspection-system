import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigation/navigationRef';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { LanguageProvider } from './providers/LanguageProvider';
import { OfflineProvider } from './providers/OfflineProvider';
import { VoiceCommandProvider } from './providers/VoiceCommandProvider';
import { ThemeProvider, useThemeContext } from './providers/ThemeProvider';
import { AccessibilityProvider } from './providers/AccessibilityProvider';
import { AIPhotoAnalysisProvider } from './providers/AIPhotoAnalysisProvider';
import OfflineBanner from './components/common/OfflineBanner';
import VoiceCommandOverlay from './components/VoiceCommandOverlay';
import BigButtonOverlay from './components/BigButtonOverlay';
import RootNavigator from './navigation/RootNavigator';
import LoginScreen from './screens/auth/LoginScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ActivityIndicator, View, StyleSheet, Text, TextInput } from 'react-native';
import { useTheme } from './hooks/useTheme';

// ─── Global font size boost (small text +3, large text +1) ──
const originalTextRender = (Text as any).render;
(Text as any).render = function (...args: any[]) {
  const origin = originalTextRender.call(this, ...args);
  const style = origin.props?.style;
  const flatStyle = StyleSheet.flatten(style) || {};
  const currentSize = flatStyle.fontSize || 14;
  const boost = currentSize <= 13 ? 3 : currentSize <= 16 ? 2 : 1;
  return React.cloneElement(origin, {
    style: [style, { fontSize: currentSize + boost }],
  });
};

const originalInputRender = (TextInput as any).render;
(TextInput as any).render = function (...args: any[]) {
  const origin = originalInputRender.call(this, ...args);
  const style = origin.props?.style;
  const flatStyle = StyleSheet.flatten(style) || {};
  const currentSize = flatStyle.fontSize || 14;
  const boost = currentSize <= 13 ? 3 : currentSize <= 16 ? 2 : 1;
  return React.cloneElement(origin, {
    style: [style, { fontSize: currentSize + boost }],
  });
};

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
      <View style={[styles.center, { backgroundColor: "red" }]}>
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
                    <AIPhotoAnalysisProvider>
                      <VoiceCommandProvider>
                        <ErrorBoundary>
                          <ThemedStatusBar />
                          <OfflineBanner />
                          <VoiceCommandOverlay />
                          <AppContent />
                          <BigButtonOverlay />
                        </ErrorBoundary>
                      </VoiceCommandProvider>
                    </AIPhotoAnalysisProvider>
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
