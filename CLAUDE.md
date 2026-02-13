# Inspection System

## Deployment

**Platform:** Render.com
**Auto-deploy:** From GitHub `main` branch

### Services

| Service | URL/Host | Description |
|---------|----------|-------------|
| inspection-api-o3hz | https://inspection-api-o3hz.onrender.com | Backend API (Flask) |
| inspection-web | https://inspection-web.onrender.com | Frontend Web (React) |
| dpg-d5uepavgi27c7395il90-a | PostgreSQL hostname | Database |

### Running Migrations
1. Go to Render Dashboard
2. Select the API service
3. Open Shell tab
4. Run: `flask db upgrade`

## Tech Stack
- **Backend:** Flask, SQLAlchemy, PostgreSQL
- **Frontend Web:** React, TypeScript, Ant Design
- **Frontend Mobile:** React Native, Expo
- **State:** React Query

## Key Rules
- NEVER commit or push to git without explicit user permission
- Always test locally first
- Support both Arabic (RTL) and English
- Use auto-fix loop: find → fix → verify → repeat
- Always explain what you're changing before doing it

## Current Issues / History
- Arabic analysis was returning English only — needs fixing
- WebSocket (flask-socketio) not installed — non-critical
- UI needs modernization and improvements

## What's Working
- Photo upload working
- Photo analysis working (English only)
- Database connected and healthy
- Deployed on Render (auto-deploy from main branch)

## What Needs Work
- Arabic language support for AI analysis
- UI/UX improvements
- Full QA testing needed
- Mobile app (React Native/Expo) needs testing

## How to Run Locally
- Backend: `cd backend && flask run --debug`
- Frontend: `cd frontend && npm run dev`
- Local URL: http://localhost:5000 (API) / http://localhost:3000 (Web)

## Context for AI
- This is a bilingual inspection system for the Middle Eastern market
- Primary markets: Iraq, Lebanon, UAE, Saudi Arabia, Jordan
- Part of Tellham Group business
- Owner: Ali

## Change Log (AUTO-UPDATE THIS)
<!-- Claude: After EVERY change you make, add an entry here. NEVER skip this. -->

| Date | What Changed | Status |
|------|-------------|--------|
| 2026-02-13 | Project setup | ✅ Done |

## Feature Tracker (AUTO-UPDATE THIS)
<!-- Claude: When a feature is added, planned, or in progress, update this list. -->

| Feature | Status | Notes |
|---------|--------|-------|
| Photo upload | ✅ Done | Working |
| Photo analysis (English) | ✅ Done | Working |
| Photo analysis (Arabic) | 🔧 In Progress | Returns English only |
| UI modernization | 📋 Planned | Needs full redesign |
| Mobile app | 📋 Planned | React Native/Expo |

## Auto-Memory Rules
- After EVERY code change, update the Change Log above
- After EVERY new feature, update the Feature Tracker above
- After fixing a bug, log it in the Change Log
- NEVER skip logging — this is your long-term memory
- If you discover a new issue, add it to "What Needs Work" section
- If you fix an issue, move it to "What's Working" section
- Keep this file always up to date — it IS your memory
