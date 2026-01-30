import Constants from 'expo-constants';

interface Environment {
  apiUrl: string;
  appName: string;
  isDev: boolean;
}

const ENV: Record<string, Environment> = {
  development: {
    apiUrl: 'http://localhost:5000',
    appName: 'Inspection System (Dev)',
    isDev: true,
  },
  preview: {
    apiUrl: 'https://staging-api.inspection-system.com',
    appName: 'Inspection System (Staging)',
    isDev: false,
  },
  production: {
    apiUrl: 'https://api.inspection-system.com',
    appName: 'Inspection System',
    isDev: false,
  },
};

function getEnvironment(): Environment {
  const channel = Constants.expoConfig?.extra?.eas?.channel ?? 'development';
  return ENV[channel] ?? ENV.development;
}

export const environment = getEnvironment();
