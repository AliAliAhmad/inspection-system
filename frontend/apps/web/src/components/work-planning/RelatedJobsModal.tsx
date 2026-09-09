import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Checkbox, Button, Typography, Tag, Space, Alert } from 'antd';
import type { RelatedJobCandidate } from '@inspection/shared';

const { Text } = Typography;

/**
 * "Only this job, or all of them?"
 *
 * Ali, 2026-09-09: "when i drag any job from the pool to the card it bring with
 * it all the jobs related to the reference machine, what i need, the app to ask
 * me if i need to transfer all jobs or only this job, better that the app can
 * display all the job and i select from them what i need to load in the day".
 *
 * WHY THE DRAGGED JOB IS ALREADY ON THE DAY WHEN THIS OPENS
 * =========================================================
 *
 * There is nothing to ask about the job he dragged — he dragged it. It lands
 * instantly, exactly as before, and this window asks only about the EXTRAS that
 * used to arrive uninvited. So closing this window with the X is not a cancelled
 * drag; it is "only this job", which is the safe answer.
 *
 * Every row is ticked when it opens, so "All jobs" is still one tap and the old
 * habit costs nothing. What changed is that it is now a decision instead of a
 * surprise.
 *
 * Hours are on every row because this board is about capacity. Deciding what to
 * pull into a Tuesday IS deciding what Tuesday costs, and a planner cannot judge
 * that from a list of names.
 */

interface RelatedJobsModalProps {
  open: boolean;
  /** The machine everything here belongs to. */
  equipmentName?: string;
  dayLabel?: string;
  candidates: RelatedJobCandidate[];
  /** Hours already booked on the target day, so the total means something. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (chosen: RelatedJobCandidate[]) => void;
}

const keyOf = (c: RelatedJobCandidate) => `${c.kind}:${c.id}`;

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'gold',
  low: 'default',
};

export const RelatedJobsModal: React.FC<RelatedJobsModalProps> = ({
  open,
  equipmentName,
  dayLabel,
  candidates,
  busy = false,
  onCancel,
  onConfirm,
}) => {
  const [checked, setChecked] = useState<string[]>([]);

  // Everything ticked each time it opens — see the note above about the habit.
  useEffect(() => {
    if (open) setChecked(candidates.map(keyOf));
  }, [open, candidates]);

  const chosen = useMemo(
    () => candidates.filter((c) => checked.includes(keyOf(c))),
    [candidates, checked],
  );

  const hoursOf = (list: RelatedJobCandidate[]) =>
    list.reduce((sum, c) => sum + (c.estimated_hours || 0), 0);

  const allKeys = candidates.map(keyOf);
  const allChecked = checked.length === allKeys.length && allKeys.length > 0;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      maskClosable={false}
      width={560}
      title={
        <span>
          Also on {equipmentName || 'this machine'}
          {dayLabel ? <Text type="secondary" style={{ fontWeight: 400 }}> → {dayLabel}</Text> : null}
        </span>
      }
      footer={[
        // Left-most and plainest: the safe answer, and what closing does too.
        <Button key="only" onClick={onCancel} disabled={busy}>
          Only this job
        </Button>,
        <Button
          key="selected"
          onClick={() => onConfirm(chosen)}
          disabled={busy || chosen.length === 0}
          loading={busy && chosen.length > 0 && !allChecked}
        >
          Add selected ({chosen.length})
        </Button>,
        <Button
          key="all"
          type="primary"
          onClick={() => onConfirm(candidates)}
          disabled={busy}
          loading={busy && allChecked}
        >
          All jobs ({candidates.length})
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={
          <Text style={{ fontSize: 12 }}>
            The job you dragged is already on the day. This is the other open
            work on the same machine — pick what should go with it.
          </Text>
        }
      />

      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <Checkbox
          indeterminate={checked.length > 0 && !allChecked}
          checked={allChecked}
          onChange={(e) => setChecked(e.target.checked ? allKeys : [])}
        >
          <Text style={{ fontSize: 12 }}>Select all</Text>
        </Checkbox>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {hoursOf(chosen).toFixed(1)}h selected of {hoursOf(candidates).toFixed(1)}h
        </Text>
      </div>

      <Checkbox.Group
        value={checked}
        onChange={(v) => setChecked(v as string[])}
        style={{ display: 'block', maxHeight: 340, overflowY: 'auto' }}
      >
        {candidates.map((c) => (
          <div
            key={keyOf(c)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 4px', borderBottom: '1px solid #f5f5f5',
            }}
          >
            <Checkbox value={keyOf(c)} style={{ marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, wordBreak: 'break-word' }}>
                {c.description || <Text type="secondary">(no description)</Text>}
              </div>
              <Space size={4} style={{ marginTop: 2 }} wrap>
                <Tag color={c.kind === 'sap' ? 'blue' : 'orange'} style={{ margin: 0, fontSize: 10 }}>
                  {c.kind === 'sap' ? (c.job_type || 'sap').toUpperCase() : 'DEFECT'}
                </Tag>
                {c.reference && (
                  <Text type="secondary" style={{ fontSize: 10 }}>{c.reference}</Text>
                )}
                {c.severity && (
                  <Tag color={SEVERITY_COLOR[c.severity] || 'default'} style={{ margin: 0, fontSize: 10 }}>
                    {c.severity.toUpperCase()}
                  </Tag>
                )}
                <Text type="secondary" style={{ fontSize: 10 }}>
                  {(c.estimated_hours ?? 0).toFixed(1)}h
                </Text>
              </Space>
            </div>
          </div>
        ))}
      </Checkbox.Group>
    </Modal>
  );
};

export default RelatedJobsModal;
