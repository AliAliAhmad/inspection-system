# Plan A — read SAP files in "bites" so the server never runs out of memory

Ali, 2026-11-27: no bigger plan (no extra cost); more courier files are coming;
must handle ~1,000,000 rows. Nothing is lost: same pool, same rules.

## Facts (2026-11-27)
- Render Starter: limit 537 MB. The 14:06 UTC in-process sync peaked at 519 MB.
- `flask rebuild-pool` in the shell = a 2nd app copy (+141 MB) -> OOM-killed silently.
- IW39 is already streamed (`_stream_excel`, openpyxl read_only, 15 of 144 columns).
- The kept IW39 table is small (~20 MB). So the ~195 MB peak is somewhere else.
  Suspects, NOT yet measured:
  1. openpyxl loads the workbook's whole SHARED STRINGS list (every distinct text
     of all 144 columns) before the first row, even in read_only mode.
  2. IW49 (~62,000 operation rows) and IK17, also held whole.
  3. pandas copies (object dtype, `.copy()`, `to_datetime`) during the rules.

## Step 0 — MEASURE (gate; no behaviour change) — ~30 min
- Log memory (`_rss_mb()`, already exists) after EACH step of the nightly sync:
  after each file read, after each index build, after the pool write.
- Deploy; read tonight's 02:02 log through Render logs (I can read them).
- Output: a table "step -> MB added". The biggest line decides Step 2.
- You lose: nothing. Could break: nothing (log lines only).

## Step 1 — one shared bites reader — ~2-3 h
- `stream_rows(raw_bytes, usecols, batch=5000)`: yields 5,000 rows at a time and
  keeps nothing between batches.
- Reads the sheet XML WITHOUT loading the whole shared-strings list up front if
  Step 0 shows that list is the peak (resolve only the strings of kept columns).
- Reused by every big courier file (IW39, IW49, IK17, Backlog, ME5K, MB51, ME2L,
  ME5A, MB52). Small files (PRM_Overdue, EQT_Availability) stay as they are.

## Step 2 — IW39 into a table, rules as queries — ~1 day
- New table `sap_iw39_rows` (only the columns used + ~10 spare), REPLACED each run
  inside one transaction (the file is a full export, so replace, not merge).
  **Schema change -> Ali's OK needed** (created like the other tables in start.sh).
- Rules read the table: last completion per plan, last PM per machine (Rule 1),
  breakdowns in 30 days, order status, open orders for the pool.
- Disk check first: `pg_database_size` vs the 1 GB database disk.

## Step 3 — shadow run (proof before any switch) — runs for several nights
- Nightly: old way FEEDS the pool; new way runs beside it and only COMPARES.
- Report key `bites_check`: per rule, equal yes/no + the first 20 differences.
- Switch only after equal results on real files AND Ali's OK. Old way kept for a
  while after, so going back is one change.

## Step 4 — the next files, one at a time, same shadow proof
IW49 -> IK17 -> Backlog -> (when it arrives) ME5K, then MB51/ME2L/MB52/ME5A.

## Not in this plan
- Parts -> order/equipment logic: waits for ME5K (Ali's extractor).
- `Equpment stop due sper part.xlsx`: never used (Ali: not up to date).
- PC-side changes: see `tasks/pc-note-missing-sap-files.md`.

## Verify
- Tests with synthetic files of 1,000,000 rows: memory stays flat (measured).
- Shadow `bites_check` all equal on production before switching.
- Nightly log: peak MB before vs after.
