import { Tabs, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import LeaveApprovalsTab from './LeaveApprovalsPage';
import BonusApprovalsTab from './BonusApprovalsPage';
import PauseApprovalsTab from './PauseApprovalsPage';

const TAB_KEYS = ['leaves', 'bonus', 'pauses'] as const;

export default function ApprovalsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'leaves';

  const items = [
    {
      key: 'leaves',
      label: t('nav.leave_approvals', 'Leave Approvals'),
      children: <LeaveApprovalsTab />,
    },
    {
      key: 'bonus',
      label: t('nav.bonus_approvals', 'Bonus Approvals'),
      children: <BonusApprovalsTab />,
    },
    {
      key: 'pauses',
      label: t('nav.pause_approvals', 'Pause Approvals'),
      children: <PauseApprovalsTab />,
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        <SafetyCertificateOutlined style={{ marginRight: 8 }} />
        {t('nav.approvals', 'Approvals')}
      </Typography.Title>
      <Tabs
        activeKey={TAB_KEYS.includes(activeTab as any) ? activeTab : 'leaves'}
        onChange={(key) => setSearchParams({ tab: key })}
        items={items}
        size="large"
      />
    </div>
  );
}
