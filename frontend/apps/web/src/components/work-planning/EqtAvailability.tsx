/**
 * The planning team's daily equipment availability on the board (Rule 2,
 * Ali 2026-11-27). Source: EQT_Availability.xlsx from the courier.
 *
 *  - <EqtAvailabilityButton/>  header button + the list, stopped machines first.
 *  - <EqtAvailabilityTag/>     dark "Not available" on a stopped machine's cards.
 *
 * Shown ONLY. The planner does not skip these machines yet — that needs SAP's
 * parts data to know why a machine is stopped (the mail gives a status only).
 * ONE request for the whole board: React Query shares it under one key.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Modal, Table, Tooltip, Typography } from 'antd';
import {
  eqtAvailabilityApi, type EqtAvailabilityList, type EqtAvailabilityRow,
} from '@inspection/shared';
import { machineCode } from './PrmOverdue';

const { Text } = Typography;

export function useEqtAvailability() {
  const query = useQuery({
    queryKey: ['eqt-availability'],
    queryFn: () => eqtAvailabilityApi.get().then((r) => r.data.data as EqtAvailabilityList),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const stopped = useMemo(() => {
    const map = new Map<string, EqtAvailabilityRow>();
    (query.data?.rows || []).forEach((row) => {
      if (!row.available) map.set(row.equipment, row);
    });
    return map;
  }, [query.data]);
  return { ...query, stopped };
}

export const EqtAvailabilityTag: React.FC<{ equipmentName?: string | null }> = ({ equipmentName }) => {
  const { t } = useTranslation();
  const { stopped } = useEqtAvailability();
  const code = machineCode(equipmentName);
  const row = code ? stopped.get(code) : undefined;
  if (!row) return null;
  return (
    <Tooltip title={t('eqt_availability.tag_tooltip', {
      date: row.mail_received ?? '—', reason: row.reason ?? '—',
    })}>
      <span style={{
        fontSize: 9, fontWeight: 800, color: '#fff', background: '#434343',
        padding: '0 5px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {t('eqt_availability.tag')}
      </span>
    </Tooltip>
  );
};

export const EqtAvailabilityButton: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useEqtAvailability();
  if (isError) return null;   // not a planner, or the server is down — no button
  const count = data?.not_available_count ?? 0;
  const stoppedRows = (data?.rows || []).filter((r) => !r.available);

  const columns = [
    { title: t('eqt_availability.equipment'), dataIndex: 'equipment', key: 'equipment',
      render: (v: string) => <Text strong dir="ltr">{v}</Text> },
    { title: t('eqt_availability.reason'), dataIndex: 'reason', key: 'reason',
      render: (v: string | null) => <Text type="secondary">{v ?? '—'}</Text> },
  ];

  return (
    <>
      <Badge count={count} size="small" offset={[-4, 2]} color="#434343">
        <Button size="small" loading={isLoading} onClick={() => setOpen(true)}>
          {t('eqt_availability.button')}
        </Button>
      </Badge>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={520}
             title={t('eqt_availability.title')}>
        {data && !data.available && (
          <Alert type="info" showIcon message={t('eqt_availability.not_delivered')} />
        )}
        {data?.available && (
          <>
            <Text strong style={{ display: 'block' }}>
              {t('eqt_availability.mail_received', { date: data.mail_received ?? '—' })}
            </Text>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {t('eqt_availability.summary', { stopped: count, total: data.machines })}
            </Text>
            {data.is_stale && (
              <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                     message={t('eqt_availability.stale', {
                       days: Math.floor(data.mail_age_days ?? 0) })} />
            )}
            <Table size="small" rowKey="equipment" pagination={false}
                   dataSource={stoppedRows} columns={columns}
                   locale={{ emptyText: t('eqt_availability.none') }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              {t('eqt_availability.source')}
            </Text>
          </>
        )}
      </Modal>
    </>
  );
};
