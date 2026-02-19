const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const rootModules = path.resolve(monorepoRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// 1. Watch shared workspace package + monorepo node_modules
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/shared'),
  rootModules,
];

// 2. Resolve modules: root first to prevent duplicates, then local
config.resolver.nodeModulesPaths = [
  rootModules,
  path.resolve(projectRoot, 'node_modules'),
];

// 3. Map workspace packages + force single React from root (19.1.0 via pnpm overrides)
const singletonPackages = {
  'react': path.resolve(rootModules, 'react'),
  'react-dom': path.resolve(rootModules, 'react-dom'),
  'react-native': path.resolve(rootModules, 'react-native'),
  'react-native-reanimated': path.resolve(rootModules, 'react-native-reanimated'),
};

config.resolver.extraNodeModules = {
  '@inspection/shared': path.resolve(monorepoRoot, 'packages/shared'),
  ...singletonPackages,
};

// 4. Force singleton resolution: intercept react/react-native imports to always
//    resolve from root node_modules, preventing "Invalid hook call" from duplicates
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force these packages to always resolve from the monorepo root
  if (singletonPackages[moduleName]) {
    return context.resolveRequest(
      { ...context, resolveRequest: undefined },
      moduleName,
      platform,
    );
  }
  // Fall back to default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 5. Exclude web app source files and nested react copies (e.g. @expo/cli canary)
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
config.resolver.blockList = exclusionList([
  // Exclude web app
  new RegExp(
    path.resolve(monorepoRoot, 'apps/web').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*',
  ),
  // Block any nested react copies (e.g. @expo/cli/static/canary-full/node_modules/react)
  /.*[/\\]node_modules[/\\].*[/\\]node_modules[/\\]react[/\\].*/,
]);

module.exports = config;
