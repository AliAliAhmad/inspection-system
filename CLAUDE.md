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
| 2026-02-18 | Item 5a: Fixed voice recording never stops — added 120s safety timeout, try/catch around stopAndUnloadAsync, full state reset on error | ✅ Done |
| 2026-02-18 | Item 5b: Fixed photo/video upload — added I18nManager import, Android file:// URI prefix, better network error messages | ✅ Done |
| 2026-02-18 | Item 5c: Created UrgentAlertOverlay + UrgentAlertProvider — full-screen red pulsing alert with vibration for priority messages | ✅ Done |
| 2026-02-18 | Items 3-13 mobile fixes: Removed Previous Answer panel (Item 6), fixed toggle overflow (Item 7), smart submit navigation (Item 11), role-scoped work plan (Item 13) | ✅ Done |
| 2026-02-18 | Item 5a: Fixed voice recording never stops — safety timeout, robust stop, state reset on error | ✅ Done |
| 2026-02-18 | Item 5b: Fixed chat photo/video upload — I18nManager import, Android file URI, unique filenames | ✅ Done |
| 2026-02-18 | Item 5c: Created UrgentAlertOverlay + UrgentAlertProvider — full-screen red alert with vibration + sound for urgent messages | ✅ Done |
| 2026-02-18 | Item 5d + 12: Fixed ChannelListScreen members button — robust user fetch with fallback, role badges, shift labels, loading/empty states, clear search, mode bar | ✅ Done |
| 2026-02-18 | Fixed goToNext TS error in InspectionWizardScreen — replaced forward reference with direct goToIndex call in handleSkip | ✅ Done |
| 2026-02-13 | Project setup | ✅ Done |
| 2026-02-18 | Item 10: Voice recording for stop/monitor verdict reason — replaced VoiceTextInput with VoiceNoteRecorder, removed min-char validation, added voice URL support to backend/frontend | ✅ Done |
| 2026-02-18 | Item 8: 2nd inspector media prefill — colleague answers now include photo/video/voice/AI analysis, added batch-save effect for prefilled answers | ✅ Done |
| 2026-02-18 | Added missing i18n keys to en.json and ar.json — job_execution, profile, assessment, assignments, checklist, notifications sections | ✅ Done |
| 2026-02-18 | Simplified CreateHandoverScreen — replaced 3 complex sections (12+ fields) with unified type-tagged item list | ✅ Done |
| 2026-02-19 | Added notification bell icon with unread badge to mobile dashboard header — auto-refreshes every 30s, navigates to Notifications screen | ✅ Done |
| 2026-02-18 | Fixed LiveAlertBanner phone overlap — added SafeAreaView insets padding so banner sits below status bar | ✅ Done |
| 2026-02-18 | Fixed LiveAlertBanner Arabic detection — switched from I18nManager.isRTL to useTranslation i18n.language | ✅ Done |
| 2026-02-18 | Item 9: Fixed AssessmentScreen verdict display (equipment name, system verdict fallback, comparison card when both inspectors submit) | ✅ Done |
| 2026-02-18 | Item 3: Created InspectionDetailScreen — full read-only inspection details with photo/video/voice/AI analysis, registered route, added i18n keys (en/ar) | ✅ Done |
| 2026-02-18 | Created Unplanned Jobs API — model, POST/GET/GET-by-ID endpoints, engineer/admin notifications, registered blueprint | ✅ Done |
| 2026-02-18 | Created reusable MonitorFollowupForm component (web) for scheduling follow-up inspections with auto-fill inspectors | ✅ Done |
| 2026-02-16 | Fix React error #310 — moved useCallback before early return in LiveTicker.tsx | ✅ Done |
| 2026-02-15 | Fixed FileSystem import in PhotoAnnotationScreen (both APIs) | ✅ Done |
| 2026-02-17 | Created AssessmentTrackingScreen for mobile — pipeline overview with stats, filters, assessment cards | ✅ Done |
| 2026-02-17 | Created AssessmentTrackingPage (web) — kanban pipeline + list view with stats, verdicts, escalation tracking | ✅ Done |
| 2026-02-17 | Wired AssessmentTracking into mobile RootNavigator + DashboardScreen quick links (admin/engineer) | ✅ Done |
| 2026-02-17 | Added Assessment Tracking button to web DashboardPage quick actions for engineers/admins | ✅ Done |
| 2026-02-18 | Replaced all hardcoded strings in JobExecutionScreen, ProfileScreen, NotificationsScreen with i18n t() calls | ✅ Done |
| 2026-02-18 | Added job_execution.* i18n keys (en/ar) for pause reasons, incomplete reasons, buttons, alerts, modals | ✅ Done |
| 2026-02-18 | Added profile.* i18n keys (en/ar) for appearance, accessibility, quick links, theme modes, text scales | ✅ Done |
| 2026-02-18 | Replaced ~70 hardcoded strings in AssessmentScreen, MyAssignmentsScreen, InspectionChecklistScreen with i18n t() calls | ✅ Done |
| 2026-02-18 | Added assessment.*, assignments.*, checklist.* i18n keys (en/ar) for verdicts, roles, statuses, urgency, modal labels | ✅ Done |
| 2026-02-18 | Built offline mutation queue system — offline-mutations.ts, useOfflineMutations hook, OfflinePendingBadge, OfflineProvider integration, i18n keys | ✅ Done |
| 2026-02-18 | Added notifications.info/warning/urgent i18n keys (en/ar) for priority badge labels | ✅ Done |
| 2026-02-17 | Added i18n keys (en/ar) for assessment_tracking section + nav.assessmentTracking + launcher keys | ✅ Done |
| 2026-02-17 | Fixed MyAssignmentsScreen verdict types: urgent/stopped → monitor/stop (aligned with 3-verdict system) | ✅ Done |
| 2026-02-17 | Added colleague-answers API endpoint for pre-filling Inspector 2 answers from Inspector 1 | ✅ Done |
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
| 2026-02-18 | Created MonitorFollowupsScreen (mobile) — stats row, tab filters, follow-up cards, schedule navigation | ✅ Done |
| 2026-02-18 | Created MonitorFollowupScheduleScreen (mobile) — schedule form with type/location/shift selection, inspector pickers, auto-fill | ✅ Done |
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
| 2026-02-17 | Fixed chat mic: actual recording via expo-av + base64 upload to /api/voice/transcribe + send voice message with transcription | ✅ Done |
| 2026-02-17 | Voice messages now show playback (tap to play/stop) + EN/AR transcription text in message bubble | ✅ Done |
| 2026-02-17 | Added user search/selection for DM conversations in ChannelListScreen (People button + search) | ✅ Done |
| 2026-02-17 | Added back button to ChannelListScreen header | ✅ Done |
| 2026-02-17 | Auto-add inspections to work plan: assign_team() now creates WorkPlanJob entries automatically | ✅ Done |
| 2026-02-17 | WhatsApp-style chat mic: hold-to-record, release-to-send (onPressIn/onPressOut) | ✅ Done |
| 2026-02-17 | Fixed dashboard numbers: backend _normalize_dashboard() returns common keys (total_inspections, completion_rate, incomplete_rate, total_stars) for all roles | ✅ Done |
| 2026-02-17 | Added incomplete rate + total stars stat cards to mobile DashboardScreen | ✅ Done |
| 2026-02-17 | BigButtonOverlay: slowed spring animation (speed 50→20), added minimize/expand button | ✅ Done |
| 2026-02-17 | Fixed MyWorkPlanScreen infinite loop: memoized myJobs, moved timer to useRef-based pattern with empty dependency | ✅ Done |
| 2026-02-17 | Added photo/video support to ChatRoomScreen: camera + gallery picker (expo-image-picker), upload via filesApi, send as photo/video message | ✅ Done |
| 2026-02-17 | Fixed ChannelListScreen user search: prefetch all users, progressive name/role filtering, increased visible limit to 20 | ✅ Done |
| 2026-02-17 | Rewrote NewChannelScreen: suggested quick-create channels (Job Chat=all users, role-based=filtered), auto-populate member_ids, member count preview | ✅ Done |
| 2026-02-17 | Fixed toolkit API race condition: added `enabled: !!apiClient` guard to prevent "API client not initialized" error | ✅ Done |
| 2026-02-17 | Fixed chat media upload Network Error: removed explicit Content-Type header from filesApi (let axios set boundary automatically) | ✅ Done |
| 2026-02-17 | Fixed New Channel create button: improved error handling, bigger touch target, changed replace→navigate | ✅ Done |
| 2026-02-17 | Fixed My Assignments tab filtering: client-side status grouping (assigned/in_progress includes sub-statuses), constrained card/badge sizing | ✅ Done |
| 2026-02-17 | Fixed TWL/RNR detection: narrowed to exact phrases only ("RNR READING", "RUNNING HOURS READING", "TWL COUNT", "TWIST LOCK COUNT") | ✅ Done |
| 2026-02-17 | Inspection wizard submit page: shows "Go to Missing" button when incomplete items exist, Submit only when all complete | ✅ Done |
| 2026-02-17 | Added unanswered question filter toggle with count badge to InspectionChecklistScreen | ✅ Done |
| 2026-02-17 | Built Shift Handover backend: model + migration + REST API (create/latest/pending/acknowledge) | ✅ Done |
| 2026-02-17 | Built Shift Handover frontend types + API client in shared package | ✅ Done |
| 2026-02-17 | Rewrote mobile DashboardScreen: 4 widgets (Assignment Summary, Quick Actions, Weekly Trend, Shift Handover) | ✅ Done |
| 2026-02-17 | Created CreateHandoverScreen: form with shift type, notes, pending items, safety alerts, equipment issues | ✅ Done |
| 2026-02-17 | Added urgency_level column to InspectionAnswer model + migration + API support | ✅ Done |
| 2026-02-17 | Added urgency selector UI to InspectionWizard: 4 colored buttons (OK/Monitor/Attention/Critical) per question | ✅ Done |
| 2026-02-17 | Upgraded MyAssignments: clickable answer cells → detail bottom sheet modal, assessment badge near equipment name, urgency border indicators, risk score | ✅ Done |
| 2026-02-17 | Added predicted assessment scoring: urgency weights [0,1,3,5], thresholds at 5 (monitor) and 10 (urgent) | ✅ Done |
| 2026-02-17 | Increased all fontSize values in 5 mobile screens (Dashboard, MyAssignments, ChannelList, ChatRoom, Login) for better readability | ✅ Done |
| 2026-02-17 | Multi-layer assessment: migration (12 new columns), model (system auto-verdict, evaluate_multi_layer, evaluate_engineer_review), service (submit_engineer_verdict, notifications, escalation) | ✅ Done |
| 2026-02-17 | Assessment API: 4 new endpoints (engineer-verdict, engineer-pending, admin-pending, shared-answers), updated verdict for 3 options | ✅ Done |
| 2026-02-17 | Frontend types: Verdict = operational/monitor/stop, EscalationLevel type, 12 new FinalAssessment fields | ✅ Done |
| 2026-02-17 | Mobile AssessmentScreen: 3 verdict cards with emojis, system recommendation pre-selected, verdict trail, escalation banners, reason inputs | ✅ Done |
| 2026-02-17 | Web AssessmentPage: 3 verdict radio buttons, system recommendation alert, Steps verdict trail, escalation alerts | ✅ Done |
| 2026-02-17 | AdminApprovalsScreen: 3 verdict options (operational/monitor/stop), shows system + engineer verdicts, fixed payload fields | ✅ Done |
| 2026-02-17 | i18n: added 25+ assessment keys for monitor/stop/escalation/verdict in en.json + ar.json | ✅ Done |
| 2026-02-17 | Fixed logout bug: async logout not awaited in ProfileScreen Alert.alert callback | ✅ Done |
| 2026-02-17 | Fixed App.tsx loading screen: removed debug red background | ✅ Done |
| 2026-02-17 | All banners (12 total: 7 mobile + 5 web) updated: thicker padding, bigger font, bolder weight | ✅ Done |
| 2026-02-17 | Fixed 18 TypeScript errors across 11 files: TeamPerformanceDashboard, CommandPalette, RunningHoursCard, RunningHoursDashboard, AnomalyAlert type import, HealthTrendChart, SchedulesPage props, EngineerJobDetailPage, InspectionChecklistPage | ✅ Done |
| 2026-02-17 | Wired 3 unwired components: ServiceAlertBadge in MainLayout header, AnomalyBanner in SchedulesPage, ServiceAlertNotification in EquipmentDashboardPage | ✅ Done |
| 2026-02-17 | Pre-fill Inspector 2 answers: new backend endpoint GET /colleague-answers/<assignment_id>, API method, mobile pre-fill with source badges, web pre-fill with colleague info | ✅ Done |
| 2026-02-17 | Created monitor_followups API blueprint: 9 endpoints (list, detail, pending, schedule, available-inspectors, equipment-history, overdue, dashboard, cancel) | ✅ Done |
| 2026-02-17 | Created MonitorFollowupService: 10 methods — create_pending, schedule, inline_schedule, available_inspectors, daily assignment creation, overdue check, complete, history, cancel (admin-only), dashboard stats | ✅ Done |
| 2026-02-18 | Created MonitorFollowupsPage (web): dashboard stats, 5 status tabs, schedule modal with auto-fill inspectors | ✅ Done |
| 2026-02-18 | Created MonitorFollowupForm (web): reusable inline form with date picker, type/location/shift, auto-fill inspectors | ✅ Done |
| 2026-02-18 | Created MonitorFollowupsScreen + MonitorFollowupScheduleScreen (mobile) | ✅ Done |
| 2026-02-18 | Monitor Follow-Up full stack: migration, model, service (807 lines), API (9 endpoints), scheduler (2 jobs), assessment hooks, types, i18n (en+ar), web page + form, mobile 2 screens, router + navigator + launcher | ✅ Done |
| 2026-02-18 | Added "Start Next Inspection" card to DashboardScreen (inspector/specialist only) — queries next assigned task, shows equipment name, navigates to InspectionChecklist | ✅ Done |
| 2026-02-18 | Added "Quick Report" action to SmartFAB in all 4 contexts (dashboard, job_list, inspection, default) — navigates to QuickFieldReport | ✅ Done |
| 2026-02-18 | Registered QuickFieldReport screen in RootNavigator (import, param type, Stack.Screen) | ✅ Done |
| 2026-02-18 | Added dashboard i18n keys (en/ar): start_next, next_inspection, all_caught_up, tap_to_start | ✅ Done |
| 2026-02-18 | Created QuickFieldReportScreen (mobile): fast field reporting for equipment issues + safety hazards with camera, voice, severity/hazard chips, equipment search, i18n (en+ar), wired into RootNavigator | ✅ Done |
| 2026-02-18 | Created QuickVoiceMessageScreen (mobile): select channel + record voice + upload + send voice message to team chat from any screen | ✅ Done |
| 2026-02-18 | Added "Voice Message" action to SmartFAB in all contexts (dashboard, job_list, inspection, chat, default) — navigates to QuickVoiceMessage | ✅ Done |
| 2026-02-18 | Registered QuickVoiceMessage screen in RootNavigator (import, param type, Stack.Screen) | ✅ Done |
| 2026-02-18 | Added voice_message i18n keys (en/ar): title, select_channel, record, send, sending, sent, no_channels | ✅ Done |
| 2026-02-18 | Fixed DefectsScreen role guard: inspectors/specialists see "View" button (navigates to DefectDetail), only admin/engineer see "Assign" button | ✅ Done |
| 2026-02-18 | Created quick-report backend: migration (inspection_id nullable + 7 new columns), POST /api/quick-reports endpoint, notifications to all users (urgent for admin/engineer) | ✅ Done |
| 2026-02-18 | Wired QuickFieldReportScreen to real defectsApi.createQuickReport — photo upload via filesApi, voice note, equipment/safety type, severity → real defect with full workflow | ✅ Done |
| 2026-02-18 | Updated Defect model: new fields (reported_by_id, report_source, voice_note_url, photo_url, location_description, hazard_type, equipment_id_direct), updated to_dict with equipment from direct or inspection | ✅ Done |
| 2026-02-18 | Created UnplannedJobScreen (mobile): log unplanned work (assist team / requested job), equipment name, description, work done, requested by, voice note, POST /api/unplanned-jobs | ✅ Done |
| 2026-02-18 | Added VoiceNoteRecorder to CreateHandoverScreen: shift handover now supports voice recording + transcription alongside text comments | ✅ Done |
| 2026-02-18 | Rewrote useFABContext: 9 contexts (dashboard, my_assignments, job_list, job_execution, inspection, work_plan, chat_list, chat_room, default), Quick Report in ALL contexts, role-based channel creation | ✅ Done |
| 2026-02-18 | Created CreateChannelScreen (mobile): admin/engineer only, 3 channel types (Group/Announcement/Shift), member selection, registered in navigator | ✅ Done |
| 2026-02-18 | Created UnplannedJob backend: model + API (POST/GET/GET-by-id) + migration + blueprint registration + engineer/admin notifications | ✅ Done |
| 2026-02-18 | Updated SmartFAB to pass userRole to useFABContext for role-based FAB actions | ✅ Done |
| 2026-02-19 | Expo push notifications: User model expo_push_token, POST/DELETE /api/auth/push-token endpoints, notification_service sends Expo pushes (threaded), migration, mobile AuthProvider registers + sends token, App.tsx foreground handler, shared API methods | ✅ Done |

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

## Auto-Memory Rules
- After EVERY code change, update the Change Log above
- After EVERY new feature, update the Feature Tracker above
- After fixing a bug, log it in the Change Log
- NEVER skip logging — this is your long-term memory
- If you discover a new issue, add it to "What Needs Work" section
- If you fix an issue, move it to "What's Working" section
- Keep this file always up to date — it IS your memory
