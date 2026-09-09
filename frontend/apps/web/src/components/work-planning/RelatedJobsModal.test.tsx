import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RelatedJobsModal } from './RelatedJobsModal';
import type { RelatedJobCandidate } from '@inspection/shared';

/**
 * Ali, 2026-09-09: "i need the app to ask me if i need to transfer all jobs or
 * only this job, better that the app can display all the job and i select from
 * them what i need to load in the day, with button for only this job or all jobs".
 *
 * The server side is covered by tests/test_related_jobs_choice.py. This covers
 * the part a planner actually touches: what the three buttons hand back.
 */

const CANDIDATES: RelatedJobCandidate[] = [
  { kind: 'sap', id: 11, description: '2000HR service', estimated_hours: 6,
    reference: '700000009005', job_type: 'pm', severity: null },
  { kind: 'defect', id: 22, description: 'Hydraulic leak', estimated_hours: 2,
    reference: null, severity: 'critical' },
  { kind: 'defect', id: 33, description: 'Worn brake pad', estimated_hours: 2,
    reference: null, severity: 'low' },
];

const setup = (overrides: Partial<React.ComponentProps<typeof RelatedJobsModal>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <RelatedJobsModal
      open
      candidates={CANDIDATES}
      equipmentName="RS109"
      dayLabel="Mon 15 Sep"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
};

// The row checkboxes, in list order — the header "Select all" is excluded.
const rowBoxes = () => {
  const boxes = screen.getAllByRole('checkbox');
  return boxes.slice(1);
};

beforeEach(() => vi.clearAllMocks());

describe('the "also on this machine?" question', () => {
  it('lists every related job with what it costs the day', () => {
    setup();
    expect(screen.getByText('2000HR service')).toBeInTheDocument();
    expect(screen.getByText('Hydraulic leak')).toBeInTheDocument();
    expect(screen.getByText('Worn brake pad')).toBeInTheDocument();
    // Capacity is the whole game on this board.
    expect(screen.getByText(/10\.0h selected of 10\.0h/)).toBeInTheDocument();
  });

  it('opens with everything ticked, so "All jobs" stays one tap', () => {
    setup();
    for (const box of rowBoxes()) expect(box).toBeChecked();
    expect(screen.getByRole('button', { name: /All jobs \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add selected \(3\)/ })).toBeInTheDocument();
  });

  it('says out loud that the dragged job is already placed', () => {
    setup();
    // Without this line the window reads like the drop failed and is asking
    // permission to retry.
    expect(screen.getByText(/already on the day/i)).toBeInTheDocument();
  });
});

describe('what each button hands back', () => {
  it('"All jobs" returns every candidate, ticked or not', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(rowBoxes()[0]);                 // untick one on purpose
    await user.click(screen.getByRole('button', { name: /All jobs/ }));
    expect(onConfirm).toHaveBeenCalledWith(CANDIDATES);
  });

  it('"Add selected" returns only the ticked ones', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(rowBoxes()[0]);                 // drop the 6h service
    await user.click(screen.getByRole('button', { name: /Add selected \(2\)/ }));

    const chosen = onConfirm.mock.calls[0][0] as RelatedJobCandidate[];
    expect(chosen.map((c) => c.id)).toEqual([22, 33]);
  });

  it('"Only this job" adds nothing — it just closes', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: /Only this job/ }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot add nothing — "Add selected" is dead with an empty list', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole('checkbox')[0]);   // "Select all" off
    expect(screen.getByRole('button', { name: /Add selected \(0\)/ })).toBeDisabled();
  });
});

describe('the running total', () => {
  it('follows the ticks, so the cost of the day is never a surprise', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(rowBoxes()[0]);                 // 6h off
    expect(screen.getByText(/4\.0h selected of 10\.0h/)).toBeInTheDocument();
  });
});

describe('while it is working', () => {
  it('locks every button so a slow yard connection cannot double-add', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: /Only this job/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /All jobs/ })).toBeDisabled();
  });
});
