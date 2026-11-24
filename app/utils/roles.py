"""Who may do what in work planning — each list written ONCE.

These were pasted into four files and kept equal by hand (knot report
2026-11-24). Change a list here and the web board, the phone, the API and the
Telegram bot all follow. The web board's supervisor dropdown mirrors
SUPERVISOR_ROLES; `tests/test_roles_single_source.py` fails if they drift.
"""

# Roles allowed to touch work planning. Deliberately NOT quality_engineer:
# QEs review work, they do not author plans. Nobody holds it as a primary role
# today (it exists only as the auto-paired minor role of engineer, see
# User.get_minor_role), so removing it locks nobody out — but _log_excluded_roles()
# at startup will shout if that ever stops being true. The Telegram bot uses the
# same list: its allowlist says who may TALK to the bot, a different question
# from who may plan.
PLANNING_ROLES = ('admin', 'engineer')

SUPERVISOR_ROLES = ('engineer', 'admin', 'specialist', 'maintenance')
"""Who may be named as a job's supervisor.

Ali, 2026-09-23: "we need to have the option to have supervisor for the job".
He chose a watcher rather than a worker — responsible for the job, doing none of
its lines — and chose that ANY senior person may do it, not only an engineer.
SAP's 685 MES-SUPV operations say supervision is real yard work.

THE FIELD IS STILL CALLED engineer_id, AND DELIBERATELY SO. Nothing in the
backend ever read it — it was set, stored and displayed — so it was free to
become this rather than earn a second column beside it. Two records of one fact
is what this codebase keeps refusing. Renaming the wire contract would buy
nothing and break the mobile payload until an OTA; only the DISPLAY says
"Supervisor".
"""

# The people the board lets a planner drag onto a job — and exactly the list
# /users/for-assignment returns. Offering a man the save would refuse is the
# bug that cost a morning on the inspection assignment page.
CREW_ROLES = ('inspector', 'specialist', 'maintenance', 'engineer', 'admin')
