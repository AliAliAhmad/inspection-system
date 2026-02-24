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
| 2026-02-24 | Work Planning v6 layout: flat berth bar + plan score pill + smart inline tags; engineers-only horizontal strip (draggable); 7 flex day columns with in-place expand/collapse (flex 3.5/42px/1); right panel redesigned as Tabs (Jobs Pool + Team Pool with Mech/Elec filter); removed old bottom team pool; DroppableDay updated to accept containerStyle | ✅ |
| 2026-02-24 | Applied responsive scaling (scale/vscale/mscale/fontScale) to ProfileScreen.tsx and AllInspectionsScreen.tsx StyleSheet values | ✅ Done |
| 2026-02-24 | Applied responsive scaling (scale/vscale/mscale/fontScale) to DefectsScreen.tsx and AdminMoreScreen.tsx StyleSheet values | ✅ Done |
| 2026-02-24 | Inspection Wizard UX optimization — hid LiveAlertBanner during inspection, removed progress dots, slimmed header with count badge, assembly bar→chip, question text 22px hero, urgency→compact segmented control, collapsible media icon row, red warnings→subtle hint pills, nav bar minimized (40px buttons) | ✅ Done |
| 2026-02-24 | Inspection Wizard font bump (+2-3pt) + Arabic/RTL fix — all text +2-3 points, added 17 missing i18n keys (ar+en), full RTL support (row-reverse headers/nav/chips, right-aligned question text, flipped chevrons, RTL hint boxes with right border, writingDirection on inputs) | ✅ Done |
| 2026-02-24 | Fixed "Couldn't get navigation state" crash — replaced `useNavigationState` hook (fails outside navigator) with `navigationRef.addListener('state')` + `getCurrentRoute()` in BannerWithRouteCheck; removed unnecessary SafeBannerWrapper error boundary | ✅ Done |
| 2026-02-24 | Media icon yellow highlight for mandatory items — 📷 yellow bg when reading/RNR/TWL or fail answer, 🎥 yellow when fail + no photo (alternative), 🎙️ yellow when fail; yellow dot badge replaces green ✓ until captured; clears once media provided | ✅ Done |
| 2026-02-24 | Playwright E2E web test suite — 14 spec files, 92 tests, 0 failures, 0 flaky | ✅ Done |
| 2026-02-24 | Fixed LIFO mock ordering across all mock-based specs (catch-all first, mockLoginAs last) | ✅ Done |
| 2026-02-24 | Fixed truthy empty array crash: `data: null` in reports/arabic/crud mocks ([] bypasses null checks) | ✅ Done |
| 2026-02-24 | Fixed flaky logout test: wait for Ant Design dropdown item visibility before click | ✅ Done |

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
| Offline mutation queue | ✅ Done | Queue + auto-sync + badge + i18n (en/ar) |
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
| Assessment verdict comparison | ✅ Done | Comparison card with match/mismatch indicators, system verdict fallback |
| Inspection detail screen | ✅ Done | Full read-only view with photos, video, voice, AI analysis, urgency badges |
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
| Chat voice recording | ✅ Done | Mic button records, transcribes (EN/AR), uploads, sends voice message |
| Chat voice playback | ✅ Done | Tap voice message to play/stop, transcription shown below waveform |
| Chat DM user selection | ✅ Done | People button + search to find any user and start DM conversation |
| Work plan inspection sync | ✅ Done | Inspections auto-added to work plan when assigned to inspectors |
| Shift Handover system | ✅ Done | Backend model + API, mobile create screen + dashboard widget |
| Dashboard widgets (mobile) | ✅ Done | Assignment summary, quick actions, weekly trend, shift handover card |
| Urgency indicator per question | ✅ Done | 4 levels (OK/Monitor/Attention/Critical), auto-predict assessment from scores |
| Clickable answer cells + detail modal | ✅ Done | Tap any cell in answer bar → bottom sheet with question, answer, urgency, comment, photo |
| Assessment badge near equipment | ✅ Done | Colored badge (Pass/Urgent/Monitor) next to equipment name on MyAssignments cards |
| Monitor Follow-Up scheduling | ✅ Done | Full stack: DB + model + service + 9 API endpoints + 2 scheduler jobs + web page/form + mobile 2 screens + i18n |
| Multi-layer assessment system | ✅ Done | 4-layer flow (System→Inspector→Engineer→Admin), 3 verdicts (operational/monitor/stop), auto-escalation, notifications |
| System auto-assessment | ✅ Done | Calculates verdict from urgency scores (weights 0,1,3,5), pre-selects on assessment screen |
| Engineer review escalation | ✅ Done | Auto-escalates on disagreement, engineer can finalize or escalate to admin |
| Assessment verdict trail | ✅ Done | Visual trail showing System→Mech→Elec→Engineer→Admin verdicts on both mobile + web |
| Assessment tracking page (web) | ✅ Done | Kanban pipeline (Inspector→Engineer→Admin→Finalized), list view table, 5 stat cards |
| Quick Field Report (mobile) | ✅ Done | Equipment issue + safety hazard, camera/voice, severity chips, hazard type chips, equipment autocomplete |
| Start Next Inspection card | ✅ Done | Dashboard card for inspector/specialist — queries next assigned task, navigates to InspectionChecklist |
| Quick Report FAB action | ✅ Done | Added to all 4 SmartFAB contexts (dashboard, job_list, inspection, default) |
| Quick Voice Message (FAB) | ✅ Done | Select channel + record + send voice message from any screen via SmartFAB, all contexts |
| Unplanned Job logging (mobile) | ✅ Done | Assist team / requested job, equipment name, description, work done, requested by, voice note, bilingual i18n |
| Context-aware SmartFAB | ✅ Done | 9 contexts, Quick Report everywhere, role-based actions, drag-to-reposition, long-press settings |
| Shift Handover voice notes | ✅ Done | VoiceNoteRecorder with transcription added to CreateHandoverScreen |
| Create Channel screen | ✅ Done | Admin/engineer create Group/Announcement/Shift channels with member selection |
| Unplanned Job backend API | ✅ Done | POST/GET/GET-by-id, model, migration, notifications to admin/engineer |
| Voice recording for verdict reason | ✅ Done | VoiceNoteRecorder replaces VoiceTextInput for monitor/stop reasons, voice URL stored in backend |
| 2nd inspector media prefill | ✅ Done | Colleague answers now prefill photo/video/voice/AI analysis + batch-save to server |
| Expo push notifications | ✅ Done | Token registration on login/launch, Expo Push API via notification_service, foreground handler, logout cleanup |
| In-app notification toast alerts (mobile) | ✅ Done | NotificationAlertProvider + NotificationToast + vibration sounds, mirrors web useNotificationAlerts hook |
| Notification preferences screen (mobile) | ✅ Done | Channels (In-App/Push) by group, DND quiet hours + day picker, digest mode radio, reset to defaults, full RTL/i18n |
| Maestro E2E test suite (mobile) | ✅ Done | 44 flows across 5 roles (Inspector/Admin/Engineer/Specialist/Test), ALL PASS — testIDs on all 71 screens, role-specific flows, i18n-aware text assertions, scroll-reset pattern for quick links |
| Playwright E2E test suite (web) | ✅ Done | 126 tests across 17 spec files — auth, navigation, CRUD, roles, Arabic/RTL, forms, uploads, mobile viewport, reports, quality-engineer, inspection-submit, error-handling/crash-regression. ALL PASS (0 failed, 0 flaky). Runs against https://inspection-web.onrender.com |
| Work Planning v6 layout (web) | ✅ Done | Flat berth bar + plan score + smart pills; engineers horizontal strip; 7 flex day columns with in-place expand/collapse; right panel tabs (Jobs Pool + Team Pool with Mech/Elec filter) |
| Inspection Wizard UX optimization | ✅ Done | Question-first layout, no banner/dots, collapsible media, segmented urgency, hint pills, minimized nav |

## Auto-Memory Rules
- After EVERY code change, update the Change Log above
- After EVERY new feature, update the Feature Tracker above
- After fixing a bug, log it in the Change Log
- NEVER skip logging — this is your long-term memory
- If you discover a new issue, add it to "What Needs Work" section
- If you fix an issue, move it to "What's Working" section
- Keep this file always up to date — it IS your memory

## History
Full change log and feature tracker is in HISTORY.md — read it when you need past context about what was built, fixed, or changed.
