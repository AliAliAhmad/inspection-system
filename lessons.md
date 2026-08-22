# Lessons Learned

Format: `LESSON: [what went wrong] → [rule to follow]`

---

## 2026-08-14 — Job details shipped without Arabic or media

**LESSON: I wrote `language = user.language or 'en'` in a new endpoint while 16 other
API modules already used the shared `get_language(user)` helper → Before resolving
language, tenancy, permissions, or any other cross-cutting concern in a NEW endpoint,
grep for how existing endpoints resolve it and reuse that helper. A hand-rolled version
of an existing convention is a bug that passes its own tests.**

Why it broke: `users.language` defaults to `'en'` and is only ever written by an admin
editing a user. A worker switching the app to Arabic never changes it. The real signal
is the `Accept-Language` header, which `get_language()` checks first.

---

## 2026-08-14 — Media read from the wrong table

**LESSON: I read `defect.photo_url` and assumed defects carry their own media, without
checking every code path that CREATES a defect → When surfacing a field, find every
write site for it before trusting the read. If some creation paths leave it NULL, the
read needs a documented fallback.**

Only the ad-hoc/field-report path copies media onto the defect row.
`DefectService.create_from_failed_item` — the main inspection path — leaves
`photo_url`/`voice_note_url` NULL because the photo, video and voice live on the
`InspectionAnswer`. So the exact case the user cared about ("jobs from inspection
findings") was the one case with no media.

Corollary: the model comment said `# Quick field report fields` directly above
`voice_note_url` / `photo_url`. The scoping was documented in the schema and I read
past it.

---

## 2026-08-14 — A client "setter" that silently no-ops

**LESSON: `setLanguage()` wrote to `apiClient.defaults` guarded by `if (apiClient)`,
so it did nothing when called before init → A setter that silently no-ops when its
dependency is missing hides ordering bugs forever. Store the value at module level and
apply it at USE time (in the request interceptor), so call order stops mattering.**

Mobile's `LanguageProvider` never called it at all, and it is mounted OUTSIDE the
`AuthProvider` that calls `initApiClient`. Two independent faults with one symptom.
Note the request interceptor's own comment claimed it attached "token + language" —
it only ever attached the token. **When a comment describes behaviour the code does not
have, trust the code and fix the drift.**

---

## 2026-08-14 — Verify a regression test actually regresses

**LESSON: New tests for a bug fix are worthless until proven to fail without the fix →
Stash the fix, run the new tests, confirm they fail with the SYMPTOM THE USER REPORTED,
then restore. 5 of 6 new tests failed against the old code, one returning the literal
English string the user complained about.**

---

## 2026-08-22 — Dialect-branching SQL where the ORM already worked

**LESSON: I hand-wrote `DELETE ... WHERE id = ANY(:ids)` for Postgres with an `IN :ids`
fallback for SQLite, three lines below three existing ORM deletes doing the same job →
Before writing raw SQL, look at the lines immediately around it. If the neighbours use
the ORM, use the ORM. Dialect branching is a smell that you have solved a problem the
framework already solved.**

It broke immediately on SQLite (`near "?": syntax error`) and the fix was to delete my
code and copy the pattern already sitting above it. Simplicity First is not a style
preference — the elaborate version was the one that failed.

---

## 2026-08-22 — "It crashes" depends on which database you're standing in

**LESSON: I reported that deleting a rated job "raises an IntegrityError — a 500 on
screen" based on reading a NOT NULL FK in the model → Before describing runtime
behaviour of a constraint, check whether the constraint is ENFORCED in the environment
you're claiming it for.**

`PRAGMA foreign_keys` is **0** in this test suite, so SQLite silently orphaned the rating
row and returned 200. Postgres in production *does* enforce it and would 500. Both are
bugs, but they are different bugs, and my stash-and-rerun test caught me overstating:
the test expecting a crash saw a cheerful `200`.

Corollary: **the stash-and-rerun discipline paid for itself again.** It did not just prove
the tests were real — it corrected the description of the bug I thought I was fixing.
