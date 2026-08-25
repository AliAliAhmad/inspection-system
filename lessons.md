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

---

## 2026-08-23 — A security test that could not fail

**LESSON: `test_an_unconfigured_bot_refuses_everything` POSTed to `/api/telegram/webhook/`
with an empty path segment, which 404s in Flask's router BEFORE any auth check runs →
A test that asserts "this is refused" must be shown to FAIL when the check it names is
deleted. Otherwise it proves only that the request did not succeed, which a 404, a typo
in the URL, or a missing fixture all satisfy equally.**

Found by mutating `secret_header_ok` to `return True` when no secret is configured — the
suite stayed green at 45/45. Four other mutations (deleting the header check, the
allowlist, the private-chat gate, the `update_id` dedupe) each broke a test, so the
suite was strong everywhere except the one place it claimed to be strongest.

Corollary: **mutation-test the gates, not the features.** A wrong renderer is
embarrassing; a wrong gate is exploitable, and it is exactly the code that never runs
in the happy path, so ordinary tests never touch it.

---

## 2026-08-23 — Overlapping categories need an explicit classification ORDER

**LESSON: I classified SAP orders as cancelled-or-done by testing "is it closed" first,
because that is the common case → When two categories can BOTH be true of one row, the
order of the tests is part of the specification, not an implementation detail. Establish
it from the data, then write down why.**

Both cancelled MES orders in the real export (700001289489, 700001232239) also carry
`CLSD` in their system status. Testing closed-first would have reported every cancelled
order as finished work — and finished work is exactly what the removal rules refuse to
touch, so the wrong branch is also the one that hides the mistake.

The check ran against all 9,124 MES rows: 8,912 done, 210 open, 2 cancelled, **zero
unknown**. A total that accounts for every row is what makes a classification claim
worth believing.

---

## 2026-08-23 — Adding a column to a shared read broke the sharing

**LESSON: `IW39_COLUMNS` is read once and the frame passed to four consumers, but
`_read_excel` raises `KeyError` when a pre-parsed frame lacks a requested column → When
a module reads a fixed column list ONCE and shares the result, adding a consumer that
needs a new column means extending that list FIRST. Every fixture built from the old
list fails, and the failure surfaces far from the change.**

Adding `User Status` and `Deletion flag` for the removal rules broke all 9 pool-sync
tests with `Usecols do not match columns` — a clear message pointing at a synthetic
workbook, not at the removal rules that caused it.

The strictness was kept deliberately: a missing `User Status` column would silently
disable cancellation detection, and a loud failure on a changed SAP layout is correct
when every downstream number depends on the columns being what we think they are.

---

## 2026-08-23 — `usecols` does not mean "read less"

**LESSON: I wrote `pd.read_excel(..., usecols=15_columns)` and a comment reasoning about
the 15-column FRAME being small, on a 512 MB container → `usecols` filters what pandas
RETURNS, not what the engine READS. openpyxl builds the entire worksheet first. Measure
peak RSS of a parse before assuming a column filter bounds it.**

Measured on the real exports: IW39 + IW49 + IK17 peaked at **647 MB** against a 512 MB
ceiling. The process was killed by the kernel — no traceback, no error, just a log file
that stopped after the startup lines. It looked exactly like a job that never finished,
and three rounds of shell diagnostics went into "is it still running?" before anyone
measured memory.

`openpyxl.load_workbook(read_only=True)` + streaming rows: **276 MB**, byte-identical
frames across 305,000 rows of five real exports.

Corollary: **a silent kill is the worst failure mode to debug.** The parse now runs in a
process that also serves HTTP, so an OOM there takes the API down with it — worth
remembering before adding another heavy step to the same worker.

---

## 2026-08-23 — A fixture that cannot reproduce the bug

**LESSON: I tested "a row of empty STRINGS counts as blank" by writing `''` into a
workbook with pandas and reading it back → BOTH pandas and openpyxl normalise `''` to
None when WRITING a file, so the fixture produced Nones and the test passed even with
the fix deleted. When a bug comes from data you did not create, check that your fixture
can still express it.**

Caught by mutation: removing the `value != ''` check left the suite green at 90/90. The
condition only exists coming IN from SAP's exports, never on a round-trip through a
library that writes them.

Fix was to extract the row-consuming logic (`rows_to_frame`) so it could be fed plain
tuples — the data as it actually arrives, not as a writer would re-encode it.

**Generalisation: if a test's fixture goes through the same library that normalises the
input, the test is checking the library, not the code.**

---

## 2026-08-23 — A test that exercised the helper, not the caller

**LESSON: I "verified" three widened pool queries by calling `pool_orders_query()` directly
→ reverting all three CALL SITES to the old per-plan filter left the suite green, because
the helper was never the thing that was wrong. Test the line you changed, through the
entry point that reaches it.**

Rewritten to go through the endpoints (`/debug/<week>`, `/auto-schedule`,
`/schedule-sap-order`), each mutation then failed — and the third test immediately
exposed a **live NameError**: `sap.work_plan_id = plan.id` inside a function whose only
parameter is `plan_id`.

**It had been broken since f50e3c8 and nobody could see it**, because the caller wraps it
in `except Exception: logger.warning(...)`. "Auto-add the machine's other open work" had
been silently adding nothing for a day. A swallowed exception plus no test through the
caller is a feature that can be entirely absent while looking present.

Corollary: `try/except` around an optional enhancement is reasonable; **doing it without a
test that proves the enhancement actually happens is not.**

---

## 2026-08-23 — The error handler was the second error

**LESSON: `except Exception: logger.exception('failed for plan %s', plan.id)` — reading
`plan.id` AFTER a failed flush raised `PendingRollbackError` from inside the handler →
Roll back FIRST, and capture any identifier you need for the message BEFORE the call that
can fail. A handler that touches the session it is reporting on becomes a second
exception, and the second one is the one the user sees.**

The real cause was a `UniqueViolation` with an exact, actionable message. What reached
the phone was "Something went wrong reading the plan. It is logged." — the outer
catch-all, because the code written to explain the failure had itself crashed.

Corollary, and the second half of the same lesson: **"it is logged" is not a report.** It
confirms a failure, refuses to name it, and sends the reader to a shell. On a private,
single-user tool the exception text IS the useful answer.

---

## 2026-08-23 — Matching on a subset of rows creates duplicates

**LESSON: The pool sync looked up existing orders among BOX rows only
(`work_plan_id IS NULL`), so an order currently scheduled into a week was not found and a
SECOND row was created for it → When reconciling against a natural key, look it up across
ALL rows. Scoping the lookup to the subset you intend to modify silently converts "skip
this one" into "create a duplicate".**

`UniqueConstraint('work_plan_id', 'order_number')` then fired the moment the generator
tried to stamp the box copy with that plan — `/generate` died with a UniqueViolation, and
production had accumulated 2,375 rows where ~200 were real.

The fix distinguishes two different questions that had been collapsed into one query:
**"what is in the box"** (all box rows — needed for staleness) and **"is this order
already planned"** (all rows for the candidate numbers). The sync now also deletes box
copies whose order number is already stamped to a plan, so the existing damage heals on
the next run.

---

## 2026-08-23 — "Has a foreign key" is not "is being used"

**LESSON: My duplicate cleanup deleted any box row whose order number was "already stamped
to a plan" — I implemented that as `work_plan_id IS NOT NULL` → ~2,000 rows are LEGACY
per-week imports stamped to plans from weeks long finished, so every fresh row was deleted
as a duplicate and the pool collapsed from 202 to 21 in one rebuild.**

**When a cleanup asks "is this in use?", define in-use by the thing that would actually
break — here, a real `WorkPlanJob` on a day of a week that has not ended — not by the
presence of a foreign key. A stale FK is exactly what a cleanup is supposed to remove, so
using it as the protection makes the rule protect its own targets.**

Made worse because it was a DELETE: the previous version of this bug (creating duplicates)
was recoverable; this one destroyed rows, and only the nightly rebuild rebuilding them
from SAP made it survivable.

Corollary: **a self-healing cleanup deserves the same suspicion as a migration.** It runs
unattended, every night, against production, and I shipped it the same afternoon I wrote
it, on a rule I had not checked against the real shape of the data — which the
`orders by plan` histogram would have shown in one query.

---

## LESSON 2026-08-25 — A unit test on each half cannot see the seam between them

**What went wrong:** `day_ripple.make_room` was fully tested and correct. The carry-over
endpoint was fully tested and correct. But the endpoint tells `make_room` HOW MANY
man-hours to free, and man-hours = hours × crew — and on a merge the endpoint counted the
crew of the job being *carried* (2 men on part 1/2) while `make_room` prices the job that
will actually be *charged* (3 men on part 2/2). It asked for 4 man-hours when the day
needed 6, so the domino froze and Tuesday ran 26 of 24 with a movable low-priority job
sitting right there. Every unit test on both sides stayed green.

**Rule:** when one component computes a number that a second component spends, write one
end-to-end scenario that measures the RESULT, not the call. Here that meant: rebuild the
wallets after the endpoint returns and assert nothing is overspent. A test that checks
"make_room was asked to free X" can only ever confirm the wrong number was passed
correctly.

**Corollary:** any figure of the form `quantity × multiplier` crossing a module boundary
deserves the question "whose multiplier?" out loud. Two components each holding their own
idea of the crew is the same class of bug as two components each holding their own idea
of "has anyone touched this job" (`_was_worked`, same plan, Task 4).

---

## LESSON 2026-08-25 (2) — A mutation check that cannot fail is not a check

**What went wrong:** across Plan 3 Stage 1 I wrote seven task briefs containing complete,
literal code. Six of them contained a real bug, and every single one was caught by an
implementer or reviewer reading the surrounding code rather than trusting my brief:

1. A plain `dict` where `_assign_from_rule` does `d[k][u] += 1` on unseen keys — KeyError on
   the first man assigned.
2. A stub object missing `.defect`, which `_determine_team_type` dereferences unguarded —
   would have crashed every fault order.
3. `cost = hours * crew` with no AC exclusion — would have started charging the day for
   air-conditioning work that `bundle_man_hours` deliberately excludes.
4. A mutation check asserting `{'inline_keyboard': []}` is falsy. It is TRUTHY — a dict is
   falsy only with no keys — so that check could never fail.
5. A registration guard (`if _APPLY: return`) that an earlier task's own tests disarm, because
   they register a throwaway kind into the same dict and run first alphabetically.
6. `details['order_number'].as_string()` — a JSON-path filter that works on Postgres and not
   on SQLite, where the entire suite runs.

**Rule:** when handed literal code to transcribe, read the real function it calls BEFORE
trusting the snippet. If the two disagree, the real function wins. Say what you changed and
why; never weaken a test to make code pass.

**Rule:** a mutation check is only evidence if you WATCH IT FAIL. Twice in this run a mutation
was "performed" and passed — once because the mutated line was never exercised by the test's
data, once because my premise about Python truthiness was wrong. Both times the honest report
("this did not fail, and here is why") is what found the real gap. A silently-passing mutation
means the test is asleep, not that the code is right.

**Corollary:** the strongest evidence in this whole run came from an implementer reporting a
mutation that did NOT fail. Reward that. A report that only ever confirms expectations is not
telling you anything.
