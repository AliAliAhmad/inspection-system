# Day Budget (Hours Replace Machine Counts) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The generator plans a day by real man-hours — `day-shift men × 8h` per team per berth — replacing the machine-count capacity rules, with pair crews, urgent crew scaling, multi-day PM splits, and bundle-level assignment to the maintenance team.

**Architecture:** A new `day_budget.py` service computes per-day per-berth wallets from `WorkerAssignmentRule` + roster + leaves (day shift only), sharing one wallet when the PM and defect pools overlap (east). The generator charges bundles against wallets in man-hours at placement time and assigns the whole bundle to one crew. AC-team behavior is preserved exactly as-is.

**Tech Stack:** Flask, SQLAlchemy, pytest. No new dependencies, no migrations (no schema change in this plan).

## Global Constraints

- Ali's rules (2026-08-24), verbatim in behavior:
  - Day budget = **day-shift men × 8 hours** per team per berth. Night shift is breakdowns only — never counted.
  - **East:** PM pool and defect pool share men → ONE wallet. **West:** disjoint pools → two wallets. Detected from data, never hardcoded.
  - Crews: **always pairs (2), never fewer.** Urgent TT/FL/TR: still 2. Urgent RS/ECH: up to 4. RS hours: 2→12h, 3→8h, 4→8h. ECH: 2→8h, 3→7h, 4→7h (4-man figure = 3-man until Ali says otherwise).
  - A PM too big for a pair-day is **planned split across consecutive days** (RS: 8h day1 + 4h day2); ride-along faults land on the LAST day of the split.
  - **Only the maintenance (regular_pm) team is assigned to a PRM and its ride-along defects.** Specialists get standalone faults only.
  - Urgent buys **position** (earliest day), and for RS/ECH extra men — never a capacity bypass.
- **AC team untouched:** AC bundles keep `AC_CAPACITY_BY_CATEGORY`, `ac_category_locked`, `ac_count` exactly as today. AC PMs do NOT charge the maintenance wallet.
- DELETE (regular team only): `PM_CAPACITY_BY_CATEGORY` checks, `pm_category_locked`, `DEFECT_CAPACITY_PER_BERTH` checks, `MAX_PM_BUNDLES_PER_WORKER_PER_DAY`, `SPECIALIST_GROUP_SIZE`, `MAX_SPECIALIST_EQUIP_PER_GROUP_PER_DAY`, the urgent "+1 slot" override.
- Existing suite (591 passed, 1 skipped) must stay green except tests that assert the deleted machine-count behavior — those are REWRITTEN to assert the wallet behavior, never merely deleted.
- Every rule lands with a mutation check: break the rule, watch a named test fail, restore.
- NO git commits — Ali commits. Mark plan checkboxes instead.

---

### Task 1: Crew curves and urgent crew policy in `job_durations.py`

**Files:**
- Modify: `app/services/job_durations.py`
- Test: `tests/test_job_durations.py`

**Interfaces:**
- Produces: `pm_hours(family, crew, description)` honoring RS {2:12, 3:8, 4:8} and ECH {2:8, 3:7, 4:7}; `urgent_max_crew(family) -> int` (4 for reach_stacker/ech, else 2); `MAN_HOURS_PER_DAY = 8`.

- [x] **Step 1: Write the failing tests** — append to `tests/test_job_durations.py`:

```python
class TestUrgentCrewPolicy:
    """Ali, 2026-08-24: "if TT or FL, TR is urgent always keep 2,
    RS AND ECHs put maximum up to 4. If 3 will be 8 hrs." """

    @pytest.mark.parametrize('family,max_crew', [
        ('reach_stacker', 4), ('ech', 4),
        ('truck', 2), ('forklift', 2), ('trailer', 2), ('unknown', 2),
    ])
    def test_who_may_get_extra_men(self, family, max_crew):
        from app.services.job_durations import urgent_max_crew
        assert urgent_max_crew(family) == max_crew

    def test_three_men_on_a_reach_stacker_is_eight_hours(self):
        assert pm_hours('reach_stacker', crew=3) == (3, 8.0)

    def test_the_fourth_man_buys_no_time(self):
        """3 -> 8h and 4 -> 8h. The fourth is insurance, not speed."""
        assert pm_hours('reach_stacker', crew=4)[1] == pm_hours('reach_stacker', crew=3)[1]

    def test_ech_with_four_uses_the_three_man_figure(self):
        assert pm_hours('ech', crew=4) == (4, 7.0)

    def test_a_day_is_eight_hours_per_man(self):
        from app.services.job_durations import MAN_HOURS_PER_DAY
        assert MAN_HOURS_PER_DAY == 8
```

- [x] **Step 2: Run** `venv/bin/pytest tests/test_job_durations.py -q` — expect FAIL (`urgent_max_crew` undefined; crew=3 falls back to (2, 12.0)).

- [x] **Step 3: Implement** — in `app/services/job_durations.py` replace the `PM_LARGER_CREW` dict and the `larger` branch of `pm_hours` with crew curves:

```python
# One row per measured crew size. Not a formula: Ali gave points, and the
# points are not linear — on a reach stacker the third man buys 4 hours and
# the fourth buys nothing (he is insurance for an urgent machine, not speed).
PM_CREW_CURVE = {
    'reach_stacker': {2: 12.0, 3: 8.0, 4: 8.0},
    'ech': {2: 8.0, 3: 7.0, 4: 7.0},   # 4-man figure = 3-man until Ali corrects it
}

# Ali: "if TT or FL, TR is urgent always keep 2, RS AND ECHs put maximum up
# to 4." More men never help a small machine; they only rescue a big one.
URGENT_MAX_CREW = {'reach_stacker': 4, 'ech': 4}

MAN_HOURS_PER_DAY = 8


def urgent_max_crew(family):
    return URGENT_MAX_CREW.get(family, MIN_CREW)
```

and in `pm_hours`, replace the `PM_LARGER_CREW` lookup with:

```python
    curve = PM_CREW_CURVE.get(family)
    if curve and crew is not None:
        eligible = [c for c in sorted(curve) if c <= crew]
        if eligible:
            best = eligible[-1]
            return (best, curve[best]) if best > MIN_CREW else standard
    return standard
```

(A crew size between points takes the largest measured point at or below it; below 3 it is the standard pair. Still no interpolation.)

- [x] **Step 4: Run** `venv/bin/pytest tests/test_job_durations.py tests/test_generator_pricing.py tests/test_sap_pool_sync.py -q` — expect ALL PASS (the (4, 8.0) RS case and (3, 7.0) ECH case must still pass).

- [x] **Step 5: Mutation check** — change `'reach_stacker': {2: 12.0, 3: 8.0, 4: 8.0}` to `{2: 12.0, 4: 8.0}`; `test_three_men_on_a_reach_stacker_is_eight_hours` must fail; restore.

---

### Task 2: The wallet builder — `app/services/day_budget.py`

**Files:**
- Create: `app/services/day_budget.py`
- Test: `tests/test_day_budget.py`

**Interfaces:**
- Consumes: `WorkerAssignmentRule` (existing), `RosterEntry`, `Leave`.
- Produces:
  - `class Wallet:` attrs `men: set[int]`, `hours_total: float`, `hours_spent: float`; methods `remaining() -> float`, `charge(hours: float) -> None`.
  - `build_week_wallets(plan, days) -> dict[int, dict[str, dict[str, Wallet]]]` keyed `{day_id: {berth: {'pm': Wallet, 'spec': Wallet}}}`. **On a one-team berth `'pm'` and `'spec'` are the SAME object** — charging one visibly drains the other. Returns `{}` when no rules exist (feature off, generator falls back to no wallet check).
  - `is_one_team(pm_ids: set, spec_ids: set) -> bool` — True when the pools share any member.

- [x] **Step 1: Write the failing tests** — create `tests/test_day_budget.py`:

```python
"""
A team's day = the men who showed up x 8 hours.

Ali, 2026-08-24. The men come from the team lists (WorkerAssignmentRule),
minus roster 'off'/'leave'/'night' and approved leaves. Night shift is for
breakdowns only and never counts toward the plan's budget.

The east rule is the heart of it: east's maintenance men ARE the defect team
(maintenance role + specialist minor role). Giving them a PM wallet AND a
defect wallet meant 16 bookable hours per man. One man, one wallet.
"""

from datetime import date, timedelta

import pytest

from app.models import User, WorkPlan, WorkPlanDay
from app.models.roster import RosterEntry
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.day_budget import Wallet, build_week_wallets, is_one_team

TODAY = date(2026, 8, 24)


def _user(db_session, name, spec='mechanical'):
    user = User(email=f'{name}@t.iq', full_name=name, role='maintenance',
                specialization=spec)
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, berth, team_type, workers, category='all'):
    rule = WorkerAssignmentRule(
        berth=berth, team_type=team_type, equipment_category=category,
        mech_count=2, elec_count=0,
        candidate_mech_workers=[u.id for u in workers])
    db_session.session.add(rule)
    db_session.session.commit()
    return rule


def _week(db_session, admin_user, start=TODAY):
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(2):
        day = WorkPlanDay(work_plan_id=plan.id, date=start + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


class TestTheWallet:
    def test_men_times_eight(self):
        wallet = Wallet(men={1, 2, 3})
        assert wallet.hours_total == 24

    def test_charging_spends_it(self):
        wallet = Wallet(men={1, 2})
        wallet.charge(9.0)
        assert wallet.remaining() == 7.0


class TestOneTeamDetection:
    def test_shared_men_means_one_team(self):
        assert is_one_team({1, 2, 3}, {2, 3}) is True

    def test_disjoint_means_two_teams(self):
        assert is_one_team({1, 2}, {3, 4}) is False

    def test_an_empty_defect_pool_is_not_a_second_team(self):
        assert is_one_team({1, 2}, set()) is True


class TestBuildingTheWeek:
    def test_west_gets_two_separate_wallets(self, db_session, admin_user):
        pm = [_user(db_session, f'pm{i}') for i in range(2)]
        spec = [_user(db_session, f'sp{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        _rule(db_session, 'west', 'defect_mech', spec)
        plan, days = _week(db_session, admin_user)

        wallets = build_week_wallets(plan, days)
        west = wallets[days[0].id]['west']

        assert west['pm'] is not west['spec']
        assert west['pm'].hours_total == 16
        assert west['spec'].hours_total == 16

    def test_east_shares_ONE_wallet_when_the_men_overlap(self, db_session,
                                                        admin_user):
        team = [_user(db_session, f'e{i}') for i in range(4)]
        _rule(db_session, 'east', 'regular_pm', team)
        _rule(db_session, 'east', 'defect_mech', team)
        plan, days = _week(db_session, admin_user)

        east = build_week_wallets(plan, days)[days[0].id]['east']

        assert east['pm'] is east['spec']
        assert east['pm'].hours_total == 32
        east['pm'].charge(9.0)
        assert east['spec'].remaining() == 23.0   # same money

    def test_a_man_on_leave_shrinks_that_day_only(self, db_session, admin_user):
        team = [_user(db_session, f'l{i}') for i in range(3)]
        _rule(db_session, 'west', 'regular_pm', team)
        plan, days = _week(db_session, admin_user)
        db_session.session.add(RosterEntry(user_id=team[0].id,
                                           date=days[0].date, shift='leave'))
        db_session.session.commit()

        wallets = build_week_wallets(plan, days)

        assert wallets[days[0].id]['west']['pm'].hours_total == 16
        assert wallets[days[1].id]['west']['pm'].hours_total == 24

    def test_the_night_shift_is_not_plan_money(self, db_session, admin_user):
        """Ali: nights are for breakdowns only."""
        team = [_user(db_session, f'n{i}') for i in range(3)]
        _rule(db_session, 'west', 'regular_pm', team)
        plan, days = _week(db_session, admin_user)
        db_session.session.add(RosterEntry(user_id=team[0].id,
                                           date=days[0].date, shift='night'))
        db_session.session.commit()

        assert build_week_wallets(plan, days)[days[0].id]['west']['pm'].hours_total == 16

    def test_no_rules_means_no_wallets_feature_off(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        assert build_week_wallets(plan, days) == {}
```

- [x] **Step 2: Run** `venv/bin/pytest tests/test_day_budget.py -q` — expect FAIL (module missing).

- [x] **Step 3: Implement** `app/services/day_budget.py`:

```python
"""
A team's day, in hours: the men who showed up x 8.

Ali, 2026-08-24. The men come from the team lists the app already holds
(WorkerAssignmentRule candidates + leads), minus anyone the roster marks
off/leave/night, minus approved leaves. Night shift is breakdowns only and
never counts toward the plan.

THE EAST RULE. East's maintenance men ARE the defect team (maintenance role,
specialist minor role). The old code gave them a PM budget AND a specialist
budget - 16 bookable hours from one man. Here, when the two pools share any
member they get ONE Wallet object, so a spent hour is spent everywhere at
once. West's pools are disjoint and get two. Nothing is hardcoded per berth:
hire east a separate defect crew, edit the team lists, and the wallets split
by themselves.

AC is deliberately absent. The AC team keeps its existing machine-count rules
("keep the ac as it is" - Ali), so AC bundles never touch these wallets.
"""

from collections import defaultdict

from app.services.job_durations import MAN_HOURS_PER_DAY

PM_TEAM_TYPES = ('regular_pm',)
SPEC_TEAM_TYPES = ('defect_mech', 'defect_elec')


class Wallet:
    def __init__(self, men):
        self.men = set(men)
        self.hours_total = float(len(self.men) * MAN_HOURS_PER_DAY)
        self.hours_spent = 0.0

    def remaining(self):
        return self.hours_total - self.hours_spent

    def charge(self, hours):
        self.hours_spent += float(hours)


def is_one_team(pm_ids, spec_ids):
    """One team = the pools share men, or there is no defect pool at all.

    An empty defect pool is NOT a second team: with nobody listed, the
    maintenance men are all there is, which is exactly the one-team case.
    """
    if not spec_ids:
        return True
    return bool(set(pm_ids) & set(spec_ids))


def _rule_member_ids(rule):
    ids = set(rule.candidate_mech_workers or []) | set(rule.candidate_elec_workers or [])
    for uid in (rule.primary_mech_lead_id, rule.successor_mech_lead_id,
                rule.primary_elec_lead_id, rule.successor_elec_lead_id):
        if uid:
            ids.add(uid)
    return ids


def team_pools():
    """{berth: {'pm': set_of_user_ids, 'spec': set_of_user_ids}} from the rules."""
    from app.models.worker_assignment_rule import WorkerAssignmentRule
    pools = {berth: {'pm': set(), 'spec': set()} for berth in ('east', 'west')}
    for rule in WorkerAssignmentRule.query.filter_by(is_active=True).all():
        if rule.berth not in pools:
            continue
        if rule.team_type in PM_TEAM_TYPES:
            pools[rule.berth]['pm'] |= _rule_member_ids(rule)
        elif rule.team_type in SPEC_TEAM_TYPES:
            pools[rule.berth]['spec'] |= _rule_member_ids(rule)
    return pools


def _unavailable_by_date(week_start, week_end):
    """user_ids with no plan-money that day: roster off/leave/NIGHT, or on leave."""
    out = defaultdict(set)
    try:
        from app.models.roster import RosterEntry
        for entry in RosterEntry.query.filter(RosterEntry.date >= week_start,
                                              RosterEntry.date <= week_end).all():
            if entry.shift in ('off', 'leave', 'night'):
                out[entry.date].add(entry.user_id)
    except Exception:
        pass
    try:
        from app.models.leave import Leave
        from datetime import timedelta
        for leave in Leave.query.filter(Leave.status == 'approved',
                                        Leave.date_from <= week_end,
                                        Leave.date_to >= week_start).all():
            day = max(leave.date_from, week_start)
            while day <= min(leave.date_to, week_end):
                out[day].add(leave.user_id)
                day += timedelta(days=1)
    except Exception:
        pass
    return out


def build_week_wallets(plan, days):
    """{day_id: {berth: {'pm': Wallet, 'spec': Wallet}}}.

    On a one-team berth 'pm' and 'spec' are the SAME object. Empty dict when
    no rules exist - the generator treats that as "wallets off".
    """
    pools = team_pools()
    if not any(p['pm'] or p['spec'] for p in pools.values()):
        return {}

    gone = _unavailable_by_date(plan.week_start, plan.week_end)
    wallets = {}
    for day in days:
        wallets[day.id] = {}
        absent = gone.get(day.date, set())
        for berth, pool in pools.items():
            pm_here = pool['pm'] - absent
            spec_here = pool['spec'] - absent
            if is_one_team(pool['pm'], pool['spec']):
                shared = Wallet(pm_here | spec_here)
                wallets[day.id][berth] = {'pm': shared, 'spec': shared}
            else:
                wallets[day.id][berth] = {'pm': Wallet(pm_here),
                                          'spec': Wallet(spec_here)}
    return wallets
```

- [x] **Step 4: Run** `venv/bin/pytest tests/test_day_budget.py -q` — expect PASS.

- [x] **Step 5: Mutation checks** — (a) in `build_week_wallets` make the one-team branch build two separate `Wallet` objects → `test_east_shares_ONE_wallet...` fails; (b) drop `'night'` from the unavailable tuple → `test_the_night_shift_is_not_plan_money` fails. Restore both.

---

### Task 3: The generator charges wallets instead of counting machines

**Files:**
- Modify: `app/services/work_plan_generator_service.py` (functions `_check_capacity`, `_remaining_capacity`, `_pick_day_with_capacity`, `_step_distribute`'s tracker build + post-placement update, `_build_capacity_utilization`)
- Test: `tests/test_generator_day_budget.py` (new)

**Interfaces:**
- Consumes: `build_week_wallets` (Task 2), `pm_hours`/`urgent_max_crew`/`MAN_HOURS_PER_DAY` (Task 1), existing `_price_bundle`, `_bundle_has_regular_pm`, `_bundle_has_ac_pm`, `_bundle_has_defect_work`, `_is_urgent_bundle`.
- Produces: `bundle_man_hours(bundle) -> float`; wallet-based placement; `capacity_utilization[date][berth]['hours'] = {'pm': {'used','max'}, 'spec': {'used','max'}, 'shared': bool}`.

**Charging rules (the whole task in four lines):**
- Bundle WITH a regular PM → cost = Σ(duration × crew) of the PM **and every riding member** → charged to the **pm wallet**.
- Standalone fault bundle (no PM, or AC-only PM + faults: the fault part) → duration × 2 per fault → **spec wallet**. (On east same object — by design.)
- AC PM members → **no wallet**; the existing AC category caps still gate the bundle exactly as today.
- A bundle fits a day iff every wallet it touches has `remaining() >= its share` AND the AC caps pass. **No urgent override of the wallet, ever** — urgent buys the earliest fitting day and (RS/ECH) more men.

- [x] **Step 1: Write the failing tests** — create `tests/test_generator_day_budget.py` with this skeleton (fixtures mirror `tests/test_day_budget.py`'s `_user`/`_rule`/`_week`, plus SAP orders in the pool as in `tests/test_sap_pool_sync.py`; drive through `WorkPlanGeneratorService.generate_plan`):

```python
class TestTheDayHasARealSize:
    def test_a_full_day_refuses_the_next_bundle(self):
        """2 west PM men = 16 man-hours. A TT PM (2x4.5=9) fits; a second
        TT PM (9 more) does not - it lands on ANOTHER day, not the same one."""

    def test_a_smaller_team_holds_less(self):
        """Same pool, 2 men vs 4 men in the rule: 4 men place twice as many
        man-hours on one day."""

class TestEastOneWallet:
    def test_pm_work_and_standalone_faults_drain_the_same_money(self):
        """East, 2 men, 16h. A TT PM bundle (9 mh) + standalone COM
        (3h x 2 = 6 mh) fit (15). Adding one more standalone COM (6 mh)
        must overflow to the next day - under the old two-budget code all
        three landed on Monday."""

class TestReachStackerSpansTwoDays:
    def test_the_pm_is_split_eight_plus_four(self):
        """RS PM, pair, non-urgent: day1 job 8.0h, day2 job 4.0h, both
        carrying the same sap_order_number, faults on day2."""

class TestUrgentBuysMenNotOverflow:
    def test_an_urgent_rs_gets_four_men_and_one_day(self):
        """4 west men available, urgent RS PM -> ONE job, 8.0h, 4 assignees,
        32 man-hours charged."""
    def test_an_urgent_tt_stays_a_pair(self):
        """Urgent TT PM still books (2, 4.5) - urgency buys position only."""

class TestTheOldRulesAreDead:
    def test_two_pm_families_share_a_day(self):
        """A trailer PM and a truck PM both fit Monday west (6+9=15 <= 16).
        The old pm_category_locked forbade exactly this."""
    def test_a_fifth_standalone_fault_is_allowed_if_hours_allow(self):
        """5 standalone COM bundles x 6 mh = 30 <= 32 (4 spec men). The old
        DEFECT_CAPACITY_PER_BERTH=4 forbade the fifth machine."""

class TestNoRulesMeansNoWallets:
    def test_generation_still_works_with_no_worker_rules(self):
        """Empty WorkerAssignmentRule table -> wallets off -> jobs still
        placed (backward compatible with every existing test)."""
```

Fill in each body with real arrangements (pool rows via `SAPWorkOrder(...)` directly — no Excel needed) and exact assertions on `WorkPlanJob` rows per day.

- [x] **Step 2: Run** `venv/bin/pytest tests/test_generator_day_budget.py -q` — expect FAIL.

- [x] **Step 3: Implement in `work_plan_generator_service.py`:**

3a. Add `bundle_man_hours`:

```python
def bundle_man_hours(bundle):
    """What this bundle costs the day, in man-hours (duration x crew)."""
    total = 0.0
    for member in bundle.get('members', []):
        crew = member.get('crew') or MIN_CREW
        total += (member.get('estimated_hours') or 0.0) * crew
    return total
```

3b. In `_price_bundle`, also stamp `member['crew']`: PM members get `pm_hours(family, description=...)[0]`; every other member gets `MIN_CREW`. Urgent RS/ECH crew is NOT decided here (depends on the day's men) — placement decides it.

3c. In `_step_distribute`: after `capacity_tracker` is built, add `wallets = build_week_wallets(plan, days)`. Charge existing manual jobs first: for each day/job, `duration × 2` against the matching wallet (`'pm'` when `_determine_team_type(job) in ('regular_pm',)`, `'spec'` for defect work; skip `ac_pm` jobs).

3d. Rewrite `_check_capacity`: keep ONLY the AC-lock/AC-count block; replace the regular-PM block, defect block, and the whole `wf_*` workforce block with:

```python
    if wallets:
        day_wallets = wallets.get(day.id, {}).get(berth if berth != 'both' else 'east')
        if day_wallets:
            wallet = day_wallets['pm'] if has_regular_pm else day_wallets['spec']
            if bundle_man_hours(bundle) > wallet.remaining() + 1e-6:
                return False
    return True
```

with the AC members' hours excluded from the charge when the bundle mixes AC + regular PM. `allow_urgent_override` keeps its parameter but no longer adds slots for the regular team (AC keeps its `+extra_slots`) — the wallet is never overridden.

3e. `_remaining_capacity`: return `wallet.remaining() - bundle_man_hours(bundle)` scaled to an int rank (keep AC minimum logic for AC bundles).

3f. Multi-day PM split, in `_step_distribute` right before `_create_jobs_for_bundle`: if the bundle has a regular PM whose `estimated_hours × crew > MAN_HOURS_PER_DAY × crew` is false — i.e. simply `estimated_hours > MAN_HOURS_PER_DAY` — and it is NOT urgent-RS/ECH-with-men (3g):

```python
        pm = next(m for m in bundle['members'] if m.get('job_type') == 'pm'
                  and not is_ac_service(m.get('description')))
        first_part = float(MAN_HOURS_PER_DAY)
        rest = round(pm['estimated_hours'] - first_part, 2)
        day1, day2 = _pick_consecutive_days_with_room(bundle, days, wallets, ...)
        # part 1: PM alone, 8h, on day1;  part 2: PM rest + ALL riding faults on day2
```

Implement `_pick_consecutive_days_with_room` to find the earliest (d, d+1) pair where day1 fits `first_part × crew` and day2 fits `rest × crew + riding faults`. Create the two PM jobs with descriptions suffixed ` (part 1/2)` / ` (part 2/2)`, same `sap_order_number`. Charge both wallets.

3g. Urgent crew scaling, same place: if `_is_urgent_bundle(bundle)` and family in RS/ECH, try crews from `urgent_max_crew(family)` down to 3: `crew_n, hours_n = pm_hours(family, crew=n)`; if some single day's pm wallet fits `hours_n × crew_n + riding faults`, place unsplit with `pm['estimated_hours'] = hours_n`, `pm['crew'] = crew_n`. Else fall back to the pair split (3f).

3h. Post-placement tracker update: keep the AC counting; delete the regular pm lock/count, `defect_equipment` add for non-AC, and all `wf_*_used` lines; instead `wallet.charge(bundle_man_hours(bundle))` (splitting the charge across the two days for split bundles).

3i. `_build_capacity_utilization`: keep the existing keys for AC; for the regular side emit `'hours': {'pm': {'used': ..., 'max': ...}, 'spec': {...}, 'shared': wallet_pm is wallet_spec}` and compute `is_full` from wallets. Grep the web planner for consumers of `pm_used`/`defect_used` (`frontend/apps/web/src` — `CapacityUtilization`, planner panels) and keep those keys present with wallet-derived values so the UI does not break; note any UI polish as follow-up.

3j. Delete now-dead code: `PM_CAPACITY_BY_CATEGORY`, `DEFECT_CAPACITY_PER_BERTH`, `MAX_PM_BUNDLES_PER_WORKER_PER_DAY`, `SPECIALIST_GROUP_SIZE`, `MAX_SPECIALIST_EQUIP_PER_GROUP_PER_DAY`, `_build_workforce_pools`, `_precompute_bundle_workforce`, and every `wf_*` read — UNLESS a survivor still references them; the AC dict `AC_CAPACITY_BY_CATEGORY` and `_get_pm_category_capacity`'s AC branch stay.

- [x] **Step 4: Run the full suite** `venv/bin/pytest -q`. Existing tests that asserted machine counts (`grep -rln "pm_category_locked\|DEFECT_CAPACITY\|workforce_blocked" tests/`) are rewritten to assert wallet behavior with the same scenario shapes. Expect ALL PASS.

- [x] **Step 5: Mutation checks** — (a) make `bundle_man_hours` return duration only (drop `× crew`) → `TestTheDayHasARealSize` fails; (b) restore the urgent `+1` for the regular wallet → `TestUrgentBuysMenNotOverflow` or a full-day test fails; (c) skip the split branch → `TestReachStackerSpansTwoDays` fails. Restore all.

---

### Task 4: The whole bundle goes to the maintenance crew

**Files:**
- Modify: `app/services/work_plan_generator_service.py` (`_create_jobs_for_bundle`, `_determine_team_type` call site in the assignment loop, `_assign_from_rule` crew count)
- Test: `tests/test_generator_assignment.py` (new)

**Interfaces:**
- Consumes: bundles with `member['crew']` (Task 3), `_determine_team_type` (existing).
- Produces: jobs created from a regular-PM bundle carry `job._bundle_team = 'regular_pm'` (transient attr recorded in a `dict` `team_by_job_id` returned from `_create_jobs_for_bundle` and threaded to the assignment loop); the assignment loop consults it before `_determine_team_type(job)`; every job in the bundle receives the SAME workers; PM jobs request `crew` workers (not the rule's `mech_count` when crew is larger).

- [x] **Step 1: Failing tests** (`tests/test_generator_assignment.py`):

```python
class TestOneCrewOneVisit:
    def test_a_riding_defect_is_assigned_to_the_PM_pair_not_a_specialist(self):
        """Ali: "only the maintenance team are the team who will be assigned
        to PRM and its defect." West: PM rule lists Hassan+Omar, defect rule
        lists Karim. TT PM + riding COM -> both jobs assigned Hassan+Omar;
        Karim appears on NEITHER."""

    def test_a_standalone_fault_still_goes_to_the_specialists(self):
        """A COM on a machine with no PM -> Karim's team, not the PM pair."""

    def test_an_urgent_rs_gets_four_names(self):
        """Urgent RS with 4 PM men available -> the PM job carries 4
        assignments."""
```

- [x] **Step 2: Run** — expect FAIL (today the riding defect routes to `defect_mech`).
- [x] **Step 3: Implement** — `_create_jobs_for_bundle` returns `(jobs, team_by_job_id)` where every job of a `_bundle_has_regular_pm` bundle maps to `'regular_pm'` (AC-PM bundles map their AC job to `'ac_pm'` and their faults to the defect team — the AC specialist cannot fix them, unchanged rule). The assignment loop uses `team_by_job_id.get(job.id) or _determine_team_type(job)`. For same-crew: assign workers to the bundle's FIRST job via the rule, then copy the same `user_id`/`is_lead` set to the bundle's other jobs instead of re-running selection. For urgent crews pass `needed = job_crew` into `_assign_from_rule` (it currently reads `rule.mech_count`; add an optional `override_count` parameter defaulting to None).
- [x] **Step 4: Run** `venv/bin/pytest tests/test_generator_assignment.py -q` then the full suite — expect PASS.
- [x] **Step 5: Mutation check** — revert the `team_by_job_id` consultation to plain `_determine_team_type(job)`; the riding-defect test must fail; restore.

---

### Task 5: Prove it on the real pool, document, and hand over

**Files:**
- Modify: `docs/job-durations.md` (append a "day budget" section), `CLAUDE.md` (Change Log + What Needs Work), `HISTORY.md` (overflow)
- Create: scratch verification script (not committed to tests)

**Interfaces:** none — verification and records.

- [x] **Step 1:** Full suite: `venv/bin/pytest -q` → expect ≥ 591 passed equivalents, 0 failures.
- [x] **Step 2:** Real-data dry run: with the production-shaped fixtures (the 208-order extract used in `docs/job-durations.md`), run `generate_plan` against a synthetic week with a 4-man west PM rule + 3-man west spec rule + 4-man shared east rule; print per-day `hours used / hours max` per berth; confirm **no day exceeds its wallet** and reach stackers appear as 8h+4h pairs of jobs.
- [x] **Step 3:** Update `CLAUDE.md` (keep < 8KB, overflow → `HISTORY.md`): the hours-cap item in "What Needs Work" moves to What's Working; note deleted constants; the parked items stay (INS/ACD direction, nested packages, rank-within-urgent, ECH 4-man figure).
- [x] **Step 4:** Save the session summary to `~/Documents/second-brain/raw/` per standing rule.
- [x] **Step 5:** Report to Ali with the before/after of the same week. NO commit — Ali decides.

---

## Follow-up plans (deliberately out of scope here)

- **Plan 2 — the evening truth:** worker's `remaining_hours` on "Could not finish"; carry-over books remaining hours and MERGES with a planned continuation; the domino re-shuffle inside the daily review (preview + one Submit); target-day wallet check. Files: `app/api/work_plan_tracking.py`, review UI.
  **Added scope (found shipping Plan 1):** split PMs put TWO WorkPlanJob rows with the same `sap_order_number` in one plan. `sap_carry_over._job_for` and the removal-rules reconciliation look jobs up by that number with `.first()` — when SAP closes a split order or the week ends mid-split, only one half is seen. Degrades to "handled one of two", not corruption, and only affects plans generated after deploy — but Plan 2 must make both lookups split-aware.
- **Plan 3 — the taps:** Telegram inline-button approvals: finished-early backfill ask, urgent-on-full-day proposal. Files: `app/services/telegram/*`, `app/api/telegram.py`.

## Self-review notes

- Spec coverage: day budget ✅ (T2/T3), one-wallet east ✅ (T2/T3), crew curves + urgent crews ✅ (T1/T3g/T4), multi-day split ✅ (T3f), old rules deleted ✅ (T3j), maintenance-crew assignment ✅ (T4), AC untouched ✅ (constraints + T3d), night excluded ✅ (T2). Evening/Telegram → Plans 2–3 by design.
- Type consistency: `build_week_wallets(plan, days)` used identically in T2 tests and T3c; `bundle_man_hours(bundle)` defined T3a, mutated T3-step5; `pm_hours(family, crew, description)` signature unchanged from the shipped module.
- Known risk: `capacity_utilization` shape is consumed by the web planner — T3i keeps legacy keys populated; verify with grep during T3 before deleting anything the UI reads.
