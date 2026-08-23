"""
Building the week from the phone.

The one mutating thing the bot does, and deliberately the ONLY one for now.
Generating is safe in a way nothing else is: it produces a DRAFT, nobody is
notified, no worker sees it, and a single /undo removes it. Everything else the
bot could do — moving a job, reassigning a man — changes a plan somebody may
already be reading.

PUBLISHING IS NOT HERE AND WILL NOT BE. Publishing notifies every assigned
worker and turns the plan into instructions. It stays a deliberate act at a
computer, which also caps the damage if the allowlist is ever defeated.

Runs in-process rather than over HTTP: the bot lives inside this same Flask
app, so calling the generator service directly avoids minting a token to call
ourselves. The role check that the HTTP layer would have applied is therefore
made explicitly here — the bot must never be a way around a permission.
"""

import logging
from datetime import timedelta

from app.extensions import db
from app.models import WorkPlan, WorkPlanDay
from app.utils.decorators import planning_today

logger = logging.getLogger(__name__)

# Same two roles the web planner enforces. Stated here rather than assumed from
# the allowlist: the allowlist says who may TALK to the bot, which is a
# different question from who may plan.
PLANNING_ROLES = ('admin', 'engineer')

RECIPES = ('priority_first', 'travel_optimized', 'team_balanced',
           'pm_compliance', 'copy_last_week')

MESSAGES = {
    'en': {
        'denied': 'Only engineers and admins can generate a plan.',
        'published': ('That week is already published, so it cannot be '
                      'regenerated from here. Un-publish it in the planner first.'),
        'empty_pool': ('The job box is empty, so there is nothing to plan. '
                       'Send /pool to see why.'),
        'working': 'Building {week}… this takes up to a minute.',
        'done': 'Plan built for {week}: {jobs} jobs across {days} days.',
        'nothing': ('Nothing was scheduled. The box has {pool} jobs, but none '
                    'of them fit this week — check capacity and worker rules.'),
        'failed': 'Could not build the plan: {error}',
        'undone': 'Removed everything the generator added. The box has them back.',
        'nothing_to_undo': 'There is nothing from the generator to remove.',
        'draft_note': 'This is a DRAFT. Nobody has been told. Publish in the planner.',
        'bad_recipe': 'I do not know that recipe. Try: ' + ', '.join(RECIPES),
    },
    'ar': {
        'denied': 'فقط المهندسون والمدراء يمكنهم إنشاء الخطة.',
        'published': ('هذا الأسبوع منشور بالفعل ولا يمكن إعادة إنشائه من هنا. '
                      'ألغِ النشر من المخطط أولاً.'),
        'empty_pool': ('صندوق المهام فارغ، لا يوجد ما يُخطط له. '
                       'أرسل /pool لمعرفة السبب.'),
        'working': 'جارٍ بناء {week}… قد يستغرق دقيقة.',
        'done': 'تم بناء خطة {week}: {jobs} مهمة على {days} أيام.',
        'nothing': ('لم تتم جدولة أي شيء. الصندوق يحتوي {pool} مهمة لكن لا شيء '
                    'منها يناسب هذا الأسبوع — راجع السعة وقواعد العمال.'),
        'failed': 'تعذّر بناء الخطة: {error}',
        'undone': 'تم حذف كل ما أضافه المولّد. عادت المهام إلى الصندوق.',
        'nothing_to_undo': 'لا يوجد شيء من المولّد لحذفه.',
        'draft_note': 'هذه مسودة. لم يُبلَّغ أحد. انشرها من المخطط.',
        'bad_recipe': 'لا أعرف هذه الطريقة. جرّب: ' + ', '.join(RECIPES),
    },
}


def _t(language, key, **fields):
    text = MESSAGES.get(language, MESSAGES['en']).get(key, MESSAGES['en'][key])
    return text.format(**fields) if fields else text


def _week_start_for(target):
    """Monday of the target's week — the planner's own convention."""
    return target - timedelta(days=target.weekday())


def ensure_plan(target, user):
    """The plan covering `target`, created empty if it does not exist yet.

    Creating it here rather than making Ali open the planner first is the whole
    point: "plan this week" should not require a laptop to get started.
    """
    plan = WorkPlan.query.filter(WorkPlan.week_start <= target,
                                 WorkPlan.week_end >= target).first()
    if plan:
        return plan, False

    week_start = _week_start_for(target)
    plan = WorkPlan(week_start=week_start, week_end=week_start + timedelta(days=6),
                    status='draft', created_by_id=user.id)
    db.session.add(plan)
    db.session.flush()
    for offset in range(7):
        db.session.add(WorkPlanDay(work_plan_id=plan.id,
                                   date=week_start + timedelta(days=offset)))
    db.session.commit()
    return plan, True


def pool_size():
    from app.models import SAPWorkOrder
    return SAPWorkOrder.query.filter(SAPWorkOrder.work_plan_id.is_(None),
                                     SAPWorkOrder.status == 'pending').count()


def generate(user, language='en', recipe='priority_first', when=None):
    """Build the week. Returns a list of message chunks.

    Never raises: a failure here has to come back as words on a phone, because
    a bot that goes silent is indistinguishable from a bot that is blocked.
    """
    from app.services.telegram.renderer import render_week

    if getattr(user, 'role', None) not in PLANNING_ROLES:
        return [_t(language, 'denied')]

    if recipe not in RECIPES:
        return [_t(language, 'bad_recipe')]

    waiting = pool_size()
    if not waiting:
        # Said before doing anything, because the generator would otherwise
        # succeed at producing an empty week and look like it worked.
        return [_t(language, 'empty_pool')]

    target = when or planning_today()
    plan, _created = ensure_plan(target, user)

    if plan.status == 'published':
        # Regenerating a published week would silently change work people have
        # already been told to do.
        return [_t(language, 'published')]

    week = f'{plan.week_start.isoformat()} → {plan.week_end.isoformat()}'

    plan_id = plan.id
    try:
        from app.services.work_plan_generator_service import WorkPlanGeneratorService
        WorkPlanGeneratorService.generate_plan(plan_id=plan_id, recipe=recipe)
    except Exception as e:  # noqa: BLE001
        # ROLLBACK FIRST, and use the id captured before the call.
        #
        # A failed flush leaves the session unusable, so touching plan.id here
        # re-raised PendingRollbackError from inside the handler — the error
        # reporter became a second error, and the real UniqueViolation was
        # swallowed by the outer catch-all. The message on the phone said
        # "something went wrong" precisely because the code meant to explain it
        # had crashed.
        db.session.rollback()
        logger.exception('Telegram plan generation failed for plan %s', plan_id)
        return [_t(language, 'failed', error=f'{type(e).__name__}: {e}'[:400])]

    db.session.expire_all()
    plan = db.session.get(WorkPlan, plan_id)
    jobs = sum(len(day.jobs or []) for day in plan.days)

    if not jobs:
        return [_t(language, 'nothing', pool=waiting)]

    head = _t(language, 'done', week=week, jobs=jobs, days=len(plan.days))
    return [head] + render_week(plan, language) + [_t(language, 'draft_note')]


def undo(user, language='en', when=None):
    """Remove everything the generator added, putting the jobs back in the box."""
    if getattr(user, 'role', None) not in PLANNING_ROLES:
        return [_t(language, 'denied')]

    target = when or planning_today()
    plan = WorkPlan.query.filter(WorkPlan.week_start <= target,
                                 WorkPlan.week_end >= target).first()
    if not plan:
        return [_t(language, 'nothing_to_undo')]
    if plan.status == 'published':
        return [_t(language, 'published')]

    plan_id = plan.id
    try:
        from app.services.work_plan_generator_service import WorkPlanGeneratorService
        WorkPlanGeneratorService.reject_generation(plan_id)
    except Exception as e:  # noqa: BLE001
        db.session.rollback()
        logger.exception('Telegram undo failed for plan %s', plan_id)
        return [_t(language, 'failed', error=f'{type(e).__name__}: {e}'[:400])]

    return [_t(language, 'undone')]
