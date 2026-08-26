"""One material per kit — enforced by the database

Ali's eight production kits hold SIX duplicate rows, and some of them
contradict each other:

    kit 4 (2000 Hrs-RS-DRG450)  CO01-C014-003 Engine oil 15w40  65 LTR
    kit 4 (2000 Hrs-RS-DRG450)  CO01-C014-003 Engine oil 15w40  45 LTR

The storeman reading that kit sees engine oil twice, at two different amounts,
and nothing on the page says which is right.

It was possible because `material_kit_items` has no unique constraint on
(kit_id, material_id). Its sister table `job_template_materials` has had one
all along:

    UniqueConstraint('template_id', 'material_id', name='unique_template_material')

This adds the same. The de-duplication is deterministic — LOWEST id survives —
and the survivors' quantities are rewritten immediately afterwards by
`flask seed-material-kits --apply`, so which one wins here does not decide
anything; it only has to be repeatable.

`batch_alter_table` because SQLite cannot ALTER TABLE ADD CONSTRAINT, and the
whole test suite runs on SQLite.

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
"""
import logging

import sqlalchemy as sa
from alembic import op

revision = 't0u1v2w3x4y5'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None

logger = logging.getLogger('alembic.runtime.migration')


def upgrade():
    bind = op.get_bind()

    doomed = bind.execute(sa.text("""
        SELECT id, kit_id, material_id, quantity FROM material_kit_items
        WHERE id NOT IN (
            SELECT MIN(id) FROM material_kit_items GROUP BY kit_id, material_id
        )
    """)).fetchall()

    # Say what is being dropped. A migration that silently deletes rows is how
    # a real quantity disappears and nobody can say when.
    for row in doomed:
        logger.info('material_kit_items: dropping duplicate id=%s kit=%s '
                    'material=%s qty=%s', row[0], row[1], row[2], row[3])
    if doomed:
        logger.info('material_kit_items: %d duplicate rows removed', len(doomed))
        bind.execute(sa.text(
            'DELETE FROM material_kit_items WHERE id IN :ids'
        ).bindparams(sa.bindparam('ids', [r[0] for r in doomed], expanding=True)))

    with op.batch_alter_table('material_kit_items') as batch:
        batch.create_unique_constraint('unique_kit_material',
                                       ['kit_id', 'material_id'])


def downgrade():
    # The deleted duplicates are not restored — they were contradictions, and
    # `seed-material-kits` is the source of truth for these rows now.
    with op.batch_alter_table('material_kit_items') as batch:
        batch.drop_constraint('unique_kit_material', type_='unique')
