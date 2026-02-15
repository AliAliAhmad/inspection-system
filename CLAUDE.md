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
| 2026-02-15 | Fixed FileSystem import in PhotoAnnotationScreen (both APIs) | ✅ Done |
| 2026-02-15 | Added GPS auto-location hook (useLocation) + LocationTag component | ✅ Done |
| 2026-02-15 | Added Push-to-Talk walkie-talkie component | ✅ Done |
| 2026-02-15 | Added Trending Alerts pattern detection component | ✅ Done |
| 2026-02-15 | Added Batch Approval Widget for review queue | ✅ Done |
| 2026-02-15 | Added Dashboard Widget (team status + system health) | ✅ Done |
| 2026-02-15 | Added Drag-Drop Job Assignment component | ✅ Done |
| 2026-02-15 | Added Team Location Map with distance + open-in-maps | ✅ Done |
| 2026-02-15 | Added Geofence Alert (red zone / restricted area warnings) | ✅ Done |
| 2026-02-15 | Added KPI Alerts with threshold monitoring | ✅ Done |
| 2026-02-15 | Added Morning Brief (daily AI summary) component | ✅ Done |
| 2026-02-15 | Created index files for chat/, quality/ component folders | ✅ Done |
| 2026-02-15 | Updated hooks/index.ts and shared/index.ts with all new exports | ✅ Done |
| 2026-02-15 | Built Running Hours backend: 3 models + full REST API + migration | ✅ Done |
| 2026-02-15 | Built Answer Templates backend: CRUD API + model registration | ✅ Done |
| 2026-02-15 | Built PreviousAnswersPanel mobile component (copy from previous) | ✅ Done |
| 2026-02-15 | Built RunningHoursScreen mobile screen (view/enter hours) | ✅ Done |
| 2026-02-15 | Wired RunningHoursScreen into RootNavigator | ✅ Done |
| 2026-02-15 | Exported previous-inspection API + types in shared package | ✅ Done |
| 2026-02-15 | Exported templates.types in shared package | ✅ Done |
| 2026-02-15 | Rewrote web layout: Hub Card Dashboard + minimal icon sidebar | ✅ Done |
| 2026-02-15 | Added tabbed work plan stats widget (Overview/Schedule/Team/Focus) | ✅ Done |
| 2026-02-15 | Fixed job_templates SQL error: added missing columns migration | ✅ Done |
| 2026-02-15 | Work Planning: combined Side Tab Toggle + Auto-Hide panel layout | ✅ Done |

## Feature Tracker (AUTO-UPDATE THIS)
<!-- Claude: When a feature is added, planned, or in progress, update this list. -->

| Feature | Status | Notes |
|---------|--------|-------|
| Photo upload | ✅ Done | Working |
| Photo analysis (English) | ✅ Done | Working |
| Photo analysis (Arabic) | 🔧 In Progress | Returns English only |
| UI modernization | ✅ Done | Hub cards + icon sidebar + tabbed stats |
| Work Planning layout | ✅ Done | Side Tab Toggle + Auto-Hide combo panel |
| Mobile app | ✅ Done | React Native/Expo — 96+ components |
| GPS auto-location tagging | ✅ Done | useLocation hook + LocationTag |
| Push-to-talk walkie-talkie | ✅ Done | Hold-to-record voice messaging |
| Team chat UI | ✅ Done | 3 screens + 5 chat components |
| Trending alerts | ✅ Done | Pattern detection for recurring failures |
| Batch approval widget | ✅ Done | Multi-select review queue |
| Dashboard widget | ✅ Done | Team status + system health |
| Drag-drop job assignment | ✅ Done | Select job → tap inspector |
| Team location map | ✅ Done | List view with distance + open-in-maps |
| Red zone / geofencing | ✅ Done | Zone alerts with modal warnings |
| KPI alerts & monitoring | ✅ Done | Threshold-based with visual indicators |
| Daily morning brief | ✅ Done | AI summary with priorities + recap |
| Running hours tracking | ✅ Done | Backend API + mobile screen + web UI |
| Answer templates | ✅ Done | Backend CRUD API + model |
| Previous inspection answers | ✅ Done | Copy from previous + panel component |

## Auto-Memory Rules
- After EVERY code change, update the Change Log above
- After EVERY new feature, update the Feature Tracker above
- After fixing a bug, log it in the Change Log
- NEVER skip logging — this is your long-term memory
- If you discover a new issue, add it to "What Needs Work" section
- If you fix an issue, move it to "What's Working" section
- Keep this file always up to date — it IS your memory
