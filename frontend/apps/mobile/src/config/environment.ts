import Constants from 'expo-constants';

interface Environment {
  apiUrl: string;
  appName: string;
  isDev: boolean;
}

const ENV: Record<string, Environment> = {
  development: {
    apiUrl: 'https://inspection-api-o3hz.onrender.com',
    appName: 'Inspection System (Dev)',
    isDev: true,
  },
  preview: {
    apiUrl: 'https://inspection-api-o3hz.onrender.com',
    appName: 'Inspection System',
    isDev: false,
  },
  production: {
    apiUrl: 'https://inspection-api-o3hz.onrender.com',
    appName: 'Inspection System',
    isDev: false,
  },
};

function getEnvironment(): Environment {
  // Check EXPO_PUBLIC_ENV first (set in eas.json), then EAS channel, then default to development
  const env = process.env.EXPO_PUBLIC_ENV || Constants.expoConfig?.extra?.eas?.channel || 'development';
  return ENV[env] ?? ENV.development;
}

export const environment = getEnvironment();
