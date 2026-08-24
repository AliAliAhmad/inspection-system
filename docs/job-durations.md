# How long a job really takes

Measured from **IW39**, on every finished MES order in the YTD export:

```
elapsed = (Actual Order Finish Date + Actual finish time)
        - (Actual start date        + ActualStartTime)
```

Ali's rule, 2026-08-24. Chosen over the two alternatives after both were measured:

* **SAP's planned `Work` (IW49)** — what the app used until now. Inflated: a reach
  stacker PM planned at 14.0h really holds the machine 7.6h. Trailer PM planned at
  18.0h really takes 2.0h, a figure that had the planner reserving most of a day.
* **Confirmed `Actual work` (IW49)** — man-hours, not machine hours: `Work = crew ×
  duration` on 20,640 of 30,840 MES operations. Higher again (RS PRM = 24.0), and for
  faults it is worthless because the confirmation is a copy of the plan — 1,122 of
  1,122 breakdowns confirmed the planned figure to the decimal.

Coverage: **8,904 of 8,914** finished MES orders carry both stamps.

Caveat: a job spanning days counts the night as well, so p75/p90 and the maxima are
inflated. The **median** is not, which is why it is the figure used.

## The table

| work | n | median | p25 | p75 | p90 | done in a shift | longest |
|---|---:|---:|---:|---:|---:|---:|---:|
| **PRM — all** | 1780 | **4.9h** | 3.0 | 8.0 | 11.0 | 77% | 186h |
| &nbsp;&nbsp;TT · Terminal truck | 784 | **4.5h** | 3.0 | 6.5 | 9.5 | 86% | 143h |
| &nbsp;&nbsp;RS · Reach stacker | 404 | **7.6h** | 4.0 | 9.0 | 27.0 | 56% | 114h |
| &nbsp;&nbsp;ECH · ECH | 276 | **7.0h** | 3.5 | 9.0 | 15.5 | 65% | 81h |
| &nbsp;&nbsp;TR · Trailer | 158 | **2.0h** | 1.0 | 3.0 | 6.0 | 97% | 26h |
| &nbsp;&nbsp;FL · Forklift | 157 | **4.0h** | 3.0 | 6.5 | 9.5 | 85% | 186h |
| **COM — all** | 2342 | **2.0h** | 1.0 | 4.5 | 18.0 | 87% | 2,478h |
| &nbsp;&nbsp;TT · Terminal truck | 827 | **1.5h** | 1.0 | 4.0 | 18.0 | 87% | 1,448h |
| &nbsp;&nbsp;RS · Reach stacker | 590 | **2.0h** | 1.0 | 5.5 | 10.5 | 87% | 2,096h |
| &nbsp;&nbsp;FL · Forklift | 391 | **2.0h** | 1.0 | 4.5 | 29.2 | 85% | 2,478h |
| &nbsp;&nbsp;ECH · ECH | 373 | **2.0h** | 1.0 | 5.0 | 23.5 | 87% | 1,466h |
| &nbsp;&nbsp;TR · Trailer | 144 | **2.0h** | 1.0 | 4.0 | 8.2 | 89% | 681h |
| **DAM — all** | 913 | **1.0h** | 0.5 | 1.8 | 3.0 | 97% | 503h |
| &nbsp;&nbsp;TT · Terminal truck | 511 | **1.0h** | 0.5 | 1.0 | 1.7 | 99% | 503h |
| &nbsp;&nbsp;FL · Forklift | 128 | **1.5h** | 1.0 | 3.0 | 6.0 | 91% | 241h |
| &nbsp;&nbsp;RS · Reach stacker | 111 | **1.5h** | 1.0 | 2.5 | 4.0 | 97% | 88h |
| &nbsp;&nbsp;ECH · ECH | 85 | **2.0h** | 1.0 | 3.0 | 5.5 | 94% | 78h |
| &nbsp;&nbsp;TR · Trailer | 72 | **1.1h** | 1.0 | 2.0 | 3.5 | 99% | 8h |
| **INS — all** | 372 | **1.5h** | 1.0 | 3.0 | 6.5 | 95% | 100h |
| &nbsp;&nbsp;RS · Reach stacker | 124 | **1.5h** | 1.0 | 3.0 | 7.0 | 94% | 86h |
| &nbsp;&nbsp;TT · Terminal truck | 101 | **2.0h** | 1.0 | 3.0 | 6.0 | 97% | 100h |
| &nbsp;&nbsp;ECH · ECH | 67 | **2.0h** | 1.0 | 3.5 | 26.0 | 90% | 86h |
| &nbsp;&nbsp;FL · Forklift | 60 | **1.0h** | 0.5 | 2.0 | 5.0 | 97% | 100h |
| &nbsp;&nbsp;TR · Trailer | 20 | **1.5h** | 1.0 | 2.0 | 3.3 | 100% | 4h |
| **ACD — all** | 133 | **2.5h** | 1.0 | 6.0 | 15.5 | 80% | 2,232h |
| &nbsp;&nbsp;RS · Reach stacker | 61 | **3.2h** | 2.0 | 7.0 | 12.5 | 79% | 2,232h |
| &nbsp;&nbsp;TT · Terminal truck | 40 | **1.8h** | 0.8 | 10.5 | 289.0 | 70% | 789h |
| &nbsp;&nbsp;FL · Forklift | 20 | **1.5h** | 1.0 | 4.0 | 6.5 | 95% | 8h |
| **BDM — all** *(excluded from planning)* | 2893 | **1.0h** | 0.5 | 1.5 | 3.0 | 100% | 29h |

## What predicts a duration

Only for PRM does the machine matter — 2.0h on a trailer against 7.6h on a reach
stacker. For a fault, nothing does. Measured on the 2,031 COM orders that finish
inside a shift, against a flat single number:

| grouped by | groups | improvement |
|---|---:|---:|
| machine family | 6 | 1% |
| function / component from the functional location (HYDR, BRAK, SPDR…) | 12 | 3% |
| family × component | 35 | 5% |
| first word of the description | 51 | 7% |

Every component sits between 1.0h and 3.0h: cable 1.0 · electrical 1.5 · hydraulic
2.0 · brake 2.0 · tyre 2.0 · power train 2.0 · clutch 2.4 · spreader 3.0. A component
table would be twelve numbers to maintain for a 3% gain.

**A PRM's length is a property of the job. A COM's length is a property of the
situation.** The only division that matters for a fault is whether it waited: 87%
finish inside a shift at ~1.5h, and the rest run for days — one COM sat open 103 days.
That is not work, and no field in SAP announces it in advance.

---

# What makes a COM major — found, and why it is invisible

Ali asked for a pattern behind how hard or major a fault is. There is one, it is
strong, and it is not in any field the planner can currently see.

## The signal: how many OPERATIONS the order has

| operations on the order | n | median elapsed | done in a shift |
|---|---:|---:|---:|
| 1 | 1,996 (85%) | **1.6h** | 92% |
| 2 | 213 | **3.5h** | 73% |
| 3 | 53 | **8.0h** | 53% |
| 4–5 | 46 | **25.8h** | 33% |
| 6+ | 34 | **204.3h** | 6% |

A 128× spread, on a field present for 100% of finished orders. SAP's own planned
man-hours say the same thing (≤2h planned → 1.0h actual, >16h planned → 31.5h) and so
does planned crew size (1 → 1.0h, 2 → 2.0h, 3 → 2.8h, 4+ → 10.0h). All three are the
same underlying fact: **a job with six steps is an overhaul, a job with one step is a
lamp.**

## Why it cannot be used today

**Zero of the 208 open orders appear in IW49.** Not one.

Every operation row in the export carries `CNF` or `TECO` — 56,130 and 56,025 of ~56k
rows, against only 105 `REL`. The export's selection is filtered to confirmed and
technically-complete operations, so operations become visible only after the work is
finished, which is exactly too late.

```
MES orders present in IW49:   finished  8,903 of 8,914
                              open          0 of   210
```

This is an **export setting, not a SAP fact**. Widening the IW49 selection to include
`CRTD`/`REL` operations would give every open order its operation count, planned hours
and planned crew — the best predictor found anywhere in this data.

## What was tested and found empty

The notification catalogue is not filled in. `Breakdown`, `Effect`, `Code group text`,
`Coding code text`, condition and availability before/after malfunction are all blank
on the MES notifications, despite 125 of 128 open COMs having a notification attached.
`ABC indicator` (1.3×, on 16% of open) and `Priority` (2.0×, and backwards — priority 1
is *faster*) carry nothing usable. Total actual cost does not separate either: over
10,000 IQD median 2.5h against 1.5h for zero cost.

**Until the export changes, one number per letter is the honest answer for faults.**

---

# Faults by component — asked for, measured, and it does not hold

## COM — 2,342 finished, component named on 49%

| component | n | median | p75 | done in a shift |
|---|---:|---:|---:|---:|
| LIFT · lifting | 24 | **9.5h** | 73.0 | 50% |
| SPDR · spreader | 72 | **4.0h** | 7.0 | 81% |
| STEE · steering | 18 | **3.2h** | 8.5 | 72% |
| CLCS · clutch | 88 | **3.0h** | 4.5 | 89% |
| STRC · structure | 31 | **3.0h** | 15.5 | 68% |
| POTR · power train | 228 | **2.5h** | 8.5 | 74% |
| BRAK · brakes | 92 | **2.5h** | 4.0 | 89% |
| *(not named)* | 1,187 | **2.0h** | 4.0 | 89% |
| TIRE | 107 | **2.0h** | 5.5 | 83% |
| HYDR · hydraulics | 137 | **2.0h** | 4.0 | 92% |
| ELEC · electrical | 202 | **1.5h** | 2.8 | 92% |
| OCAB · operator cabin | 137 | **1.0h** | 1.5 | 94% |

## DAM — 913 finished, named on 56%

| component | n | median | done in a shift |
|---|---:|---:|---:|
| SPDR | 16 | 2.0h | 88% |
| HYDR | 19 | 1.5h | 84% |
| *(not named)* | 402 | 1.0h | 98% |
| TIRE | 429 | 1.0h | 98% |
| OCAB | 22 | 0.5h | 95% |

## ACD — 133 finished, named on 55%

| component | n | median | done in a shift |
|---|---:|---:|---:|
| STRC | 9 | 5.5h | 56% |
| SPDR | 24 | 3.0h | 88% |
| *(not named)* | 60 | 2.5h | 80% |
| TIRE | 9 | 2.0h | 89% |
| HYDR | 8 | 1.2h | 75% |
| OCAB | 9 | 1.2h | 67% |

## Two reasons it cannot be used

**It does not survive testing.** Learned on half the orders, measured on the other
half, 20 random splits, jobs up to 24h — even restricted to orders that *do* name a
component, which is the best case it will ever get:

| | flat number | by component | gain |
|---|---:|---:|---:|
| all three, component known | 1.73h | 1.64h | **+5%** |
| COM only, component known | 1.98h | 1.90h | **+4%** |
| letter × component, component known | 1.71h | 1.61h | **+6%** |

The 10× spread between operator cabin (1.0h) and lifting (9.5h) is real in the past
and does not repeat in the future. Twelve numbers to maintain for 5%.

**And it is not there on the work that needs planning.** Of the **128 open COM orders,
5 name a component. 4%.** DAM: 0 of 1. ACD: 1 of 1.

Naming has been falling for two years — from ~75% of faults raised in early 2025 to
~20% through 2026, with a recovery to 70% in August 2026 (44 orders, partial month):

```
2025-01  74%   2025-07  45%   2026-01  26%   2026-05  17%
2025-02  78%   2025-08  48%   2026-02  27%   2026-06  24%
2025-03  56%   2025-09  46%   2026-03  17%   2026-07  45%
2025-04  60%   2025-10  58%   2026-04  43%   2026-08  70%
```

Even if every fault named its component tomorrow, the gain measured above is 5%.
**One number per letter stands: COM 2.0h · DAM 1.0h · ACD 2.5h, crew of 2.**

---

# Not every PRM is the same job

`MaintActivityType = PRM` covers three different visits, and 33 of the 78 open PMs
are the smallest of them:

| kind | n | median | done in a shift |
|---|---:|---:|---:|
| AC service | 204 | **2.0h** | 92% |
| 3-Week inspection | 434 | **4.5h** | — |
| Hourly service (250/500/1000/2000HR) | 1,102 | **5.5h** | — |

By family:

| | RS | ECH | TT | FL | TR |
|---|---:|---:|---:|---:|---:|
| Hourly service | 8.5h | 8.0h | 4.5h | 4.5h | — |
| 3-Week inspection | 7.5h | 6.0h | — | — | 2.0h |
| AC | 2.0h | 2.0h | 2.0h | 3.0h | — |

**AC is split out and priced at 2.0h.** Pricing it at the family's full-service figure
would have booked 12 hours for a 2-hour visit on 42% of the open PMs.

**The 3-Week inspection is NOT split out, deliberately.** It reads like a light job and
is not: 7.5h on a reach stacker against 8.5h for the hourly service, 6.0h on an ECH
against 8.0h. Close enough to the full service that a separate number would be noise.

## Open: nested packages double-charged

RS109 currently carries **250HR and 2000HR open at the same time** — priced 12h + 12h.
Ali's own rule says the packages are nested task lists of one plan ("the difference is
in the additional task"), so doing the 2000HR covers the 250HR and the machine should
be charged once. One machine of 87 today, and 17 machines carry more than one open PM
(the rest are service + AC, which are genuinely two visits). Not yet handled.

## Effect on the real pool — 208 open orders

| letter | n | before | after |
|---|---:|---:|---:|
| PRM | 78 | 793h | **391h** |
| COM | 128 | 474h | **384h** |
| DAM | 1 | 3h | 3h |
| ACD | 1 | 2h | 2h |
| **all** | **208** | **1,272h** | **780h** |

Once bundled onto machines, so faults riding with a PM take the cheaper price:
**714h — 56% of what the planner used to believe.** 87 machines carry work, 39 of them
have a regular PM due.

---

# The day budget (2026-08-25)

The prices above got their cap. `app/services/day_budget.py`: a team's day =
day-shift men × 8h, per berth, from `WorkerAssignmentRule` + roster + approved
leaves; nights are breakdowns only. East's PM and defect pools share the same
men, so they share ONE wallet object (detected from the lists, never
hardcoded). Bundles charge duration × crew at placement; a 12h RS PM splits
8h + 4h across consecutive days (riding faults on the finishing day, same
pair both days); an urgent RS/ECH takes up to 4 men (RS: 2→12h, 3→8h, 4→8h)
and one day instead. Urgency never bypasses the wallet. Deleted with the
counts: the family lock and the per-worker constants. AC caps unchanged.
Verified on the real 208 orders: 116 scheduled, 97 waiting, 0 of 21
team-day wallets overspent.
