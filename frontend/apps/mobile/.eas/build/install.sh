#!/bin/bash
set -e

# Navigate to monorepo root and install all dependencies
cd ../..
npm install --legacy-peer-deps
