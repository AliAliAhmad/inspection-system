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

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        // The indent Ali asked for, plus a rule so the eye follows the nesting.
        paddingLeft: 18, paddingRight: 4, paddingTop: 1, paddingBottom: 1,
        borderLeft: '2px solid #f0f0f0',
        marginLeft: 12,
        background: isOver ? '#e6f7ff' : 'transparent',
        opacity: gone ? 0.55 : 1,
        borderRadius: 2,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: 700, color: '#8c8c8c', flexShrink: 0 }}>
        {op.operation_number}
      </Text>
      <Text
        style={{
          fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textDecoration: done ? 'line-through' : undefined,
          color: done ? '#8c8c8c' : '#434343',
        }}
      >
        {op.content}
      </Text>

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
          fontSize: 9, fontWeight: 700, flexShrink: 0,
          color: TRADE_COLOR[trade] || '#595959',
        }}>
          {trade}
        </span>
      )}
      {op.planned_hours != null && (
        <Text style={{ fontSize: 9, color: '#8c8c8c', flexShrink: 0 }}>
          {op.planned_hours.toFixed(1)}h
        </Text>
      )}

      {/* Who is on this line. Empty is the normal state, and drawing nothing
          keeps the row quiet until somebody is put there. */}
      {(op.assignees || []).map((a) => (
        <Tooltip key={a.id} title={a.user_name || 'User'}>
          <div style={{
            width: 15, height: 15, borderRadius: '50%', fontSize: 8, fontWeight: 700,
            background: '#52c41a', color: '#fff', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {initialsOf(a.user_name)}
          </div>
        </Tooltip>
      ))}
    </div>
  );
};

export const JobOperationRows: React.FC<{
  operations?: JobSubTask[];
  job: WorkPlanJob;
  dayId: number;
}> = ({ operations, job, dayId }) => {
  if (!operations || operations.length === 0) return null;
  return (
    <div style={{ marginTop: 2, marginBottom: 2 }}>
      {operations.map((op) => (
        <OperationRow key={op.id} op={op} job={job} dayId={dayId} />
      ))}
    </div>
  );
};

export default JobOperationRows;
