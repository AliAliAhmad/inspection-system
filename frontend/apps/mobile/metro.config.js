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

// 2. Resolve modules: local first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  rootModules,
];

// 3. Map workspace packages + force single React from root (19.1.0 via pnpm overrides)
config.resolver.extraNodeModules = {
  '@inspection/shared': path.resolve(monorepoRoot, 'packages/shared'),
  'react': path.resolve(rootModules, 'react'),
  'react-dom': path.resolve(rootModules, 'react-dom'),
  'react-native': path.resolve(rootModules, 'react-native'),
  'react-native-reanimated': path.resolve(rootModules, 'react-native-reanimated'),
};

// 4. Exclude web app source files
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
config.resolver.blockList = exclusionList([
  new RegExp(path.resolve(monorepoRoot, 'apps/web').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*'),
]);

module.exports = config;
