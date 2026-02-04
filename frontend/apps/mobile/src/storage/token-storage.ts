import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ITokenStorage } from '@inspection/shared';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Check if SecureStore is available (not available on web)
const isSecureStoreAvailable = Platform.OS !== 'web';

export class MobileTokenStorage implements ITokenStorage {
  async getAccessToken(): Promise<string | null> {
    try {
      if (isSecureStoreAvailable) {
        return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      }
      // Fallback to localStorage for web
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  async setAccessToken(token: string): Promise<void> {
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    } else {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
    }
  }

  async getRefreshToken(): Promise<string | null> {
    try {
      if (isSecureStoreAvailable) {
        return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      }
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  async setRefreshToken(token: string): Promise<void> {
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    }
  }

  async clear(): Promise<void> {
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }
}

export const tokenStorage = new MobileTokenStorage();
