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
- New EAS build needed to pick up latest mobile fixes

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
| 2026-02-15 | Work Planning: rewrite layout — compact toolbar, inline team pool, always-visible jobs panel, at-risk badge | ✅ Done |
| 2026-02-15 | Replaced icon sidebar with App Launcher (waffle menu popup) in MainLayout | ✅ Done |
| 2026-02-15 | Rewrote DashboardPage: gradient KPI cards, work plan tabs, alerts, quick actions | ✅ Done |
| 2026-02-15 | Redesigned WorkPlanningPage: jobs pool right, team pool below, at-risk toolbar badge | ✅ Done |
| 2026-02-15 | Updated index.css: launcher, dashboard, team pool, at-risk styles | ✅ Done |
| 2026-02-16 | Fixed Gemini 1.5-flash 404: changed API URL from v1beta to v1 | ✅ Done |
| 2026-02-16 | Fixed HuggingFace 410 Gone: switched whisper-large-v3 to distil-whisper/distil-large-v3 | ✅ Done |
| 2026-02-16 | Updated OpenRouter: added 6 free vision models (Llama 4 Scout, Qwen 2.5 VL, Gemma 3, Mistral) | ✅ Done |
| 2026-02-16 | Created SambaNova service: free vision (Llama-4-Maverick) + voice (Whisper-Large-v3) | ✅ Done |
| 2026-02-16 | Fixed Together AI: corrected API URL (api.together.xyz), updated to Llama-4-Maverick + Qwen3-VL models | ✅ Done |
| 2026-02-16 | Removed Ollama from all fallback chains (local-only, not usable on Render) | ✅ Done |
| 2026-02-16 | Updated photo fallback chain: Gemini→Groq→OpenRouter→HuggingFace→Together→SambaNova→DeepInfra→OpenAI | ✅ Done |
| 2026-02-16 | Updated voice fallback chain: Gemini→Groq→HuggingFace→Together→SambaNova→OpenAI | ✅ Done |
| 2026-02-15 | Integrated orphaned mobile components: wired providers, dashboard, inspection, chat, profile, navigation | ✅ Done |
| 2026-02-15 | Added AccessibilityProvider + AIPhotoAnalysisProvider to App.tsx | ✅ Done |
| 2026-02-15 | DashboardScreen: added KPIAlerts, StreakIndicator, themed UI, communication link | ✅ Done |
| 2026-02-15 | InspectionWizardScreen: integrated QuickFill templates, QuickNotes, PreviousAnswersPanel | ✅ Done |
| 2026-02-15 | ChatRoomScreen: integrated MessageReactions, TranslatedMessage, MediaAttachment | ✅ Done |
| 2026-02-15 | ProfileScreen: added accessibility settings (high contrast, bold text, reduce motion, text scale) | ✅ Done |
| 2026-02-15 | MainTabNavigator: added Chat tab for all roles (Inspector, Specialist, Engineer, QE, Admin) | ✅ Done |
| 2026-02-16 | Fixed 13 duplicate index definitions across 9 model files (crashed SQLite test DB) | ✅ Done |
| 2026-02-16 | Fixed all 18 failing tests: response keys, required fields, voice notes, API error handling | ✅ Done |
| 2026-02-16 | Added IntegrityError handling in checklists API for duplicate templates | ✅ Done |
| 2026-02-16 | All 121 backend tests passing (0 failures, 16 skipped remote tests) | ✅ Done |
| 2026-02-16 | Fixed 16 skipped tests: mocked Cloudinary for file upload, created local smoke tests, excluded remote-only tests via pytest marker | ✅ Done |
| 2026-02-16 | Added Live Ticker: web scrolling news bar (all pages except Work Planning) | ✅ Done |
| 2026-02-16 | Added mobile LiveAlertBanner: tablet full ticker + phone critical-only popup | ✅ Done |
| 2026-02-16 | Integrated ticker into MainLayout (web) and RootNavigator (mobile) | ✅ Done |
| 2026-02-16 | Built Job Show Up & Challenges: 3 models (ShowUpPhoto, ChallengeVoice, ReviewMark) + migration | ✅ Done |
| 2026-02-16 | Built Show Up API: photo upload, challenge voice with AR/EN transcription, star/point marks | ✅ Done |
| 2026-02-16 | Auto-notification on job start: "Take show-up photo + record challenges" (specialist + engineer) | ✅ Done |
| 2026-02-16 | Web JobShowUpSection: photo gallery, voice player with transcriptions, star/point buttons | ✅ Done |
| 2026-02-16 | Mobile JobShowUpSection: camera capture, voice recorder, audio playback, review marks | ✅ Done |
| 2026-02-16 | Integrated ShowUp into SpecialistJobDetail + EngineerJobDetail (web + mobile) | ✅ Done |
| 2026-02-16 | Fixed Arabic analysis: bilingual EN/AR prompts for all 6 vision providers (Gemini, Groq, OpenRouter, Together, SambaNova, HuggingFace) | ✅ Done |
| 2026-02-16 | Updated master photo analysis prompt with explicit bilingual JSON output + Arabic example | ✅ Done |
| 2026-02-16 | Fixed TranslationService.auto_translate: always returns both EN + AR, English fallback if translation fails | ✅ Done |
| 2026-02-16 | Removed video AI analysis entirely: backend endpoint, frontend API, state/UI, backend auto-analysis skip | ✅ Done |
| 2026-02-16 | Fixed mobile crash: removed useNavigationState from LiveAlertBanner (rendered outside navigator), added SafeBannerWrapper error boundary | ✅ Done |

## Feature Tracker (AUTO-UPDATE THIS)
<!-- Claude: When a feature is added, planned, or in progress, update this list. -->

| Feature | Status | Notes |
|---------|--------|-------|
| Photo upload | ✅ Done | Working |
| Photo analysis (English) | ✅ Done | Working |
| Photo analysis (Arabic) | ✅ Done | All 6 vision providers now request bilingual EN/AR output |
| UI modernization | ✅ Done | App Launcher + smart dashboard + tabbed stats |
| Work Planning layout | ✅ Done | Compact toolbar + inline team pool + always-visible jobs panel + at-risk badge |
| Mobile app | ✅ Done | React Native/Expo — 96+ components, now wired into screens |
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
| AI multi-provider fallback | ✅ Done | 8 providers for photo, 6 for voice, free-first ordering |
| SambaNova integration | ✅ Done | Free vision + voice (Llama-4-Maverick, Whisper-Large-v3) |
| OpenRouter free vision | ✅ Done | 6 free models (Llama 4 Scout, Qwen 2.5 VL, Gemma 3, Mistral) |
| Together AI integration | ✅ Done | Vision (Llama-4-Maverick, Qwen3-VL) + voice (Whisper) |
| Mobile component integration | ✅ Done | All orphaned components wired into screens |
| Chat tab in navigation | ✅ Done | All roles have Chat tab in bottom nav |
| Accessibility settings | ✅ Done | High contrast, bold text, reduce motion, text scaling |
| Chat reactions & translation | ✅ Done | MessageReactions, TranslatedMessage, MediaAttachment in ChatRoom |
| Inspection answer templates | ✅ Done | QuickFill integrated into InspectionWizard text answers |
| Quick Notes (inspection) | ✅ Done | Floating notes button during inspections |
| Previous answers panel | ✅ Done | Shows previous inspection answers during current inspection |
| Live Ticker (web/tablet) | ✅ Done | Scrolling news bar — all pages except Work Planning, dark/RTL, severity-coded |
| Critical Alert Banner (phone) | ✅ Done | Phone-only critical popup with auto-dismiss + rotation |
| Job Show Up Photo | ✅ Done | Auto-notification on start, photo upload to job details, web + mobile |
| Challenge Voice Notes | ✅ Done | Voice recording with Arabic + English transcription in job details |
| Job Review Marks (Star/Point) | ✅ Done | Admin/Engineer/Specialist Lead can star (show up) or point (challenge) any job |

## Auto-Memory Rules
- After EVERY code change, update the Change Log above
- After EVERY new feature, update the Feature Tracker above
- After fixing a bug, log it in the Change Log
- NEVER skip logging — this is your long-term memory
- If you discover a new issue, add it to "What Needs Work" section
- If you fix an issue, move it to "What's Working" section
- Keep this file always up to date — it IS your memory
