# Worker job details on mobile, in Arabic — design

**Date:** 2026-08-14
**Status:** Approved
**Scope:** Mobile (My Work Plan) + backend

## Problem

A worker taps a job card in My Work Plan and gets `JobExecutionScreen` — a timer
and activity log. There is no way to see **what the job actually is**: no SAP
order information, and for a defect raised from an inspection, no photo, no voice
note, no severity.

The data exists in the database but never reaches the phone. `/my-plan` sends
only three defect fields:

```python
'defect': {'id': ..., 'description': ..., 'status': ...}
```

No `photo_url`, no `voice_note_url`, no severity/category/hazard. For SAP it
sends `sap_order_number` but not `sap_order_type`, `work_center` or
`maintenance_base`.

## Decisions (confirmed with Ali)

| Question | Decision |
|---|---|
| Arabic scope | **Labels AND content.** Content translated by AI and cached. |
| Where details appear | **A new full details screen.** |

## Why a separate endpoint, not a bigger `/my-plan`

Details are needed for **one** job at a time, not all of them. Photos, voice
URLs and translated text on every job in the list would undo the payload work
done on 2026-08-08 (the flat `jobs` list was removed for exactly this reason,
measured at 44%). A per-job fetch also lets translation happen lazily for the
single job being viewed rather than for the whole week.

## Backend

### `GET /api/work-plans/jobs/<job_id>/details`

Auth: any authenticated user, but **only if the job is in a published plan and
the caller is assigned to it, or is an admin/engineer.** A worker must not be
able to enumerate other people's jobs by id.

Response `data`:

```jsonc
{
  "id": 12,
  "job_type": "defect",              // pm | defect | inspection | corrective
  "description": "...",              // Arabic when available (see below)
  "description_en": "...",           // always the original
  "estimated_hours": 4.0,
  "planned_time_hours": 3.5,
  "priority": "high",
  "berth": "east",
  "day_date": "2026-08-14",
  "notes": "...",
  "equipment": {
    "id": 1, "name": "Pump A-101", "name_ar": "مضخة A-101",
    "serial_number": "CP-2024-001",
    "equipment_type": "centrifugal_pump", "equipment_type_ar": "...",
    "location": "Area A", "location_ar": "..."
  },
  "sap": {                            // present when sap_order_number is set
    "order_number": "SAP-1001",
    "order_type": "PM01",
    "work_center": "MECH",
    "maintenance_base": "running_hours",
    "cycle": "500h"
  },
  "defect": {                         // present when defect_id is set
    "id": 5,
    "description": "...",             // Arabic when available
    "description_en": "...",
    "severity": "high",
    "category": "mechanical",
    "hazard_type": null,
    "report_source": "inspection",
    "status": "open",
    "due_date": "2026-08-20",
    "photo_url": "https://res.cloudinary.com/...",
    "voice_note_url": "https://res.cloudinary.com/...",
    "reported_by": "Ahmed Mechanic",
    "inspection": {                   // where it came from, when known
      "id": 3, "date": "2026-08-01", "inspector": "Omar Electrician"
    }
  },
  "assignments": [ {"user_id": 2, "full_name": "...", "is_lead": true} ]
}
```

`sap` and `defect` are `null` when not applicable — the client branches on
presence, not on `job_type` strings.

### Arabic content: translate once, then cache

When the caller's language is `ar`:

1. If `description_ar` is already set → use it. No AI call.
2. Otherwise call `TranslationService.translate_to_arabic(text)` and **write the
   result back** to `defect.description_ar` (committing), so every later open is
   instant and free.
3. On any failure → return the English text. Never block the screen, never 500.

`TranslationService` has a seven-provider chain ending in free Google Translate
with no API key, so this works even with the known Gemini 429 / bad Groq key
issues noted in CLAUDE.md.

`work_plan_jobs.description` has **no** `_ar` column, so a job's own description
is translated per-request without caching. Only defect text — the long, valuable
text — gets cached. Adding a column for job descriptions is possible later but
is not worth a migration for this.

**Known cost:** the first open of a given defect makes one AI call (~1–3s).
Cached thereafter. Accepted; revisit with an English-first-then-swap approach
only if it proves annoying.

## Mobile

### New `JobDetailsScreen`

Reached by tapping a card in My Work Plan. Sections, in order:

1. **Header** — equipment name (Arabic when present), job-type badge, day + hours
2. **SAP block** (when `sap` present) — order number, type, work center,
   maintenance base, cycle
3. **Defect block** (when `defect` present) — severity chip, category, hazard,
   due date, source inspection + inspector
4. **Description** — Arabic when available
5. **Photo** (when `photo_url`) — thumbnail, tap for full screen
6. **Voice note** (when `voice_note_url`) — play/pause via `expo-av`, already a
   dependency and already used in `InspectionWizardScreen`
7. **Team** — assigned names, lead marked

All labels from `packages/shared/src/i18n/ar.json` (the file already exists).
RTL handled by the existing `LanguageProvider` / `I18nManager`.

Start/Pause/Complete stay on the **card**, unchanged — this screen is read-only
so the work flow is untouched.

### Wiring

`MyWorkPlanScreen.handleViewDetails` currently does
`navigation.navigate('JobExecution', { jobId })`. It becomes `'JobDetails'`.
`JobExecutionScreen` stays reachable from wherever else it is used.

## Testing

**Backend** — `tests/test_job_details.py`:
- SAP job returns a `sap` block and `defect: null`
- Defect job returns photo_url, voice_note_url, severity, and `sap: null`
- Arabic: with `description_ar` already set, no translation is attempted
- Arabic: when empty, the translated text is **written back** to the column
- Translation failure falls back to English and still returns 200
- A worker requesting a job they are not assigned to gets 403
- Unknown job id → 404

**Mobile** — typecheck plus `expo export` to prove the screen and its `expo-av`
import bundle (a device run is not available here).

## Risks

| Risk | Mitigation |
|---|---|
| First-open latency for the AI call | Cached after one call; free provider at the end of the chain |
| Poor technical translation ("bearing", "impeller") | English kept in `description_en` so it is never lost; spot-check the first few |
| Worker enumerating other people's jobs | Assignment check on the endpoint, 403 otherwise |
| Payload regression | Details are a separate endpoint; `/my-plan` is untouched |

No database migration — every column used already exists.
