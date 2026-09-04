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

---

## 2026-08-25 — Plan 3 Stage 2 final review

**LESSON: I sent a reviewer a "full diff" that was `git diff --cached` — the STAGED subset.**
Four of the eleven Stage 2 files had never been staged, so the completion hook, the entire
`/free-for-more` endpoint, the savepoint and the kind registration were invisible to the one
gate meant to see everything. → **Before packaging any review, run `git status --short` and
account for EVERY line.** A diff that silently omits files reads exactly like a clean one.

**LESSON: the same bug came back a seventh time, one call frame further out.** Six rounds
closed "the button promises X and the day is charged Y" by making both sides call
`useful_crew`. The seventh instance was not in the function — it was in the ARGUMENT: the
offer counted men with hours left, the press counted everyone on the finished job. → **When
two sides are made to share a function, check they also share its INPUT.** A shared callee
with different arguments is still two answers.

**LESSON: a spec can mandate a bug, and mine did.** The design doc said to put the completion
hook "before `db.session.commit()`". Following it put up to eight 15-second Telegram POSTs
inside a man's open transaction. → **When a review overturns a spec instruction, edit the
spec in the same change.** Fixing only the code leaves the trap armed for the next author,
and the diff then looks like an unexplained deviation.

**LESSON: a test with one fixture row cannot tell a choice from a coincidence.**
`test_swap_crew_hands_it_to_another_team` created exactly ONE assignment rule, so
`candidates[0]` was the pressed rule by accident and passed while the code ignored the
engineer's choice entirely. → **To prove a selection is honoured, the fixture must contain at
least two candidates and the test must pick the one that is NOT first.**

**LESSON: "take the biggest crew the table measured" is not the same as "take the best crew".**
Ali's curve FLATTENS — a reach stacker is 8h at three men and 8h at four — so stepping to the
largest measured point spent a man's whole afternoon for zero. The comment in
`job_durations.py` had said so all along. → **When a lookup table plateaus, ask for the
SMALLEST input reaching the best output.** And read the table's own comments before writing
code that reads the table.

**LESSON: a reviewer that goes idle without reporting has done no work.** Two opus reviewers
analysed this branch and never sent a verdict. The third was dispatched with "Report your
findings in your REPLY — send text" and produced five real findings, three of them blocking.
→ **Put the delivery requirement in the dispatch, not just the analysis requirement.**

**LESSON: fixing the arithmetic and leaving the words behind is still a bug.** My clock-check
fix gave `fits` a second failure cause, but the label still only explained the first — and it
quoted the MOST-free man while the check fails on the LEAST-free one. The engineer was told a
4.5-hour job would not fit into eight hours. → **When a condition grows a new branch, grep for
every sentence that explains that condition and grow those too.** The reviewer found this; the
arithmetic tests could not, because they never read the message.

**LESSON: `assert 'X' not in text` can never fail when the correct output CONTAINS 'X'.**
My own guard asserted `'8.0 hours left today (2 men)' not in headline`, but the fixed output is
`'1.0 to 8.0 hours left today (2 men)'` — which contains it. A green guard guarding nothing,
and the `even = True` mutation sailed through it. → **Anchor negative string assertions** (line
start, full line, regex `^`) **and always mutate them.** This is the same family as the
`{'inline_keyboard': []}` truthiness error earlier in this plan: a premise about strings or
truthiness that was never tested.

**LESSON: one name, two shapes.** `details['free_clock_hours']` held a scalar while the
parameter `free_clock_hours` was a per-man list. → **Never let a value and its container share
a name in the same module.** Renamed to `crew_clock_hours` and `clock_hours_by_man`.

---

## 2026-08-26 — Standard material kits from SAP

**LESSON: an absurd count is the parser confessing, not the data being thin.** My first
pass reported "TT 250HR = 1 job" for a fleet of 22 tractors over 20 months. Instead of
believing it, I printed the distinct description SHAPES my regex had REJECTED — and found
`250H` (no `R`, 30 orders), `500 HR` (a space, 4 orders) and above all `25/5H`
(448 orders, more than half of all tractor PMs). → **When a count is implausible, print
what the filter threw away before you print what it kept.**

**LESSON: prove, then confirm — never infer alone.** `25/5H` looked like it might mean the
250-hour service. Rather than assume, I compared the two groups' consumption: 448 `25/5H`
orders and 30 `250H` orders shared six core materials at six identical quantities, with
nothing in one absent from the other. THEN I asked Ali, who confirmed. → **Evidence turns
a question into a confirmation. A confirmation is cheap; a wrong merge of 448 orders is not.**

**LESSON: know when the data cannot answer, and stop.** Ali's kits are per machine model.
SAP records the model nowhere — checked `Description of technical object`, `Description of
functional location`, `Assembly`, `Maintenance Plan` and `SQ01.XLSX`. I tried deriving it
from which parts each machine consumed; it failed, because at 250 hours both reach stacker
models take the same six items. → **Stopping and asking beat labelling a 14-machine fleet
on a fingerprint that does not separate.** Report the attempt AND why it failed, so nobody
repeats it.

**LESSON: I nearly deleted live work while trimming CLAUDE.md under its 8KB limit.** I cut
a block by pattern, assuming it held only finished `~~struck~~` items — it also held ten
open issues, and 3.6KB vanished. Caught it by comparing byte counts against `git show
HEAD:CLAUDE.md` before writing anything else. → **When trimming a memory file, cut by
explicit line range, ASSERT that every line in the range is finished, and grep for each
live item by name afterwards.** A memory file is the one place where a silent deletion is
never noticed later.

**LESSON: before building a feature, check the chain that DELIVERS it end to end.** The
material kits were the visible job. But `find_matching_kit(equipment_id, job.cycle_id)` is
the only route a kit reaches a job, and `sap_pool_sync` never set `cycle_id` — so every one
of Ali's 8 saved kits had been unreachable since the day he made them. Seeding better kits
would have changed nothing at all. → **Trace the whole path from data to screen before
writing the first line.** Ask "what reads this, and does it get what it needs?" The answer
was one grep: `grep -n "cycle_id" app/services/sap_pool_sync.py` returned nothing.

**LESSON: the fix that gains 598 rows can still lose 12, and only a diff finds them.** After
teaching the parser five spellings I compared old-parser hits against new-parser hits and
found **13 orders the old one caught and the new one refused** — `RS119-250Hrs`, with a
trailing `s`, which `HR?\b` rejects because `s` is a word character. Net was already hugely
positive, so nothing would have looked wrong. → **When replacing a matcher, always print
the set difference BOTH ways.** "It finds more" is not the same as "it lost nothing".

**LESSON: a comment listing past mistakes is a checklist, not a monument.** The `fields`
dict in `sap_pool_sync` carries a comment naming four things "computed by the parser and
then thrown away, which quietly disabled four things in the planner". `cycle_id` was the
fifth, sitting right there, still thrown away. → **When you find a comment that names a
class of bug, look for the next instance of that class before moving on.**

**LESSON: when the source data and the app disagree about a fact, the app wins — and the
grouping belongs where the app's own rows are.** I first grouped the kits by the asset
list's model column. Production then showed the asset list calling ten Ottawa tractors one
model while the app calls them ten, and calling 22 Terberg tractors two models while the app
calls them one. Both directions wrong, in one dry run. → **Ship the RAW rows and do the
grouping against the live table** — especially when the grouping key is the same string the
consumer will compare. A kit that cannot be found then cannot be created.

**LESSON: "SKIPPED, something else already claims this key" is a safe refusal that still
loses data.** The seeder refused to overwrite one kit with another, which was right — and
quietly discarded 40 real services while doing it. → **A refusal is only complete when the
report says what was lost.** Better still, remove the situation that causes it.

**LESSON: counting `t()` calls does not prove a screen is translated.** The job screens
called `t()` 200+ times and still showed English, because `t('jobs.severity', 'Severity')`
falls back to the second argument, silently, when the key is missing from `ar.json`. 80 of
the keys the job screens asked for did not exist. → **Audit the KEYS against the dictionary,
never the call sites.** A key present in `en.json` but absent from `ar.json` is invisible in
code review and invisible at runtime — it just looks like English.

**LESSON: a language read from the wrong place is worse than no language at all.**
`/my-plan` did `language = user.language or 'en'` — a column only an admin ever writes — and
then never used the variable. The same wrong line appeared in **8** endpoints; 6 of them did
use it, so they were quietly English too. → **Language comes from the request
(`get_language(user)`), not from a stored column.** When you fix a line like this, grep for
it across the file before assuming it is one bug.

**LESSON: adding a translation can BREAK a working screen.** Seven call sites read
`t('key', `Up to ${max} photos`)` — no variables passed, JavaScript baking the number into
the fallback. That renders correctly *only because the key is missing*. The moment the key
exists, i18next serves the dictionary and the number disappears. → **Before adding any key,
check whether its fallback is a template literal.** If it is, the call site must pass the
variable in the same edit.

**LESSON: get the extractor right before trusting what it says is missing.** My first regex
matched only `t(k, 'x')` and reported 25 keys as having no English source anywhere. All 25
had one — in `t(k, \`x\`)` or `t(k, {defaultValue:'x'})` form. → **When a scan reports
something surprising ("these have no source at all"), suspect the scan before the code.**

**LESSON: Arabic is not singular/plural — it has six count forms.** `"قبل {{count}} يوم"`
renders "قبل 5 يوم", which is wrong; 3-10 takes أيام, 2 takes the dual يومين, 11+ goes back
to singular يوماً. → **Any Arabic string containing `{{count}}` needs
`_zero/_one/_two/_few/_many/_other` variants**, and must be verified against the real i18next
(`node -e` with the actual json) — not assumed.

**LESSON: a hook cannot go in every component, and the compiler is the only thing that knows.**
Bulk-adding `const { t } = useTranslation()` broke two ways: `ErrorBoundary` is a CLASS (hooks
illegal — and an error boundary must not use context either, since it renders after a crash),
and a naive "insert after the first `{`" landed inside multi-line destructured PARAMETERS.
→ **Never bulk-edit JSX without running `tsc --noEmit` after every pass.** It caught 19
out-of-scope `t` calls and then caught my fix for them.

**LESSON: `cd` persists between Bash calls.** A heredoc appending to `lessons.md` ran from
`frontend/apps/mobile` and silently created a second lessons.md there. → **Use absolute paths,
or `cd` to the project root, in every write.** A file that lands in the wrong directory reports
success.

**LESSON: a shared i18n file is a shared BEHAVIOUR change, and English is not the safe half.**
Adding Arabic to the shared `ar.json` was the obvious risk. The quiet one was `en.json`: an
entry there overrides a screen's inline English fallback, so the WEB's English text changes
too — `jobs.notes` would have flipped from "Notes" to "Additional Notes" on web. →
**When only one app should get new strings, put them in that app and layer them on with
`i18n.addResourceBundle(lng, 'translation', overlay, /* deep */ true, true)`.** `deep: true`
is not optional — `deep: false` replaces a whole namespace and silently drops its shared keys.
Prove the other app is untouched with `git diff --name-only <shared path>` returning empty.

**LESSON: a test that fails at 01:00 and passes at 13:00 is a real bug, not a flake.**
Four passing tests went red with no code change — the clock had crossed midnight Baghdad
while the server was still on yesterday's UTC date, so `/my-plan` looked for a plan
containing the wrong day and returned an empty week. → **When a time-dependent test flips,
find out WHICH hour it flipped at before calling it flaky.** And pin the fix with a MOCKED
date: `utcnow()` and `planning_today()` agree 21 hours a day, so a live-clock test passes
against the bug almost every time it runs.

**LESSON: a silent `continue` is a data-loss bug wearing a counter as a disguise.**
`if not equipment_id: skipped += 1; continue` dropped every order on 4 unknown machines,
38 a night, for weeks. The count was written to a report whose only reader was a Telegram
bot that had gone quiet. → **When code discards input, ask "who is told?" — not "is it
counted?"** Route it to a channel that survives until a human looks, and separate DELIBERATE
exclusions from unknown ones, or the alert becomes noise and gets skimmed.

**LESSON: `bash -n` does not check code embedded inside a shell string.**
`start.sh` runs its schema patches inside `python -c "..."`. A comment I added contained a
quoted phrase, which closed that shell string early and silently deleted every patch below
it — including an ALTER TABLE. The app then booted against a column that did not exist and
the job pool 500'd in production. `bash -n start.sh` PASSED, because the result was still
valid bash. → **When one language is nested inside another, check each layer.** Extract the
inner code and `compile()` it (`tests/test_start_sh_is_intact.py`), and never put a double
quote inside a double-quoted heredoc-less block.

**LESSON: a fact must not depend on the thing it outlives.**
"Was this job started" was going to be computed by joining back to the WorkPlanJob on the old
week — but finished weeks are cleanup targets, so deleting them would have silently erased
the sign from every half-done job. → **If a fact must survive its source, COPY it at the
moment you still have it** (`app_work_state` is stamped on reclaim, not looked up later).
A test that deletes the source and asserts the fact survives is what proves it.

**LESSON: check the input's FRESHNESS, not just its presence.**
Four rounds of "nothing new in the pool" were spent inside the app. The answer was that the
file had never been read: the courier delivered at 13:05 and the only reader was a 05:00
cron. The delivery timestamp was in the FIRST query of the investigation and I read it as
"the file is there" instead of "the file is two days old". → **For anything that should
update on a schedule, ask "when did it last change?" before "is it there?"**
