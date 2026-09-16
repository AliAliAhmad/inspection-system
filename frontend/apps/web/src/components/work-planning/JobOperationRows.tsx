/**
 * The operations of an order, indented under the job card on the board.
 *
 * Ali, 2026-09-15: "now the operation is showing inside the job detail, is thier
 * a way to be shown also when under the job father with an indent, so i can
 * easly assign people".
 *
 * Before this they lived only in Job Details, so knowing an order needed a
 * mechanic AND an electrician meant opening it first — which is exactly what
 * made assigning slow.
 *
 * EACH ROW IS ITS OWN DROP TARGET. Dropping a person on one puts him on that
 * line; the server also puts him on the JOB, because /my-plan finds a worker's
 * week through the job's assignments and a man placed only on a line would see
 * nothing at all.
 *
 * The row is nested INSIDE a card that is itself draggable between days, so it
 * declares `type: 'operation'` and dnd-kit resolves to the innermost target.
 */
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Tooltip, Typography } from 'antd';
import type { JobSubTask, WorkPlanJob } from '@inspection/shared';

const { Text } = Typography;

const TRADE_COLOR: Record<string, string> = {
  MECH: '#1890ff',
  ELEC: '#fa8c16',
  ELME: '#722ed1',
  SUPV: '#8c8c8c',
};

/**
 * Does this line belong to the crew whose section we are drawing?
 *
 * Ali, 2026-09-16: "now mechanical and electrical get all the operation
 * whatever is mech or electrical, electrical side should show electrical
 * operation and the mechanical side should show the mechanical ones".
 *
 * An order needing both trades is listed under BOTH headings on the card — that
 * is right, both crews must see the job. But it was showing EVERY line in both
 * places, so an electrician read three mechanical lines to find his one.
 *
 * The rule is the one the worker's phone already uses:
 *
 *   * a line of this crew's trade          -> show it
 *   * ELME, needing both                   -> show it to both
 *   * SUPV, or a code nobody has explained -> show it to EVERYONE
 *
 * That last case is deliberate. `MES-WELD` is kept untranslated on purpose so
 * somebody asks about it, and matching it against a trade would hide it from
 * both crews — a line belonging to nobody instead of everybody.
 */
const belongsToTrade = (op: JobSubTask, trade?: 'mech' | 'elec') => {
  if (!trade) return true;
  const wc = (op.work_center || '').toUpperCase();
  if (wc !== 'MECH' && wc !== 'ELEC') return true;
  return wc === (trade === 'mech' ? 'MECH' : 'ELEC');
};

const initialsOf = (name?: string | null) =>
  (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const OperationRow: React.FC<{
  op: JobSubTask;
  job: WorkPlanJob;
  dayId: number;
}> = ({ op, job, dayId }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `operation-${op.id}`,
    data: { type: 'operation', operation: op, job, dayId },
  });

  const done = op.is_done || op.status === 'completed';
  const gone = op.status === 'removed_in_sap';
  const trade = op.work_center || '';
  const manual = (op.source || 'manual') !== 'sap';

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        // The indent Ali asked for, plus a rule so the eye follows the nesting.
        paddingLeft: 18, paddingRight: 4, paddingTop: 1, paddingBottom: 1,
        // Nothing may spill out of a 160px column.
        overflow: 'hidden',
        borderLeft: '2px solid #f0f0f0',
        marginLeft: 12,
        background: isOver ? '#e6f7ff' : 'transparent',
        opacity: gone ? 0.55 : 1,
        borderRadius: 2,
      }}
    >
      {/* Ali, 2026-09-16: "i just need to know the operation that displayed in
          the day are the ones added manual or the ones comming from the sap?"
          Both are shown. A hand-typed one is marked, because a re-sync can never
          touch it and that is worth seeing at a glance. */}
      <Text style={{ fontSize: 10, fontWeight: 700, flexShrink: 0,
                     whiteSpace: 'nowrap',
                     color: manual ? '#722ed1' : '#8c8c8c' }}>
        {manual ? '✎' : ''}{op.operation_number}
      </Text>
      {/* Who ticked it matters: "done by Hassan" and "marked by Ali" are
          different facts. The row is too narrow to print a name, so the struck
          -through text carries it. */}
      <Tooltip title={done && op.done_by_name ? `Done — ${op.done_by_name}` : undefined}>
        <Text
          style={{
            fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            // minWidth:0 is what stops the letters stacking VERTICALLY.
            //
            // Ali, 2026-09-16: "the word leters come verticall and not
            // professional". A flex item defaults to min-width:auto, so it
            // refuses to shrink below its own text however narrow the column
            // gets — and everything BESIDE it is squeezed to a few pixels
            // instead, where a word has nowhere to go but downwards, one letter
            // per line. The ellipsis above only works once this lets it shrink.
            minWidth: 0,
            textDecoration: done ? 'line-through' : undefined,
            color: done ? '#8c8c8c' : '#434343',
          }}
        >
          {op.content}
        </Text>
      </Tooltip>

      {op.waiting_on_material && (
        <Tooltip title={`Waiting for material${op.purchase_requisition ? ` — PR ${op.purchase_requisition}` : ''}`}>
          <span style={{ fontSize: 9, color: '#d46b08', flexShrink: 0 }}>⏳</span>
        </Tooltip>
      )}
      {gone && (
        <Tooltip title="SAP no longer sends this line — kept because there is work on it">
          <span style={{ fontSize: 9, color: '#bfbfbf', flexShrink: 0 }}>⊘</span>
        </Tooltip>
      )}

      {!!trade && (
        <span style={{
          fontSize: 9, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
          color: TRADE_COLOR[trade] || '#595959',
        }}>
          {trade}
        </span>
      )}
      {op.planned_hours != null && (
        <Text style={{ fontSize: 9, color: '#8c8c8c', flexShrink: 0,
                       whiteSpace: 'nowrap' }}>
          {op.planned_hours.toFixed(1)}h
        </Text>
      )}

      {/* RULE A. A name means the line is his; no name means the TEAM — whoever
          is on the order. A blank used to say neither. */}
      {(op.assignees || []).length > 0 ? (
        (op.assignees || []).map((a) => (
          <Tooltip key={a.id} title={a.user_name || 'User'}>
            <div style={{
              width: 15, height: 15, borderRadius: '50%', fontSize: 8, fontWeight: 700,
              background: '#52c41a', color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {initialsOf(a.user_name)}
            </div>
          </Tooltip>
        ))
      ) : (
        <Tooltip title="Nobody in particular — the job's team does this line">
          <Text style={{ fontSize: 8, color: '#bfbfbf', flexShrink: 0,
                         whiteSpace: 'nowrap' }}>team</Text>
        </Tooltip>
      )}
    </div>
  );
};

export const JobOperationRows: React.FC<{
  operations?: JobSubTask[];
  job: WorkPlanJob;
  dayId: number;
  /**
   * Which crew's section this is being drawn under. Omitted, every line shows —
   * which is right for a card with no trade sections at all.
   */
  trade?: 'mech' | 'elec';
  /**
   * Is this day opened wide?
   *
   * A RETRACTED day shows NOTHING of this component. Ali, 2026-09-16: "still
   * when the day is retracted and the job or eqt bulk jobs is expanded the day
   * become a mess".
   *
   * A one-line summary was tried first and was still too much. The arithmetic
   * says why: seven days share the board beside a 300px pool, so a column is
   * ~160px, and a job row inside an expanded bundle has about 105px left after
   * the card, block, row and handle have taken theirs. A job needing both trades
   * is also drawn TWICE — once under each heading — so three such jobs become
   * six rows before anything of ours is added.
   *
   * Defaults to false, so a caller that forgets to pass it shows nothing rather
   * than something broken.
   */
  dayExpanded?: boolean;
}> = ({ operations, job, dayId, dayExpanded = false, trade }) => {
  if (!dayExpanded) return null;
  const mine = (operations || []).filter((op) => belongsToTrade(op, trade));
  if (mine.length === 0) return null;
  return (
    <div style={{ marginTop: 2, marginBottom: 2 }}>
      {mine.map((op) => (
        <OperationRow key={op.id} op={op} job={job} dayId={dayId} />
      ))}
    </div>
  );
};

export default JobOperationRows;
