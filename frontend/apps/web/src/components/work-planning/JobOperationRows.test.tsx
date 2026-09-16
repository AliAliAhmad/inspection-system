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
    render(<JobOperationRows operations={[op()]} job={JOB} dayId={3} dayExpanded />);
    expect(screen.getByText('0010')).toBeInTheDocument();
    expect(screen.getByText('Check the spreader')).toBeInTheDocument();
    expect(screen.getByText('MECH')).toBeInTheDocument();
    expect(screen.getByText('2.0h')).toBeInTheDocument();
  });

  it('shows the initials of whoever is on that line', () => {
    render(<JobOperationRows job={JOB} dayId={3} dayExpanded operations={[op({
      assignees: [{ id: 1, task_id: 1, user_id: 9, user_name: 'Hassan Ali' }],
    })]} />);
    expect(screen.getByText('HA')).toBeInTheDocument();
  });

  it('registers each row as its OWN drop target', () => {
    droppableCalls.length = 0;
    render(<JobOperationRows job={JOB} dayId={3} dayExpanded operations={[
      op({ id: 11 }), op({ id: 12, operation_number: '0020' }),
    ]} />);
    expect(droppableCalls.map((c) => c.id)).toEqual(['operation-11', 'operation-12']);
    // The id PREFIX is what the board's collision priority matches on. Change it
    // here and a drop on a line silently assigns the whole order instead.
    expect(droppableCalls[0].data.type).toBe('operation');
    expect(droppableCalls[0].data.job).toBe(JOB);
  });

  describe('a retracted day column', () => {
    /**
     * Ali, 2026-09-15: "the operations are shown very good when the day is
     * expand when is retrakted it ruin the day". Seven days share the board, so
     * a retracted column is about 160px — no room for a row that needs a number,
     * text, a trade, hours and initials after 30px of indent.
     */
    it('shows ONE summary line instead of every row', () => {
      render(<JobOperationRows job={JOB} dayId={3} operations={[
        op({ id: 21, is_done: true }),
        op({ id: 22, operation_number: '0020', work_center: 'ELEC' }),
        op({ id: 23, operation_number: '0030' }),
      ]} />);

      expect(screen.getByText('1/3')).toBeInTheDocument();
      // The trades are the point: does this order need an electrician?
      expect(screen.getByText('M')).toBeInTheDocument();
      expect(screen.getByText('E')).toBeInTheDocument();
      // ...and NOT the rows themselves.
      expect(screen.queryByText('Check the spreader')).not.toBeInTheDocument();
      expect(screen.queryByText('0010')).not.toBeInTheDocument();
    });

    it('registers NO drop targets — there is nothing to drop onto', () => {
      droppableCalls.length = 0;
      render(<JobOperationRows job={JOB} dayId={3} operations={[op(), op({ id: 2 })]} />);
      expect(droppableCalls).toEqual([]);
    });

    it('counts a line needing BOTH trades as each of them', () => {
      render(<JobOperationRows job={JOB} dayId={3}
                               operations={[op({ work_center: 'ELME' })]} />);
      expect(screen.getByText('M')).toBeInTheDocument();
      expect(screen.getByText('E')).toBeInTheDocument();
    });

    it('does not let supervision claim a trade', () => {
      // SUPV is the LARGEST group in the real data (685 of 1,560). Counting it
      // would put a letter on nearly every order and say nothing.
      render(<JobOperationRows job={JOB} dayId={3}
                               operations={[op({ work_center: 'SUPV' })]} />);
      expect(screen.queryByText('M')).not.toBeInTheDocument();
      expect(screen.queryByText('E')).not.toBeInTheDocument();
      expect(screen.getByText('0/1')).toBeInTheDocument();
    });

    it('still says nothing at all when the order has no operations', () => {
      const { container } = render(<JobOperationRows operations={[]} job={JOB} dayId={3} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('each crew sees its own lines', () => {
    /**
     * Ali, 2026-09-16: "now mechanical and electrical get all the operation
     * whatever is mech or electrical, electrical side should show electrical
     * operation and the mechanical side should show the mechanical ones".
     *
     * An order needing both trades is listed under BOTH headings — right, both
     * crews must see the job — but every line was drawn in both places, so an
     * electrician read three mechanical lines to find his one.
     */
    const MIXED = [
      op({ id: 31, content: 'Check spreader', work_center: 'MECH' }),
      op({ id: 32, content: 'Replace harness', work_center: 'ELEC' }),
      op({ id: 33, content: 'Needs both', work_center: 'ELME' }),
      op({ id: 34, content: 'Supervise', work_center: 'SUPV' }),
      op({ id: 35, content: 'Weld it', work_center: 'MES-WELD' }),
    ];

    it('the mechanical section hides the electrical line', () => {
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded trade="mech"
                               operations={MIXED} />);
      expect(screen.getByText('Check spreader')).toBeInTheDocument();
      expect(screen.queryByText('Replace harness')).not.toBeInTheDocument();
    });

    it('the electrical section hides the mechanical line', () => {
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded trade="elec"
                               operations={MIXED} />);
      expect(screen.getByText('Replace harness')).toBeInTheDocument();
      expect(screen.queryByText('Check spreader')).not.toBeInTheDocument();
    });

    it('a line needing BOTH trades shows to both', () => {
      const mech = render(<JobOperationRows job={JOB} dayId={3} dayExpanded
                                            trade="mech" operations={MIXED} />);
      expect(mech.getByText('Needs both')).toBeInTheDocument();
      mech.unmount();
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded trade="elec"
                               operations={MIXED} />);
      expect(screen.getByText('Needs both')).toBeInTheDocument();
    });

    it('supervision and an unexplained code show to EVERYONE', () => {
      // MES-WELD is kept untranslated on purpose so somebody asks about it.
      // Matching it against a trade would hide it from both crews — a line
      // belonging to nobody instead of everybody.
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded trade="elec"
                               operations={MIXED} />);
      expect(screen.getByText('Supervise')).toBeInTheDocument();
      expect(screen.getByText('Weld it')).toBeInTheDocument();
    });

    it('draws nothing when this crew has no line on the order', () => {
      const { container } = render(
        <JobOperationRows job={JOB} dayId={3} dayExpanded trade="elec"
                          operations={[op({ work_center: 'MECH' })]} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('the retracted summary counts only this crew\'s lines', () => {
      render(<JobOperationRows job={JOB} dayId={3} trade="mech" operations={MIXED} />);
      // MECH + ELME + SUPV + MES-WELD = 4 of the 5, none done.
      expect(screen.getByText('0/4')).toBeInTheDocument();
    });

    it('no trade given shows every line', () => {
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded operations={MIXED} />);
      expect(screen.getByText('Check spreader')).toBeInTheDocument();
      expect(screen.getByText('Replace harness')).toBeInTheDocument();
    });
  });

  describe('telling a hand-typed line from SAP\'s', () => {
    /** Ali, 2026-09-16: "i just need to know the operation that displayed in the
     *  day are the ones added manual or the ones comming from the sap?" */
    it('marks the one a person typed', () => {
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded
                               operations={[op({ source: 'manual', operation_number: '0900' })]} />);
      expect(screen.getByText('✎0900')).toBeInTheDocument();
    });

    it("leaves SAP's own line unmarked", () => {
      render(<JobOperationRows job={JOB} dayId={3} dayExpanded operations={[op()]} />);
      expect(screen.getByText('0010')).toBeInTheDocument();
      expect(screen.queryByText('✎0010')).not.toBeInTheDocument();
    });
  });
});
