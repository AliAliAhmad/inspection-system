import Constants from 'expo-constants';

interface Environment {
  apiUrl: string;
  appName: string;
  isDev: boolean;
}

const ENV: Record<string, Environment> = {
  development: {
    // Use local server for development (change IP if needed)
    apiUrl: 'http://192.168.1.13:5001',
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
  // Use production Render server
  return ENV.production;
}

export const environment = getEnvironment();
