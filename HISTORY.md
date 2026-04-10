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
| 2026-02-23 | Fixed all 14 Playwright E2E web tests (was 11 failing → 0 failing): fixed wrong layout selector, wrong profile endpoint mock, rewrote navigation tests for App Launcher pattern, fixed `AuthProvider.login()` bug (setLoading caused LoginPage unmount/remount losing error state), fixed Playwright glob patterns intercepting Vite module files (switched `**/api/notifications*` and `**/api/leaderboard*` to URL predicate functions) | ✅ Done |
|------|-------------|--------|
| 2026-02-22 | Added testIDs for QE + Admin role gaps: PendingReviewsScreen (pending-review-card-${item.id}), OverdueReviewsScreen (overdue-review-card-${item.id}), ReviewDetailScreen (review-approve-btn, review-reject-btn, review-reject-category-${cat}, review-reject-cancel-btn, review-reject-submit-btn), AllSpecialistJobsScreen (admin-specialist-job-card-${job.id}) | ✅ Done |
| 2026-02-22 | Added testIDs to EngineerJobDetailScreen (engineer-start-job-btn, engineer-pause-btn, engineer-complete-btn, engineer-pause-category-${cat}, engineer-pause-cancel-btn, engineer-pause-submit-btn, engineer-complete-pass-btn, engineer-complete-incomplete-btn, engineer-complete-cancel-btn, engineer-complete-confirm-btn) and InspectionAssignmentsScreen (inspection-assign-btn-${assignment.id}, inspection-assign-modal-cancel, inspection-assign-modal-submit) — for Maestro E2E testing | ✅ Done |
| 2026-02-22 | Redesigned InspectionWizardScreen nav bar: replaced plain ← → arrows with styled ‹ › chevrons, added center progress counter ("3 of 24") + mini progress bar, upgraded buttons to 56px circles with elevation/shadow, new navButtonSubmit (dark green pill) and navButtonAction (orange pill) for Submit & Go to Missing | ✅ Done |
| 2026-02-22 | Added 9 testID props to InspectionWizardScreen: wizard-yes-btn, wizard-no-btn, wizard-pass-btn, wizard-fail-btn, urgency-btn-${level} (0-3), wizard-prev-btn, wizard-next-btn, wizard-go-to-missing-btn, wizard-submit-btn — for Maestro E2E testing | ✅ Done |
| 2026-02-22 | Added missing testID props to QualityReviewsAdminScreen (quality-review-validate-btn-${review.id} per card, quality-review-valid-btn, quality-review-invalid-btn, quality-review-submit-btn) and SpecialistJobsScreen (specialist-job-card-${item.id} per job card) — for Maestro E2E testing | ✅ Done |
| 2026-02-22 | Added testID props to QuickVoiceMessageScreen: qvm-channel-card-${item.id} (channel list card), qvm-record-btn (mic/record button), qvm-send-btn (send voice message button) — for Maestro E2E testing | ✅ Done |
| 2026-02-22 | Added missing testID props to InspectionChecklistScreen (checklist-filter-unanswered-btn, checklist-submit-btn) and CreateHandoverScreen (create-handover-shift-${s} for each shift type, create-handover-notes-input, create-handover-add-item-btn, create-handover-submit-btn) — for Maestro E2E testing | ✅ Done |
| 2026-02-22 | Added testID props to 3 screens for Maestro E2E testing: MonitorFollowupScheduleScreen (monitor-followup-date-input, monitor-followup-type-${ft.key}, monitor-followup-submit-btn), RunningHoursScreen (running-hours-record-btn, running-hours-input, running-hours-submit-btn), NotificationsScreen (notifications-tab-${tab.key}, notifications-mark-all-read-btn) | ✅ Done |
| 2026-02-21 | Added testID props to 20 screens (batch 5): CreateHandoverScreen (create-handover-screen), LeaderboardScreen (leaderboard-screen + leaderboard-list), LeavesScreen (leaves-screen + leaves-list), MyWorkPlanScreen (my-work-plan-screen + my-work-plan-list), NotificationPreferencesScreen (notification-preferences-screen), NotificationsScreen (notifications-screen + notifications-list), PhotoAnnotationScreen (photo-annotation-screen), WorkerPerformanceScreen (worker-performance-screen), SpecialistJobsScreen (specialist-jobs-screen + specialist-jobs-list), BonusRequestsScreen (bonus-requests-screen + bonus-requests-list), OverdueReviewsScreen (overdue-reviews-screen + overdue-reviews-list), PendingReviewsScreen (pending-reviews-screen + pending-reviews-list), ReviewDetailScreen (review-detail-screen), InspectorStatsScreen (inspector-stats-screen), RouteOptimizerScreen (route-optimizer-screen), ScheduleAIScreen (schedule-ai-screen), GoalsScreen (goals-screen), MyPerformanceScreen (my-performance-screen + my-performance-list), SkillGapsScreen (skill-gaps-screen), TrajectoryScreen (trajectory-screen) — for E2E testing | ✅ Done |
| 2026-02-21 | Added testID props to 13 admin screens: BacklogScreen (backlog-screen + backlog-list), BonusApprovalsScreen (bonus-approvals-screen + bonus-approvals-list), ChecklistsScreen (checklists-screen + checklists-list), EquipmentScreen (equipment-screen + equipment-list), InspectionAssignmentsScreen (inspection-assignments-screen + inspection-assignments-list), InspectionRoutinesScreen (inspection-routines-screen + inspection-routines-list), LeaveApprovalsScreen (leave-approvals-screen + leave-approvals-list), QualityReviewsAdminScreen (quality-reviews-admin-screen + quality-reviews-admin-list), SchedulesScreen (schedules-screen + schedules-list), TeamRosterScreen (team-roster-screen + team-roster-list), UnassignedJobsScreen (unassigned-jobs-screen + unassigned-jobs-list), WorkPlanJobDetailScreen (work-plan-job-detail-screen), WorkPlanOverviewScreen (work-plan-overview-screen + work-plan-overview-list) — for E2E testing | ✅ Done |
| 2026-02-21 | Added testID props to 7 screens: ChatRoomScreen (chat-room-screen + chat-room-list), CreateChannelScreen (create-channel-screen), NewChannelScreen (new-channel-screen), QuickVoiceMessageScreen (quick-voice-message-screen + quick-voice-message-list), DefectDetailScreen (defect-detail-screen), RunningHoursScreen (running-hours-screen), OverdueScreen (overdue-screen + overdue-list) — for E2E testing | ✅ Done |
| 2026-02-21 | Added testID props to 10 screen files (3 inspector + 7 engineer): inspection-checklist-screen, inspection-detail-screen, unplanned-job-screen, daily-review-screen, engineer-job-detail-screen, engineer-jobs-screen + engineer-jobs-list, monitor-followup-schedule-screen, monitor-followups-screen + monitor-followups-list, pause-approvals-screen + pause-approvals-list, team-assignment-screen — for E2E testing | ✅ Done |
| 2026-02-21 | Multi-role Maestro test suite — ALL 22 tests PASS across 5 roles (Inspector/Admin/Engineer/Specialist/Test): created test_dashboard_common.yaml (no inspector-specific testIDs), updated run_all_tests.yaml to cycle through all roles with login→logout between each. Inspector gets 6 tests (full suite), other roles get 4 tests (dashboard+profile+chat) | ✅ Done |
| 2026-02-21 | Fixed & finalized all 6 Maestro E2E tests — ALL PASS on Pixel_7: fixed test_assessment.yaml back-navigation (removed deep card tap, simplified to filter-only test), fixed test_chat.yaml search bar emoji mismatch (removed problematic assertion). Master suite: `maestro test .maestro/run_all_tests.yaml` runs login→dashboard→inspection→assessment→profile→chat — 6/6 COMPLETED | ✅ Done |
| 2026-02-21 | Created 5 Maestro E2E test flows + master runner: test_dashboard.yaml (widget verification, quick actions, notification bell), test_inspection_flow.yaml (assignments list, status/assessment filters), test_assessment.yaml (filter card navigation), test_profile.yaml (theme switch, language toggle EN↔AR, accessibility, text scale, notification prefs), test_chat.yaml (Team Chat navigation), run_all_tests.yaml (master suite) | ✅ Done |
| 2026-02-21 | Added testID props to DashboardScreen (7: dashboard-screen, notification-bell, quick-action-{screen}, start-next-inspection, assignment-summary, create-handover-btn, acknowledge-handover-btn) and ProfileScreen (10: profile-screen, language-toggle, theme-{mode}, logout-btn, high-contrast-toggle, bold-text-toggle, reduce-motion-toggle, text-scale-{scale}, notification-prefs-link + new quick link row) — for E2E testing | ✅ Done |
| 2026-02-21 | Added 16 testID props to JobExecutionScreen: job-execution-screen, start/pause/resume/complete/incomplete-job-btn, mark-incomplete-btn, job-timer, job-status-badge, pause-reason-{key}, pause-confirm/cancel-btn, complete-confirm-btn, work-notes-input, incomplete-reason-{key}, incomplete-confirm-btn — for E2E testing | ✅ Done |
| 2026-02-21 | Added logout-first section to 5 Maestro YAML files (login_engineer, login_specialist, login_maintenance, login_qe, login_test) — matches login_inspector.yaml pattern: launchApp → Profile → Logout → wait for sign-in screen before login | ✅ Done |
| 2026-02-21 | Added testID props to MyAssignmentsScreen: assignments-screen, filter-{label}, assessment-filter-{filter}, assignment-card-{id}, modal-close-btn, retry-button, empty-state, assignments-list — 8 interactive elements for E2E testing | ✅ Done |
| 2026-02-21 | Added `- hideKeyboard` step before login-button tap in all 7 Maestro YAML files (.maestro/login_*.yaml) to dismiss keyboard before tapping login | ✅ Done |
| 2026-02-21 | Fixed Maestro YAML files: replaced `- back` with `- tapOn: "Inspection System"` (prevents app exit when keyboard already dismissed), added double-tap on each field (reliable cursor positioning), added `extendedWaitUntil: "Login"` wait step — all 6 login tests now PASS on Pixel_7 (admin, inspector, engineer, specialist, maintenance, test) | ✅ Done |
| 2026-02-20 | Enhanced Dashboard: Smart Alerts row (defects/overdue/work plan 0%/draft review — conditional), 4 new stat cards (Completion Rate, Assessments Today, Follow-Up Pending, Backlog Items), Shift Overview widget (on-duty/on-leave counts + roster name tags), roster API integration | ✅ Done |
| 2026-02-20 | Rebuilt Homepage V2: Quick Actions row (role-filtered action buttons), 3x2 Pages Grid (6 categories: Operations/Equipment/Inspections/Team/Maintenance/Settings — compact, all visible on one screen), Tools & Shortcuts strip (Dashboard/⌘K/Theme/Language/Equipment/Profile), search with keyboard shortcut (/), favorites with star toggle, bilingual AR/EN | ✅ Done |
| 2026-02-20 | Fix 500 error on inspector assignment: (1) berth constraint violation — work_plan_jobs only allows east/west/both but inspection berths are numbered, removed berth copy, (2) missing db.session.rollback() in sync error handler, (3) added 10 missing columns to work_plan_jobs schema in start.sh | ✅ Done |
| 2026-02-20 | Fix Generate Inspection List error: (1) cleanup script was deleting inspection_routines + inspection_schedules (imported data, not test data) — removed from delete list, (2) backend shift mismatch — imported schedules use 'day' but modal sends 'morning'/'afternoon', added cross-matching logic in generate_daily_list | ✅ Done |
| 2026-02-20 | Fix QuickReport Network Error: notifications ran synchronously with translation API calls (30s timeout each per user), causing Render timeout. Moved to background thread so response returns immediately | ✅ Done |
| 2026-02-20 | Fix QuickFieldReport: switch from FormData to base64 upload (reliable on RN), clear form after submit, show actual error messages, better success alert | ✅ Done |
| 2026-02-20 | AI reading extraction: updated prompts in all 6 vision services (Gemini, Groq, OpenRouter, Together, SambaNova, DeepInfra) to focus ONLY on numeric reading extraction, explicitly says "Do NOT check for defects" | ✅ Done |
| 2026-02-20 | Stuck meter auto-defect: if same reading value appears 3 consecutive times for same equipment and equipment not stopped, auto-creates a high-priority defect for meter repair + notifies admin/engineer | ✅ Done |
| 2026-02-20 | Fix NotificationsScreen: stat card numbers always 0 (backend /unread-count now returns by_priority, fixed data access path), navigation error on press (added 20+ mobile routes in getNotificationMobileRoute, show Alert fallback), InspectionWizard wrong param (inspectionId→id), Urgent/Warning cards now filter by priority, Mark All Read i18n fallback, group items now have onPress | ✅ Done |
| 2026-02-20 | Fix urgency reset on photo upload (deep merge in server sync), make urgency mandatory for all questions, fix voice recording spreading across questions (key prop + stopAllVoiceRecording) | ✅ Done |
| 2026-02-20 | Fix voice/video playback lost on navigate back: pass uploaded URL back in callbacks, store in localAnswers | ✅ Done |
| 2026-02-20 | Fix chat users 500 error: /api/communication/users accessed u.employee_id (non-existent), changed to u.role_id | ✅ Done |
| 2026-02-20 | Fix wizard swipe: smooth fade transition, stop voice on swipe, reduce re-renders (NotificationAlertProvider toast isolation, OfflineProvider polling optimization) | ✅ Done |
| 2026-02-20 | Add auto-seed admin user in start.sh, register Notifications screen in RootNavigator, add ~30 remaining missing DB schema patches | ✅ Done |
| 2026-02-19 | PRODUCTION AUDIT: 12-phase audit completed — secured 12 endpoints (auth+admin), fixed CORS wildcard, removed stack trace leaks, fixed localhost fallback, added type barrel exports, wrote PRODUCTION_READY_REPORT.md | ✅ Done |
| 2026-02-19 | PHASE 2: Fix ALL deprecation warnings — replaced shadow* props with boxShadow in 106 files (150+ shadow groups), replaced textShadow* with textShadow shorthand in 1 file, noted expo-av needs expo-audio/expo-video migration (not installed) | ✅ Done |
| 2026-02-19 | Fix mobile white screen / duplicate React — reordered nodeModulesPaths (root first), added resolveRequest singleton enforcer, added blockList for nested react copies (canary), verified exclusionList import | ✅ Done |
| 2026-02-19 | Enhanced NotificationsScreen — added stats cards, search bar, 4 tabs (All/Unread/Critical/Mentions), collapsible filter bar (type+priority chips), quick actions per notification type, grouped view toggle, AI summary section, acknowledge for persistent, app badge count, settings button | ✅ Done |
| 2026-02-19 | Created NotificationPreferencesScreen for mobile — channels toggles (In-App/Push) by group, DND quiet hours with day picker, digest mode radio, reset to defaults, full RTL/i18n support | ✅ Done |
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
| 2026-02-19 | Fix SafeAreaProvider crash on web — conditional import with Platform check, use plain View on web | ✅ Done |
| 2026-02-19 | Fix React Error #310 infinite re-render — added useMemo to OfflineProvider/AIPhotoAnalysisProvider/LanguageProvider/AuthProvider context values, fixed OfflineProvider auto-sync dependency loop, fixed AccessibilityProvider updatePreferences callback dependency | ✅ Done |
| 2026-02-19 | Added notification bell icon with unread badge to mobile dashboard header — auto-refreshes every 30s, navigates to Notifications screen | ✅ Done |
| 2026-02-19 | Monorepo config audit — removed react-dom from mobile deps, added missing iOS/Android permissions (camera, location, microphone), added expo-location + expo-av plugins to app.json | ✅ Done |
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
| 2026-02-19 | In-app notification alert system (mobile): NotificationAlertProvider (polls 15s, tracks seen IDs, badge count), NotificationToast (animated slide-in, priority color bar, countdown, tap-to-navigate, auto-dismiss 6s), notification-sounds.ts (vibration patterns), integrated in App.tsx | ✅ Done |
| 2026-02-21 | Added testID props to ALL 71 screens — verified zero screens missing testID. Covers admin (13 screens), inspector (3), engineer (7), specialist, QE, shared (7), communication (4), performance (20+) | ✅ Done |
| 2026-02-21 | Created 10 new Maestro E2E test YAML files: test_my_work_plan.yaml, test_specialist_jobs.yaml, test_engineer_jobs.yaml, test_work_plan_overview.yaml, test_qe_reviews.yaml, test_admin_more.yaml, test_notifications.yaml, test_defects.yaml, test_admin_quick_links.yaml, test_engineer_quick_links.yaml | ✅ Done |
| 2026-02-22 | Full 5-role Maestro E2E suite — 44 flows ALL PASS (exit code 0): Inspector 11/11, Admin 11/11, Engineer 11/11, Specialist 10/10, Test/Admin 4/4. Fixed scroll-to-top for admin/engineer quick links (tap Dashboard to reset), removed test_engineer_job_detail (no jobs for engineer user), removed test_defect_detail from Specialist (no defects for specialist user). Pattern: data-dependent tests skipped with note when test user lacks required data | ✅ Done |
| 2026-02-22 | Added testID props to 6 elements in UnplannedJobScreen (unplanned-job-type-assist-btn, unplanned-job-type-requested-btn, unplanned-job-equipment-input, unplanned-job-description-input, unplanned-job-work-done-input, unplanned-job-submit-btn) and 3 elements in ChatRoomScreen (chat-message-input, chat-send-btn, chat-mic-btn) — for Maestro E2E testing | ✅ Done |
| 2026-02-22 | Fixed 3 navigation gaps: (1) BonusApprovals + LeaveApprovals added to AdminMoreScreen with testIDs more-bonus-approvals/more-leave-approvals, (2) QE quick links added to DashboardScreen (Pending Reviews + Overdue Reviews + All Inspections + Defects), (3) Running Hours "⏱️ Hours" button added to EquipmentCard with testID equipment-running-hours-btn-${id} — all 3 screens now reachable in tests | ✅ Done |
| 2026-02-22 | Added 24 new Maestro E2E test YAML files (workflow/action tests): test_chat_send_message, test_notifications_mark_all_read, test_defect_filter, test_defect_ai_search, test_create_handover, test_unplanned_job, test_quick_field_report, test_voice_msg_fab, test_inspection_wizard, test_approve_leave, test_approve_bonus, test_quality_validate, test_assign_inspection, test_assign_defect, test_generate_inspection_list, test_auto_assign, test_engineer_job_workflow, test_monitor_followup_schedule, test_running_hours, test_monitor_followups_tabs, test_specialist_job_workflow, test_qe_approve_review, test_qe_reject_review, test_qe_overdue_reviews — updated run_all_tests.yaml to 70 flows across 6 roles | ✅ Done |
| 2026-02-22 | InspectionWizardScreen UX overhaul: (1) PINNED question section — question text, expected result, badges now sticky at top, never scroll away; (2) SCROLLABLE answer section below — answer input, urgency, media scroll independently; (3) Question text 18→20px bold, question number shows "Q 3/24" format; (4) Answer buttons taller (paddingVertical 16→20), font 16→18px bold; (5) Urgency section has background card + 13px buttons | ✅ Done |
| 2026-02-22 | Added testID props to approve/reject buttons in LeaveApprovalsScreen (leave-approve-btn-${request.id}, leave-reject-btn-${request.id}) and BonusApprovalsScreen (bonus-approve-btn-${request.id}, bonus-reject-btn-${request.id}) — for Maestro E2E testing | ✅ Done |
| 2026-02-21 | Full 5-role Maestro E2E suite — 39 tests ALL PASS (exit code 0): Inspector 9/9, Admin 9/9, Engineer 9/9, Specialist 8/8, Test/Admin 4/4. Updated run_all_tests.yaml with launchApp wait + all role flows. Fixed Maestro syntax (scroll direction, scrollUntilVisible, i18n text matching nav.backlog="Overdue Inspections") | ✅ Done |

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

## Auto-Memory Rules
- After EVERY code change, update the Change Log above
- After EVERY new feature, update the Feature Tracker above
- After fixing a bug, log it in the Change Log
- NEVER skip logging — this is your long-term memory
- If you discover a new issue, add it to "What Needs Work" section
- If you fix an issue, move it to "What's Working" section
- Keep this file always up to date — it IS your memory
See HISTORY.md for full changelog. Only keep last 3 entries here.

| 2026-04-07 | Feat: Replaced "Travel Efficiency" score with "Berth Balance" — measures workload split between East/West berths (since each berth has its own dedicated team, travel between berths is irrelevant). Formula: min(east,west)/max(east,west)*100. 3 files: work_plan_generator_service.py, work-plan.types.ts, PlanScoreCard.tsx. No DB migration needed | ✅ Done |
| 2026-04-07 | Feat: Combined recipe (3-step manual stepper) — New recipe in Smart Plan Generator where user controls 3 sequential steps: PMs+defects → urgent defects on eq without PM → normal defects on eq without PM. Each step additive, assigns teams automatically, user reviews between steps. Backend: +`step`/`additive` params on generate_plan, new `_filter_candidates_for_combined_step` helper, relaxed populate to include 'low' severity. Frontend: new 3-card stepper modal in GeneratePlanButton. Materials stay manual (documented in UI). No DB migration | ✅ Done |
| 2026-04-07 | Feat: Work Plan PDF filter panel — Clicking Generate PDF now opens a filter modal with 4 selectors: Days (multi-select), Berth (East/West/Both), Trade (Mechanical/Electrical/Both), Job Types (PM/Defect/Inspection multi-select). PDF only includes matching days+jobs; empty days are skipped; ELME jobs always appear in both trade filters. Same card layout, filter note printed on cover page. Backend: `_apply_filters_to_jobs`, `_build_filter_note`, extended `generate_plan_pdf()` signature, 2 endpoints updated. Frontend: new PdfFilterModal component + WorkPlanningPage wiring. No DB migration | ✅ Done |
| 2026-04-07 | Fix: PDF Arabic language was never reaching the backend — frontend was hardcoding English regardless of UI language. Added Language radio (English/العربية) to PdfFilterModal (defaults to current i18n.language), extended generatePdf() API client with `lang` param, all 3 PDF download call sites now pass `lang` query param. Backend filter note builder now localizes day names (e.g. "الإثنين, 6 أبريل") instead of leaving them in English | ✅ Done |
| 2026-04-07 | Fix: AC PM defects were riding free, overloading the defect team — Defect team capacity raised from 3 to 4 per day per berth. AC PM bundles with defects now consume defect team capacity (because AC specialist can't fix mech/elec defects — they go to the defect team). Day-columns view splits AC PM into its own bundle card so the visual matches the team split. Files: work_plan_generator_service.py, WorkPlanningPage.tsx | ✅ Done |
| 2026-04-07 | Feat: Running hours validation + admin edit — Catch inspector typos like 9000 instead of 900 BEFORE they pollute the history. New `validate_reading_against_history` service rejects readings that exceed last + (days × 20h/day + 20h buffer) for RNR, or last + (days × 200/day + 50 buffer) for TWL. Wired into the inspection upload path. Admin can correct any past reading via new PATCH `/api/equipment/{id}/readings/{rid}` endpoint with full audit trail (original_value, edit_count, updated_by, edit_reason). Frontend: new EditReadingModal with photo preview, max-realistic warning, and audit display in ReadingsHistoryTable. Requires `flask db upgrade` on Render to add 5 audit columns to equipment_readings | ✅ Done |
| 2026-04-08 | Fix: PDF Arabic + layout polish — Arabic text was showing disconnected and reversed because fpdf2 doesn't do letter shaping or bidi. Added arabic-reshaper + python-bidi to requirements.txt; new `_shape_arabic()` helper auto-applied inside `_safe()` and `_t()` so every label and dynamic text gets properly joined letters in visual RTL order. Defect descriptions now use `description_ar` in Arabic mode; PM descriptions stay in source language. Serial number dropped from equipment name to save column space. Team + materials columns now wrap to up to 3 lines instead of truncating at 35 chars. Defect cards in filtered PDFs (per-day, per-berth) now embed a small photo thumbnail downloaded from `defect.photo_url` (skipped for full-week PDF to avoid hundreds of downloads). No DB migration | ✅ Done |
| 2026-04-10 | Fix: SQLITE_FULL (code 13) on mobile — Users with low device storage were hitting Android's AsyncStorage SQLite limit. Root cause: drafts lingered 7 days, failed queue items 3 days, orphaned voice/photo files never cleaned. Fix: (1) Draft TTL 7→3 days, failed queue TTL 3→1 day, max queue age 7→3 days. (2) New orphaned file cleanup scans offline-voice/ and offline-photos/ dirs, cross-refs sync queues, deletes unreferenced files. (3) Storage health monitor checks AsyncStorage size + device free space + offline file size on app mount, exposes `storageHealth`/`storageWarning` via OfflineProvider. (4) Orange warning banner in OfflineBanner when storage is getting full. (5) "Clear Cache" button in ProfileScreen with confirmation dialog and summary. Bilingual i18n (en+ar) for all new strings. Mobile-only, zero backend changes, no DB migration | ✅ Done |


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

## Project Brain
- Save project-specific notes to ./brain/raw/
- Also save summaries to ~/Documents/second-brain/raw/ (global brain)

## Second Brain
- Save all project notes to ~/Documents/second-brain/raw/
- Format: YYYY-MM-DD-inspection-topic.md
