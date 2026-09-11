import React, { useState } from 'react';
import { Card, Button, Typography, Select, Space, Alert, Tag, message } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';

const { Text } = Typography;

/**
 * "I typed this job before the order existed. Here is the order."
 *
 * Ali, 2026-09-10: "sometimes i make a manual job before i open the order in SAP
 * then when i opened in sap i need a connection between them and the order
 * number i think is the best one".
 *
 * WHY THIS IS NOT JUST A TEXT BOX ON THE JOB
 * =========================================
 *
 * Typing the number into the ordinary job form used to LOSE things. Sub-tasks,
 * photos and voice notes hang on the order number — that is what carries them
 * through the pool — so changing the number moved the anchor out from under
 * them. The rows stayed in the database and the job stopped being able to see
 * them. Silently, during the exact operation Ali wanted to perform.
 *
 * So linking is its own action. It checks the order is real, MOVES what is
 * attached, takes the order out of the pool so the same work is not planned
 * twice, and re-prices the day.
 *
 * The list is narrowed by MACHINE and never by description. The yard writes in
 * Arabic and English, and a wrong link silently fuses two different jobs — worse
 * than no link at all. The machine narrows it; a person confirms it.
 */

interface LinkSapOrderProps {
  planId: number;
  jobId: number;
  /** Hand-typed jobs only — a real SAP job has nothing to link. */
  isManual: boolean;
  currentHours?: number;
}

export const LinkSapOrder: React.FC<LinkSapOrderProps> = ({
  planId, jobId, isManual, currentHours,
}) => {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string | undefined>();

  const { data } = useQuery({
    queryKey: ['link-candidates', planId, jobId],
    queryFn: async () => (await workPlansApi.linkCandidates(planId, jobId)).data,
    enabled: !!jobId && !!planId && isManual,
  });

  const candidates = data?.candidates ?? [];
  const alreadyLinked = !!data?.already_linked;

  const linkMutation = useMutation({
    mutationFn: (orderNumber: string) =>
      workPlansApi.linkSapOrder(planId, jobId, orderNumber),
    onSuccess: (resp: any) => {
      const hours = resp?.data?.hours;
      const moved = resp?.data?.moved_attachments || 0;
      const parts = [`Linked to ${chosen}`];
      if (moved) parts.push(`${moved} note${moved > 1 ? 's' : ''}/photo${moved > 1 ? 's' : ''} carried over`);
      // Ali asked to see both numbers, and for SAP's to win.
      if (hours && hours.sap && hours.sap !== hours.manual_estimate) {
        parts.push(`hours ${hours.manual_estimate}h → ${hours.applied}h (SAP)`);
      }
      message.success(parts.join(' · '));
      setChosen(undefined);
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['job-sub-tasks', jobId] });
      queryClient.invalidateQueries({ queryKey: ['link-candidates', planId, jobId] });
    },
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not link the order'),
  });

  if (!isManual || alreadyLinked) return null;

  const picked = candidates.find((c: any) => c.order_number === chosen);

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Text type="secondary">Link to a SAP order</Text>

      {candidates.length === 0 ? (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 8 }}
          message={
            <Text style={{ fontSize: 12 }}>
              No open orders in the pool for this machine yet. Open the order in
              SAP, import it, and this job can be linked to it — the notes and
              photos on it will come along.
            </Text>
          }
        />
      ) : (
        <div style={{ marginTop: 8 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ flex: 1 }}
              size="small"
              placeholder={`${candidates.length} open order${candidates.length > 1 ? 's' : ''} on this machine`}
              value={chosen}
              onChange={setChosen}
              options={candidates.map((c: any) => ({
                value: c.order_number,
                label: `${c.order_number} · ${c.description || '(no description)'}`,
              }))}
              showSearch
              optionFilterProp="label"
            />
            <Button
              size="small"
              type="primary"
              icon={<LinkOutlined />}
              disabled={!chosen}
              loading={linkMutation.isPending}
              onClick={() => chosen && linkMutation.mutate(chosen)}
            >
              Link
            </Button>
          </Space.Compact>

          {picked && (
            <div style={{ marginTop: 8 }}>
              <Space size={4} wrap>
                <Tag color="blue" style={{ margin: 0 }}>
                  {(picked.job_type || picked.order_type || 'SAP').toUpperCase()}
                </Tag>
                {picked.work_center && (
                  <Tag style={{ margin: 0 }}>{picked.work_center}</Tag>
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {/* Both numbers, because linking changes what the day costs. */}
                  your estimate {(currentHours ?? 0).toFixed(1)}h → SAP{' '}
                  {(picked.estimated_hours ?? 0).toFixed(1)}h
                </Text>
              </Space>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default LinkSapOrder;
