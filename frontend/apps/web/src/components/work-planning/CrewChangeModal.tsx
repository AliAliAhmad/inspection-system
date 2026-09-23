/**
 * A job's supervisor asks to change who is on it.
 *
 * Ali, 2026-09-23: a supervisor may be a specialist or a maintenance man, and
 * changing a crew is planning — so he ASKS, and any engineer or admin decides in
 * the Approvals inbox. Nothing on the job changes until then.
 *
 * The pick list comes from /crew-change-options, not /users/for-assignment
 * (planners only). A man on leave on the JOB's day is shown but cannot be
 * picked — the server would refuse him, and offering him is exactly the bug
 * that cost a morning on the inspection assignment page.
 */
import { useState } from 'react';
import { Modal, Select, Input, Tag, Button, Space, Typography, Alert, List, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi, type CrewChangeRequest } from '@inspection/shared';

const { Text } = Typography;

const STATUS_COLOR: Record<CrewChangeRequest['status'], string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

interface Props {
  jobId: number | null;
  jobLabel?: string;
  open: boolean;
  onClose: () => void;
}

export default function CrewChangeModal({ jobId, jobLabel, open, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [removeId, setRemoveId] = useState<number | undefined>();
  const [addId, setAddId] = useState<number | undefined>();
  const [reason, setReason] = useState('');

  const options = useQuery({
    queryKey: ['crew-change-options', jobId],
    queryFn: () => workPlansApi.getCrewChangeOptions(jobId!).then((r) => r.data.data),
    enabled: open && !!jobId,
  });
  const history = useQuery({
    queryKey: ['crew-change-requests', jobId],
    queryFn: () => workPlansApi.listCrewChangeRequests(jobId!).then((r) => r.data.data),
    enabled: open && !!jobId,
  });

  const reset = () => { setRemoveId(undefined); setAddId(undefined); setReason(''); };
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crew-change-requests', jobId] });
    queryClient.invalidateQueries({ queryKey: ['crew-change-options', jobId] });
  };
  const errorText = (err: any) =>
    err?.response?.data?.message || err?.response?.data?.error || t('common.error', 'Something went wrong');

  const send = useMutation({
    mutationFn: () => workPlansApi.requestCrewChange(jobId!, {
      remove_user_id: removeId ?? null,
      add_user_id: addId ?? null,
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => {
      message.success(t('crew_change.sent', 'Sent to the planners for approval'));
      reset();
      refresh();
    },
    onError: (err) => message.error(errorText(err)),
  });

  const withdraw = useMutation({
    mutationFn: (id: number) => workPlansApi.withdrawCrewChangeRequest(id),
    onSuccess: refresh,
    onError: (err) => message.error(errorText(err)),
  });

  const data = options.data;
  const started = !!data?.started;

  const statusLabel = (r: CrewChangeRequest) => {
    if (r.status === 'cancelled' && r.review_notes === 'job_started') {
      return t('crew_change.status_started', 'Cancelled — the job started');
    }
    return t(`crew_change.status_${r.status}`, r.status);
  };

  return (
    <Modal
      open={open}
      onCancel={() => { reset(); onClose(); }}
      title={`${t('crew_change.title', 'Ask to change the crew')}${jobLabel ? ` — ${jobLabel}` : ''}`}
      footer={[
        <Button key="close" onClick={() => { reset(); onClose(); }}>{t('common.close', 'Close')}</Button>,
        <Button
          key="send"
          type="primary"
          disabled={started || (!removeId && !addId)}
          loading={send.isPending}
          onClick={() => send.mutate()}
        >
          {t('crew_change.send', 'Send for approval')}
        </Button>,
      ]}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type={started ? 'warning' : 'info'}
          showIcon
          message={started
            ? t('crew_change.started', 'This job has started. Its crew can no longer change.')
            : t('crew_change.explain', 'Nothing changes until an engineer or admin approves.')}
        />

        <div>
          <Text type="secondary">{t('crew_change.take_off', 'Take off')}</Text>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder={t('crew_change.nobody', 'Nobody')}
            value={removeId}
            onChange={setRemoveId}
            disabled={started}
            options={(data?.team || []).map((m) => ({
              value: m.user_id,
              label: `${m.name ?? '#' + m.user_id}${m.is_lead ? ` ★ ${t('crew_change.lead', 'Lead')}` : ''}`,
            }))}
          />
        </div>

        <div>
          <Text type="secondary">{t('crew_change.put_on', 'Put on')}</Text>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            placeholder={t('crew_change.nobody', 'Nobody')}
            value={addId}
            onChange={setAddId}
            disabled={started}
            loading={options.isLoading}
            options={(data?.candidates || []).map((c) => ({
              value: c.id,
              disabled: c.on_leave,
              label: c.on_leave
                ? `🔴 ${c.name} — ${t('common.on_leave', 'On Leave')}`
                : `${c.name} (${c.role})`,
            }))}
          />
        </div>

        <Input.TextArea
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('crew_change.reason', 'Why? (optional — the planner reads this)')}
          disabled={started}
        />

        {(history.data?.length ?? 0) > 0 && (
          <List
            size="small"
            header={<Text strong>{t('crew_change.history', 'Your requests')}</Text>}
            dataSource={history.data}
            renderItem={(r) => (
              <List.Item
                actions={r.status === 'pending' ? [
                  <Button key="w" size="small" type="link" danger
                    loading={withdraw.isPending}
                    onClick={() => withdraw.mutate(r.id)}>
                    {t('crew_change.withdraw', 'Withdraw')}
                  </Button>,
                ] : []}
              >
                <Space wrap size={4}>
                  {r.remove_user && <Tag color="red">{t('crew_change.off', 'Off')}: {r.remove_user.name}</Tag>}
                  {r.add_user && <Tag color="green">{t('crew_change.on', 'On')}: {r.add_user.name}</Tag>}
                  <Tag color={STATUS_COLOR[r.status]}>{statusLabel(r)}</Tag>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Space>
    </Modal>
  );
}
