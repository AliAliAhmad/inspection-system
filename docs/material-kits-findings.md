# Standard material kits from SAP — what the data says

Investigation 2026-08-26. **Nothing built yet.** Ali is supplying an Excel
sheet; this file is what the next session needs so none of it is re-derived.

## The source, and why

**IW3M, not MB51.** MB51 has 82,643 rows but only 34,836 carry a work order,
and most of its movements (201 cost-centre issue, 311 transfer) are not
"given to a job". IW3M has 200,592 rows with an order, 97% of them movement
type **261** (issue to order). Files live in `~/Downloads/sap_import/`.

Count `261` and `Z61`; SUBTRACT `262` and `Z62` (the reversal — issued by
mistake, given back). Aggregate per ORDER first, then measure frequency
ACROSS orders. Frequency-across-orders is what separates a kit item from a
one-off repair charged to the same order.

## The join

    IW3M line --Order--> IW39 --> MaintActivityType == 'PRM'
                              --> Functional Location --> family + unit
                              --> Description --> the interval

`IW39 YTD.XLSX` covers **2025-01-01 .. 2026-08-21** and holds 19,281 orders.
IW3M references 43,482, so **162,885 IW3M lines (81%) reference orders outside
that window** and cannot be identified. The kits therefore reflect the last
20 months of practice. Ali knows and accepted this.

## Reading the interval — THE TRAP

The first pass looked for the letters `HR` and reported "TT 250HR = 1 job".
That was wrong. Real descriptions:

    RS115-250HR-MECH.HOURLY SERVICE      <- 250HR
    TT028-250H-HOURLY SERVICE            <- 250H, no R      (30 orders lost)
    TT028-25/5H-MECH. HOURLY SERVICE     <- 448 orders lost
    TT##-500 HR-MECH. HOURLY SERVICE     <- space before HR
    TT##-25H-MECH HOURLY SERVICE
    FL327-HOURLY SERVICE                 <- NO interval at all

**`25/5H` IS the 250-hour service — Ali confirmed 2026-08-26.** The data had
already proved it: 448 `25/5H` orders and 30 `250H` orders share the same six
core materials at the same six quantities, with nothing in one absent from the
other (oil 25 LTR, fuel filter 1, water separator 1, grease 2 KGM, rags 3 KGM,
oil filter 1).

## FORKLIFTS HAVE NO INTERVALS

All 148 FL PM orders are named `FL###-HOURLY SERVICE`. No number, and the
`Maintenance Plan` column is just one plan per machine (`2000045971`...).
**FL gets ONE kit, not five.** If FL really has 250/500/1000 services, SAP is
not recording which is which and no tool can invent it — it has to be named in
SAP first.

    FL hourly service, 140 jobs:
      97%  CO01-C014-003    Engine oil 15w40             10 LTR
      79%  CO01-C014-009    Grease General Purpose EP2    2 KGM
      76%  CO01-C003-002NV  Cotton Rags                   3 KGM
      60%  FL08-M067-005    Oil filter                    1 EA

## SAP DOES NOT RECORD THE MACHINE MODEL

Ali's kits are per model (`DRG450-65S5`, `DRF-450-65S5L`). Every place the
model could hide was checked and does NOT have it: `Description of technical
object`, `Description of functional location`, `Assembly`, `Maintenance Plan`,
and `SQ01.XLSX` (which is the MATERIAL master, not an equipment master). Every
reach stacker reads `KALMAR REACH STEAKER`.

Deriving the model from consumed parts was tried and **does not work** — at 250
hours both models take the same six items, so the fleet does not separate. Do
not guess it. It must come from Ali or from `equipment.model_number`.

## Ali's decisions (2026-08-25/26)

1. Check his saved kits against the data: right -> keep, wrong -> remove.
2. A material is "standard" at **>= 50%** of orders at that interval.
3. Quantity = **the most-used value (mode)**, his words: "the qty most of the
   times we use it". NOT the average — one 95-litre outlier would put a wrong
   number on a store request. Show the median beside it; they agree everywhere
   except ECH cotton rags (mode 5 KGM vs median 3 KGM).
4. Minimum **5 orders** for a bucket. Below that, report it and create NOTHING.
5. **One kit per family** — except the model split his own kits already use.
6. Each kit is **COMPLETE on its own**, never "extras only". Confirmed against
   his own Kit 4, which already lists the fuel filter and oil filter that
   Kit 1 has. A top-up list means someone must remember a second step at 6am.
7. Scope: **ECH, RS, TT, FL** (MES equipment). NOT RTG (1,448 PRM orders, no
   hour numbers, different section). NOT the 4,788 calendar PM orders
   (`3-Week INSPECTION_RS`, `Inspection AC System`, `BLD ... Check - CB`).

## Faults found in the 8 saved kits

Full line-by-line: `docs/material-kit-check-2026-08-26.txt`.

* **`CO01-C022-004 Equipment degreaser` DOES NOT EXIST.** Zero appearances in
  283,345 movement lines across IW3M and MB51. It is in kits 1, 2, 3, 6, 7, 8.
  The real one is **`CO01-C002-126NV`** (399 lines, LTR), already in kit 4.
* **Six duplicate rows** — same material twice in one kit, with different
  quantities: kit 3 engine oil 45+65; kit 4 engine oil 65+45, breather filter
  1+1, insert filter 2+1, hydraulic filter 2+1; kit 5 engine oil 65+45.
* **`MaterialKitItem` HAS NO UNIQUE CONSTRAINT** on `(kit_id, material_id)` —
  which is why the duplicates were possible. Its sister `JobTemplateMaterial`
  has `UniqueConstraint('template_id','material_id')`. Add the same.
* Quantities disagreeing with reality: rags 5->3, grease 4->2, Tufgear 1->2,
  2000h engine oil 65->45, 4000h gear oil 85->75.
* Common items missing: CRC `CO01-C022-007NV` (52% at 250h), air filter outer
  `ST04-M067-001` (51% at 250h), cotton rags (84% at 1000h).

## Where the kits must plug in

`app/api/materials.py:50 find_matching_kit(equipment_id, cycle_id)` matches on
`equipment.equipment_type` -> `MaterialKit.equipment_type`, `equipment
.model_number` -> `MaterialKit.equipment_model`, and `cycle_id`. **A kit keyed
to the SAP family code `RS` will never match** — it must carry the exact
`equipment_type` string the Equipment rows use. `MaintenanceCycle.hours_value`
(250/500/1000/2000/4000) gives the `cycle_id`.

`SQ01.XLSX` is the material master: `Material`, `Material Description`, `BUn`
(unit), and a 4-level category tree (`Level 1..4`) — the source for creating
any of the 4,109 material codes that do not exist in `materials` yet.

## Method note

Report FIRST, seed SECOND — mirror `sap_carry_over.classify()`'s read-only
pass. Every kit line must carry its provenance (N orders, frequency,
most-used/min/max) so Ali can audit each row. He asked for "0 bug and wrong
tolerance"; the machine counts, Ali validates.

---

# BUILT 2026-08-26 — and the two breaks that had to be fixed first

## THE KITS COULD NEVER HAVE FIRED

`find_matching_kit(equipment_id, job.cycle_id)` (`app/api/work_plans.py:1041`)
is the ONLY route a kit reaches a job. It needs the job to know which service
package it is.

**The nightly rebuild never set `cycle_id`.** `sap_pool_sync.py`'s `fields`
dict — the one whose own comment lists four things "computed by the parser and
then thrown away" — was missing a fifth. Every box order carried NULL,
`place_one` copied NULL onto the job, the matcher fell to its last rule (which
demands a kit with NO interval AND NO model), and all 8 of Ali's saved kits
have both. **Not one of them could ever fire.** Fixed; guarded by
`tests/test_sap_pool_sync.py::TestWhichServiceThisIs`.

**The matcher had no rule for the forklift shape.** A forklift kit can only be
type + model + no interval, because SAP gives forklifts no interval at all.
Rules 1 and 2 required a cycle; rule 3 demanded the model be empty. A new
rule 3 (type + model, no interval) was added between them. Guarded by
`tests/test_material_kit_matching.py`.

## `pm_interval_hours` — and the SIXTH spelling

`app/services/sap_order_parser.py`. SAP writes the same question six ways:

    RS115-250HR-MECH.HOURLY SERVICE   185    the only one a naive parser finds
    TT028-250H-HOURLY SERVICE          30    no R
    TT046-500 HR-MECH. HOURLY SERVICE   4    a space
    RS119-250Hrs-HOURLY SERVICE        12    a trailing s — found only by
                                             checking what the fix DROPPED
    TT028-25/5H-MECH. HOURLY SERVICE  539    more than half of all TT PMs
    FL327-HOURLY SERVICE              148    no interval at all

Measured on the real IW39: the old `HR` search read **375** of 1,697 PM orders.
The new parser reads **973** — `+598`, and **zero** of the old parser's hits
lost. The only refusals left are the 148 forklifts (correct — SAP says nothing)
and 8 oddities (`25H`, and three `TT## HOURLY SERVICE`).

Refuses anything outside 250/500/1000/2000/4000: a stray `750HR` is a typo, and
`maintenance_cycles` has no 750 row for it to point at anyway.

## The spec file, and why it is a file

`app/data/pm_material_kits.json` — 32 kits, 187 lines, generated once from
IW39 + IW3M + the asset list + SQ01. The web app must never open a 36 MB
workbook. Every line carries its provenance (freq %, used_on/n, every amount
drawn) so the report is auditable.

Quantity is the **most-used value**, never the average (Ali, 2026-08-26). The
clearest case: RS DRG450 at 250 hr drew 45 LTR **42 times out of 53**; the
average is 48.58, a figure nobody has ever asked the store for.

## The seeder

`app/services/material_kit_seed.py` + `flask seed-material-kits [--apply]`.
Report-first, mirroring `sap_carry_over.classify()`.

The kit's stored strings come from the app's own `equipment` rows (resolved via
the spec's plant numbers), NEVER from the spec's text — so a kit cannot be
created that the matcher will not find. If the app's rows disagree about a
model, or two spec kits land on one app key, it REPORTS and refuses rather than
averaging it away.

Items are replaced wholesale, which is how the dead `CO01-C022-004` and the six
duplicate rows disappear with no special case for either. Kits with no data
behind them are DEACTIVATED, not deleted — the reversible reading of Ali's
"if wrong remove".

## Dry run against Ali's real fleet + his 8 real kits

`docs/material-kit-seed-preview.txt`. **24 to create, 8 to update, 0 switched
off, 13 materials to create.** `CO01-C022-004` gone from every kit it was in.

CAVEAT that decides the update-vs-replace split: a kit matches an existing one
by `(equipment_type, equipment_model, cycle_id)`. The preview seeds
`model_number` as the BARE model (`DRG450-65S5`) because that is what Ali's own
kits use. If production holds something else — `KALMAR DRG450-65S5`, or NULL —
the same run creates 32 new kits and switches off all 8 instead. **The dry run
on Render is what settles it**, and it says so before writing anything.
