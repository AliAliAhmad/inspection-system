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
- Keep CLAUDE.md under 8KB. Move completed changelog entries to HISTORY.md.
- Full history in HISTORY.md (read when needed, not every time).
- NEVER commit or push to git without explicit user permission
- Always test locally first
- Support both Arabic (RTL) and English
- Use auto-fix loop: find → fix → verify → repeat
- Always explain what you're changing before doing it

## Current Issues / History
- Arabic analysis was returning English only — FIXED (bilingual prompts on all providers)
- WebSocket (flask-socketio) not installed — non-critical
- UI needs modernization and improvements

## What's Working
- Photo upload working
- Photo analysis working (English only)
- Database connected and healthy
- Deployed on Render (auto-deploy from main branch)
- AI fallback chains: 8 providers for photo, 6 for voice
- SambaNova + OpenRouter API keys configured on Render
- Together AI API key ready to add on Render

## What Needs Work
- ~~Arabic language support for AI analysis~~ ✅ Fixed
- Full QA testing needed (137 passing, 0 skipped, 15 remote-only deselected)
- Add TOGETHER_API_KEY on Render (key ready)
- Add GROQ_API_KEY on Render (biggest gap — free, 14,400 RPD audio)
- Google Gemini 429 quota: free tier limited to 5 RPM (known issue since Dec 2025)
- ~~New EAS build needed~~ ✅ Done — Build 934e89de (Android APK, preview profile)

## How to Run Locally
- Backend: `cd backend && flask run --debug`
- Frontend: `cd frontend && npm run dev`
- Local URL: http://localhost:5000 (API) / http://localhost:3000 (Web)

## Context for AI
- This is a bilingual inspection system for the Middle Eastern market
- Primary markets: Iraq, Lebanon, UAE, Saudi Arabia, Jordan
- Part of Tellham Group business
- Owner: Ali


## Change Log
See HISTORY.md for full changelog. Only keep last 3 entries here.

| 2026-03-11 | Fix: checklist item category edit not saving (backend missing category in update_item) | ✅ Done |
| 2026-03-11 | Perf: photo compression before upload — resize to 1920px + quality 0.65, switch from base64 JSON to multipart FormData; ~10x smaller files, 3-5x faster uploads | ✅ Done |
| 2026-03-12 | Fix: 10 offline mode bugs — ChecklistScreen offline photos, storage warning, failed upload fallback to queue, voice urgency preserved, timestamp conflict resolution, offline banner, queued badge cleanup, sync loop import fix, voice file size check | ✅ Done |


## Plugin Management
Core plugins are always enabled. For others, enable on demand then disable after:
- PR review: `/plugin enable code-review` → review → `/plugin disable code-review`
- Overnight run: `/plugin enable ralph-loop`
- Security audit: `/plugin enable security-guidance`
- New feature: `/plugin enable feature-dev`
- Build skills: `/plugin enable skill-creator`
Disable non-core plugins after use to keep performance fast.

## Mandatory Before Any Edit
- Before editing ANY file, ALWAYS run: git stash push -m "backup-before-edit" || true
- After completing the task successfully, drop the stash: git stash drop || true
- If something goes wrong, restore with: git stash pop
- NEVER skip the backup step. This is non-negotiable.
- Before deleting any function, component, route, or file — search the entire codebase for references first using grep/ripgrep. If ANY reference exists, DO NOT delete.
- NEVER remove code you didn't add in this session unless explicitly asked to remove THAT SPECIFIC code.
