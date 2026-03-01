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

## Change Log (AUTO-UPDATE THIS)
<!-- Claude: After EVERY change you make, add an entry here. NEVER skip this. -->

| Date | What Changed | Status |
| 2026-03-01 | Feature 3: Low-stock email — new send_low_stock_alert() in email_service.py; hooked into stock_alert_service.send_stock_alerts() after in-app notifications; reads STORE_EMAILS env var | ✅ Done |
| 2026-03-01 | Feature 5: PM Template materials UI — already existed in PMTemplatesPage.tsx (Materials tab with selector + quantity + add/remove) | ✅ Confirmed |
| 2026-03-01 | Feature 6: Store email on publish — new send_store_materials_notification() in email_service.py; work_plans.py publish endpoint aggregates materials across all jobs + sends to STORE_EMAILS | ✅ Done |
| 2026-03-01 | Feature 2: Consumption history — migration e1f2a3b4c5d6 (material_consumption_history table); 4 new endpoints (GET history, GET all aggregated, POST import, GET template); materialsApi 4 new methods; MaterialsPage Analytics tab: period selector (Monthly/Quarterly/Yearly) + recharts BarChart + Import Historical Data modal + Template button | ✅ Done |
| 2026-03-01 | Work Planning bar restructure: (1) removed /admin/work-planning path text from Bar 1 + added flexShrink:0 to left side (fixes horizontal wrap); (2) moved Status badge, ViewToggle, AI switch+btn, Conflicts from Bar 1 → Bar 2 right side (marginLeft:auto group); (3) removed hrs total stat + divider from Bar 3 Health Strip | ✅ Done |
| 2026-03-01 | Work Planning responsive layout: (1) minWidth:1024 + overflowX:auto wrapper stops all crushing; (2) collapsible right panel toggle (RightOutlined/LeftOutlined button, rightPanelVisible state); (3) CSS @media queries — ViewToggle icons-only at 1440px, Auto-Schedule label + contextual text hidden at 1280px; (4) toolbar right section flexShrink:1 + minWidth:0 + overflow:hidden; (5) collapsed day header overflow:hidden clips vertical text | ✅ Done |
| 2026-03-01 | Materials: Added "Download Import Template" button to MaterialsPage import modal — uses existing materialsApi.getTemplateUrl() (no backend change needed) | ✅ Done |
| 2026-03-01 | Work Planning: Replaced read-only materials card in job details modal with full CRUD UI — material selector + quantity + Add button; kit selector dropdown (auto-expands); stock indicator (✅/⚠️/❌ vs needed qty); Remove button with Popconfirm; only editable in draft status. Reuses existing workPlansApi.addMaterial/removeMaterial | ✅ Done |
\n| 2026-02-28 | Fix "Delete All Unassigned" on Inspection Assignments page: replaced N+1 loop (N×3 queries) with 6 batch queries; added DB index on `inspection_assignments.status`; changed frontend `invalidateQueries` → `refetchQueries` for reliable immediate reload | ✅ Done |
| 2026-02-28 | Work Planning drag-to-pool: expunge job from ORM session + pure raw SQL DELETE for job_checklist_responses/work_plan_assignments/work_plan_materials/work_plan_jobs — bypasses all lazy-loading; migrations added for lag_minutes (job_dependencies) + all missing columns in job_checklist_responses (IF NOT EXISTS) | ✅ Done |
| 2026-02-28 | Delete All Unassigned: fixed FK violation by NULLing work_plan_jobs.inspection_assignment_id before bulk delete | ✅ Done |
| 2026-02-28 | Work Planning: at-risk drawer now shows correct equipment name (extracted from "inspection: {name}" description pattern when nested equipment is null) + clean description ("Inspection" instead of "inspection: tt060"); drag-to-pool fixed by replacing closestCenter collision with pointerWithin-first detector (customCollision useCallback) | ✅ Done |
| 2026-02-28 | Work Planning: employee-to-job assignment fixed — SimpleJobRow now has useDroppable (id: droppable-job-{id}) merged with useDraggable ref; customCollision prioritizes droppable-job-* hits over day columns so dropping an employee on a job card fires Case 3 and opens the Lead/Member modal | ✅ Done |
| 2026-02-28 | Work Planning: (1) assignment indicator on job cards — avatar chips (initials, gold=lead/blue=member, +N overflow, tooltip with full name) appear on SimpleJobRow when users are assigned; (2) workload badge on DraggableTeamMember — green/orange/red count badge with per-day tooltip (userAssignmentMap useMemo); (3) at-risk drawer is now a drop zone — drag any scheduled job onto it to unschedule; customCollision priority: pool → at-risk → job-droppable → day | ✅ Done |
| 2026-02-28 | Work Planning: drag-target highlight for employee→job assignment — wired isEmployeeOver (already computed in useDroppable) into SimpleJobRow background+border (purple tint #f9f0ff / #722ed1) + "↓ Assign here" label appears while hovering; disappears on pointer-leave | ✅ Done |
| 2026-02-27 | Offline photo & voice upload fix: photos copied to permanent storage + queued in new QueuedInspectionMedia queue; voice recordings saved locally so never lost; auto-upload on reconnect; amber badges/text instead of error alerts | ✅ Done |
| 2026-02-28 | Per-question equipment type filter for checklists: new `checklist_item_equipment_types` junction table + migration; `ChecklistItemEquipmentType` model; server-side filter in by-assignment API + start_inspection service; admin CRUD API accepts `applicable_equipment_types`; Excel import + download template updated with Equipment Types column; web admin ChecklistsPage gets Equipment Type Filter tags select in Add/Edit modals + Type Filter column in items table; shared TS types updated | ✅ Done |
| 2026-02-25 | Overnight autonomous production review (10 phases): fixed 10 mobile TS errors (Reanimated SharedValue, expo-notifications API, FileSystem EncodingType, textShadow CSS, ChannelType, testID prop), 1 failing backend test (urgent→stop verdict), flaky Playwright auth, favicon 404, React Router future flags, push token security leak; wrapped 48 web + 116 mobile console.logs under DEV guards; created 4 GitHub Actions CI/CD workflows; DEPLOYMENT_CHECKLIST.md; PRODUCTION_READY_REPORT.html (78/100 score) | ✅ Done |
| 2026-02-25 | Phase 3 mobile audit: redacted Expo push token value from console.log in AuthProvider.tsx line 60 (was logging raw token string — now logs token length only); documented expo-av unmaintained (15 files, migration to expo-audio/expo-video planned); metro watchFolders override confirmed intentional monorepo trade-off; minor version mismatches on netinfo (11.5.2) + react-native-svg (15.15.3) non-breaking; 0 TS errors confirmed post-fix | ✅ Done |
| 2026-02-25 | Work Planning: auto-add inspection jobs to work plan when generate_list is called (with auto-assign if inspectors set); auto-add related open defects when PM/defect job scheduled; equipment count grouped display "3×RS" chips with hover popover (5 units + see all); at-risk badge moved to health strip near hrs total; at-risk drawer (drag-to-day); compact pool cards; 20-min default inspection time; CSS fix for right panel tab scrolling | ✅ Done |
| 2026-02-25 | Work Planning fixes: at-risk moved to health strip (near hrs total) + right-side drawer; day column splits inspection→grouped 3×RS chips, PM/defect→individual SimpleJobRow with eq-name+desc; auto-defect on SAP schedule endpoint; CSS fix for right panel tab switching (tabpane-hidden override); right panel full-height via layout restructure to row; calendar bg white; IncompleteJobsWarning removed from above calendar; equipment name (not serial) in popover; at-risk drawer shows name+desc | ✅ |
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
| 2026-02-27 | Mobile persistence fixes: language → AsyncStorage (survives close+logout); inspection wizard draft backup in AsyncStorage; login email save/restore; nav state persistence (return to same screen); debug banner removed | ✅ Done |
| 2026-02-27 | TTS Read Aloud: new TTSProvider (expo-speech); 🔊 icon per inspection question; Read Aloud action in all SmartFAB contexts; Arabic ar-SA voice | ✅ Done |
| 2026-02-27 | SmartFAB drag bug fix: save start position in ref, compute from startPos+delta instead of currentPos+delta (FAB no longer flies off screen) | ✅ Done |
| 2026-02-26 | New EAS Android build (preview/APK): build 934e89de — picks up all latest mobile fixes (Wizard UX, Arabic RTL, push notifications, gemini-2.5-flash-lite) | ✅ Done |
| 2026-02-26 | Fix GitHub Actions Playwright CI: added `version: 10` to pnpm/action-setup@v4 step — was failing with "No pnpm version is specified" | ✅ Done |
| 2026-02-25 | Work Planning drag improvements: SimpleJobRow now draggable (move between days + drag back to pool to remove); pool shows red outline when hovered with a job; footer hint updated; description strips equipment name prefix in pool cards, day rows, at-risk drawer; user names in team pool/engineers strip +3px font + bold; backend remove_job resets SAP order to 'pending' so it reappears in pool; addJobMutation/scheduleSAPMutation onSuccess shows auto-added defect count; equipment_id extraction improved for defect pool items; atRiskJobs computes description with equipment name stripped | ✅ Done |

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
| Monitor Follow-Up scheduling | ✅ Done |
| Per-question equipment type filter | ✅ Done |
| Low-stock email alerts (STORE_EMAILS) | ✅ Done | send_low_stock_alert() in email_service.py; triggered by scheduler daily |
| Store email on work plan publish | ✅ Done | send_store_materials_notification() with aggregated materials table |
| PM Template materials config UI | ✅ Done | Materials tab in PMTemplatesPage.tsx already existed |
| Consumption history import + analytics | ✅ Done | New DB table + 4 endpoints + Analytics tab bar chart + import modal | checklist_item_equipment_types table; admin tags each question with sub-types; wizard only shows relevant questions per equipment | Full stack: DB + model + service + 9 API endpoints + 2 scheduler jobs + web page/form + mobile 2 screens + i18n |
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
| TTS Read Aloud (mobile) | ✅ Done | TTSProvider + 🔊 per wizard question + SmartFAB Read Aloud action + Arabic ar-SA voice |
| Language persistence (mobile) | ✅ Done | AsyncStorage replaces localStorage — Arabic survives close and logout |
| Inspection wizard draft backup | ✅ Done | Answers saved to AsyncStorage every change; loaded on reopen as fallback |
| Login email memory | ✅ Done | Last-used email saved to AsyncStorage, pre-filled on next login |
| Nav state persistence | ✅ Done | App returns to same screen after close and reopen |
| SmartFAB drag fix | ✅ Done | FAB no longer flies off screen when dragged |
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
