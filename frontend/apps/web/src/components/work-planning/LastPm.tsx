/**
 * "Last PM: 95 days ago (2026-08-24)" — a grey line in Job Details (Rule 1,
 * Ali 2026-11-27). It shows WHY the app put a machine first among jobs with the
 * same score. Job Details only, on purpose: the cards stay clean.
 *
 * ONE request for the whole board, like the PRM list: React Query shares it.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { lastPmApi, type LastPmList } from '@inspection/shared';
import { machineCode } from './PrmOverdue';

const { Text } = Typography;

/** Whole days from a 'YYYY-MM-DD' date to today, never negative. */
export function daysSince(day: string, today: Date = new Date()): number {
  const [y, m, d] = day.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((now - then) / 86400000));
}

export const LastPmLine: React.FC<{ equipmentName?: string | null }> = ({ equipmentName }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['last-pm'],
    queryFn: () => lastPmApi.get().then((r) => r.data.data as LastPmList),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const code = machineCode(equipmentName);
  // No list yet, or no machine: say nothing rather than something wrong.
  if (!data?.available || !code) return null;
  const day = data.by_machine[code];
  return (
    <Tooltip title={t('last_pm.tooltip')}>
      <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
        {day
          ? t('last_pm.line', { days: daysSince(day), date: day })
          : t('last_pm.none')}
      </Text>
    </Tooltip>
  );
};
