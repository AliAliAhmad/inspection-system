import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {
  useAuthState,
  AuthState,
  authApi,
  initApiClient,
  User,
} from '@inspection/shared';
import { tokenStorage } from '../storage/token-storage';
import { environment } from '../config/environment';

const API_BASE_URL = environment.apiUrl;

/**
 * Register for Expo push notifications and return the push token.
 * Returns null if the device doesn't support push or permission is denied.
 */
async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Push notifications only work on physical devices
    if (!Constants.isDevice) {
      console.log('Push notifications: skipping (not a physical device)');
      return null;
    }

    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notifications: permission denied');
      return null;
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });
    const token = tokenData.data;

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    console.log('Push notifications: registered token', token);
    return token;
  } catch (error) {
    console.warn('Push notifications: registration failed', error);
    return null;
  }
}

/**
 * Send the push token to the backend so it can send push notifications.
 */
async function sendPushTokenToBackend(token: string): Promise<void> {
  try {
    await authApi.registerPushToken(token);
    console.log('Push notifications: token sent to backend');
  } catch (error) {
    console.warn('Push notifications: failed to send token to backend', error);
  }
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, setUser, setLoading } = useAuthState();

  useEffect(() => {
    async function init() {
      initApiClient(API_BASE_URL, tokenStorage);

      const token = await tokenStorage.getAccessToken();
      if (token) {
        try {
          const res = await authApi.getProfile();
          setUser((res.data as any).user ?? (res.data as unknown as User));

          // Re-register push token on app launch (token may have changed)
          registerForPushNotifications().then((pushToken) => {
            if (pushToken) {
              sendPushTokenToBackend(pushToken);
            }
          });
        } catch {
          await tokenStorage.clear();
          setUser(null);
        }
      } else {
        setUser(null);
      }
    }
    init();
  }, [setUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      try {
        const res = await authApi.login({ email: username, password });
        const data = res.data;
        await tokenStorage.setAccessToken(data.access_token);
        await tokenStorage.setRefreshToken(data.refresh_token);
        setUser(data.user);

        // Register for push notifications after successful login (non-blocking)
        registerForPushNotifications().then((token) => {
          if (token) {
            sendPushTokenToBackend(token);
          }
        });
      } finally {
        setLoading(false);
      }
    },
    [setUser, setLoading],
  );

  const logout = useCallback(async () => {
    try {
      // Remove push token from backend before logging out
      await authApi.removePushToken().catch(() => {});
      await authApi.logout();
    } catch {
      // Ignore
    } finally {
      await tokenStorage.clear();
      setUser(null);
    }
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
