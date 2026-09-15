/**
 * Operations indented under their job, each its own drop target.
 *
 * Ali, 2026-09-15: "is thier a way to be shown also when under the job father
 * with an indent, so i can easly assign people".
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { JobSubTask, WorkPlanJob } from '@inspection/shared';

const droppableCalls: any[] = [];
vi.mock('@dnd-kit/core', () => ({
  useDroppable: (args: any) => {
    droppableCalls.push(args);
    return { setNodeRef: () => {}, isOver: false };
  },
}));

import { JobOperationRows } from './JobOperationRows';

const op = (over: Partial<JobSubTask> = {}): JobSubTask => ({
  id: 1, content: 'Check the spreader', is_done: false,
  anchor_kind: 'sap', anchor_key: '700000123456',
  created_by_id: 1, created_by_name: 'Ali', done_by_id: null,
  done_by_name: null, done_at: null, created_at: null,
  attachment_kind: null, attachment_url: null,
  source: 'sap', operation_number: '0010', work_center: 'MECH',
  planned_hours: 2, assignees: [],
  ...over,
} as JobSubTask);

const JOB = { id: 7 } as WorkPlanJob;

describe('JobOperationRows', () => {
  it('draws nothing at all when the order has no operations', () => {
    const { container } = render(<JobOperationRows operations={[]} job={JOB} dayId={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the number, the text, the trade and the hours', () => {
    render(<JobOperationRows operations={[op()]} job={JOB} dayId={3} />);
    expect(screen.getByText('0010')).toBeInTheDocument();
    expect(screen.getByText('Check the spreader')).toBeInTheDocument();
    expect(screen.getByText('MECH')).toBeInTheDocument();
    expect(screen.getByText('2.0h')).toBeInTheDocument();
  });

  it('shows the initials of whoever is on that line', () => {
    render(<JobOperationRows job={JOB} dayId={3} operations={[op({
      assignees: [{ id: 1, task_id: 1, user_id: 9, user_name: 'Hassan Ali' }],
    })]} />);
    expect(screen.getByText('HA')).toBeInTheDocument();
  });

  it('registers each row as its OWN drop target', () => {
    droppableCalls.length = 0;
    render(<JobOperationRows job={JOB} dayId={3} operations={[
      op({ id: 11 }), op({ id: 12, operation_number: '0020' }),
    ]} />);
    expect(droppableCalls.map((c) => c.id)).toEqual(['operation-11', 'operation-12']);
    // The id PREFIX is what the board's collision priority matches on. Change it
    // here and a drop on a line silently assigns the whole order instead.
    expect(droppableCalls[0].data.type).toBe('operation');
    expect(droppableCalls[0].data.job).toBe(JOB);
  });
});
