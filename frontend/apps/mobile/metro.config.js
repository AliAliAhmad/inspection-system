const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch shared workspace package + monorepo node_modules (hoisted deps)
//    NOT the entire monorepo (avoids confusing Metro with web app + root package.json)
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/shared'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 2. Resolve modules: local first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Map workspace packages + force single React instance (v19 for RN 0.81)
config.resolver.extraNodeModules = {
  '@inspection/shared': path.resolve(monorepoRoot, 'packages/shared'),
  'react': path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
};

// 4. Block root react v18 — mobile needs v19 for react-native 0.81
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
config.resolver.blockList = exclusionList([
  // path.resolve strips trailing slash, so add [/\\] explicitly before .*
  new RegExp(path.resolve(monorepoRoot, 'node_modules/react').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*'),
  new RegExp(path.resolve(monorepoRoot, 'node_modules/react-dom').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*'),
  // Exclude web app source files (speeds up Metro, avoids conflicts)
  new RegExp(path.resolve(monorepoRoot, 'apps/web').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*'),
]);

module.exports = config;
