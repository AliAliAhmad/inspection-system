/**
 * The planner's PRM overdue list on the board (SERVER_PRM_OVERDUE.md, 2026-11-25).
 *
 *  - <PrmOverdueButton/>  header button + the list, most overdue first, then due soon.
 *  - <PrmOverdueTag/>     red "PRM -91 h" on a late machine, amber "PRM due +12.82 h"
 *                         on one still to go. Numbers use SAP's sign (Ali, 2026-11-26:
 *                         "Like SAP: -91 = overdue").
 *
 * ONE request for the whole board: every tag calls usePrmOverdue(), and React
 * Query shares the answer under one key. These are the PLANNER's numbers; the
 * card's own overdue badge is the app's figure and stays beside it (Ali:
 * "both, side by side"). Planners only — the server refuses anyone else, and
 * the board itself is a planner's page.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Modal, Table, Tag, Tooltip, Typography } from 'antd';
import { prmOverdueApi, type PrmOverdueList, type PrmOverdueRow } from '@inspection/shared';

const { Text } = Typography;

/** 'TT058', 'TT058 - Terminal Tractor', 'tt058' -> 'TT058'. */
export function machineCode(name: string | null | undefined): string | null {
  const match = (name || '').trim().toUpperCase().match(/^[A-Z]{2,4}\d{2,4}/);
  return match ? match[0] : null;
}

/** SAP's sign, always shown: -91 -> '-91', 12.82 -> '+12.82', 0 -> '0'. */
export function formatDue(due: number | null | undefined): string {
  if (due == null) return '?';
  return due > 0 ? `+${due}` : `${due}`;
}

export function usePrmOverdue() {
  const query = useQuery({
    queryKey: ['prm-overdue'],
    queryFn: () => prmOverdueApi.get().then((r) => r.data.data as PrmOverdueList),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const byMachine = useMemo(() => {
    const map = new Map<string, PrmOverdueRow>();
    (query.data?.rows || []).forEach((row) => {
      // Rows arrive most overdue first; keep the most urgent if a machine repeats.
      if (!map.has(row.equipment)) map.set(row.equipment, row);
    });
    return map;
  }, [query.data]);
  return { ...query, byMachine };
}

export const PrmOverdueTag: React.FC<{ equipmentName?: string | null }> = ({ equipmentName }) => {
  const { t } = useTranslation();
  const { byMachine, data } = usePrmOverdue();
  const code = machineCode(equipmentName);
  const row = code ? byMachine.get(code) : undefined;
  if (!row) return null;
  const due = formatDue(row.due_hours);
  return (
    <Tooltip title={t('prm_overdue.tag_tooltip', {
      week: data?.plan_week ?? '?', order: row.order ?? '—',
      cycle: row.cycle_hours ?? '?', due,
    })}>
      <span dir="ltr" style={{
        fontSize: 9, fontWeight: 800, color: '#fff',
        background: row.is_overdue ? '#cf1322' : '#d48806',
        padding: '0 5px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {t(row.is_overdue ? 'prm_overdue.tag' : 'prm_overdue.tag_soon', { due })}
      </span>
    </Tooltip>
  );
};

export const PrmOverdueButton: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = usePrmOverdue();
  if (isError) return null;   // not a planner, or the server is down — no button
  const count = data?.overdue_count ?? 0;   // the badge counts LATE machines only

  const columns = [
    { title: t('prm_overdue.equipment'), dataIndex: 'equipment', key: 'equipment',
      render: (v: string) => <Text strong>{v}</Text> },
    { title: t('prm_overdue.cycle'), dataIndex: 'cycle_hours', key: 'cycle',
      render: (v: number | null) => (v == null ? '—' : `${v}h`) },
    { title: <Tooltip title={t('prm_overdue.due_hint')}>{t('prm_overdue.due')}</Tooltip>,
      dataIndex: 'due_hours', key: 'due',
      render: (v: number | null, r: PrmOverdueRow) => (
        <Text strong dir="ltr" style={{ color: r.is_overdue ? '#cf1322' : '#d48806' }}>
          {v == null ? '—' : formatDue(v)}
        </Text>
      ) },
    { title: t('prm_overdue.order'), dataIndex: 'order', key: 'order',
      render: (v: string | null) => <Text copyable={!!v}>{v ?? '—'}</Text> },
    { title: t('prm_overdue.sap_status'), dataIndex: 'sap_status', key: 'sap',
      render: (v: string | null) => <Text type="secondary" style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
  ];

  return (
    <>
      <Badge count={count} size="small" offset={[-4, 2]}>
        <Button size="small" danger={count > 0} loading={isLoading} onClick={() => setOpen(true)}>
          {t('prm_overdue.button')}
        </Button>
      </Badge>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={720}
             title={t('prm_overdue.title')}>
        {data && !data.available && <Alert type="info" showIcon message={t('prm_overdue.not_delivered')} />}
        {data?.available && (
          <>
            <div style={{ marginBottom: 8 }}>
              <Text strong>{t('prm_overdue.plan_received', { date: data.plan_received ?? '—' })}</Text>
              {data.plan_week != null && (
                <Tag style={{ marginInlineStart: 8 }}>{t('prm_overdue.plan_week', { week: data.plan_week })}</Tag>
              )}
            </div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {t('prm_overdue.summary', { overdue: data.overdue_count, total: data.rows.length })}
            </Text>
            {data.is_stale && (
              <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                     message={t('prm_overdue.stale', { days: Math.floor(data.plan_received_age_days ?? 0) })} />
            )}
            <Table size="small" rowKey={(r) => `${r.equipment}-${r.order}`} pagination={false}
                   dataSource={data.rows} columns={columns}
                   locale={{ emptyText: t('prm_overdue.none') }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              {t('prm_overdue.source')}
            </Text>
          </>
        )}
      </Modal>
    </>
  );
};
