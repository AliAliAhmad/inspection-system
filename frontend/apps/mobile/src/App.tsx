import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { LanguageProvider } from './providers/LanguageProvider';
import { OfflineProvider } from './providers/OfflineProvider';
import OfflineBanner from './components/common/OfflineBanner';
import RootNavigator from './navigation/RootNavigator';
import LoginScreen from './screens/auth/LoginScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1677ff" />
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
        <OfflineProvider>
          <LanguageProvider>
            <NavigationContainer>
              <AuthProvider>
                <ErrorBoundary>
                  <StatusBar style="auto" />
                  <OfflineBanner />
                  <AppContent />
                </ErrorBoundary>
              </AuthProvider>
            </NavigationContainer>
          </LanguageProvider>
        </OfflineProvider>
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
