import { Segmented } from 'antd';
import { useTranslation } from 'react-i18next';

export type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

export interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  size?: 'small' | 'middle' | 'large';
}

export function PeriodSelector({ value, onChange, size = 'middle' }: PeriodSelectorProps) {
  const { t } = useTranslation();

  const options = [
    { label: t('leaderboard.periods.today', 'Today'), value: 'daily' as Period },
    { label: t('leaderboard.periods.week', 'This Week'), value: 'weekly' as Period },
    { label: t('leaderboard.periods.month', 'This Month'), value: 'monthly' as Period },
    { label: t('leaderboard.periods.all_time', 'All Time'), value: 'all_time' as Period },
  ];

  return (
    <Segmented
      value={value}
      onChange={(val) => onChange(val as Period)}
      options={options}
      size={size}
    />
  );
}

export default PeriodSelector;
