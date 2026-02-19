import Constants from 'expo-constants';

interface Environment {
  apiUrl: string;
  appName: string;
  isDev: boolean;
}

const ENV: Record<string, Environment> = {
  development: {
    // Use production API for dev testing (real data with hot reload)
    // Switch to 'http://10.0.2.2:5000' for local Flask testing
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
  // __DEV__ is true when running in Metro dev server
  if (__DEV__) {
    return ENV.development;
  }
  return ENV.production;
}

export const environment = getEnvironment();
