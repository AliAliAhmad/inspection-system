import { Breadcrumb, Space, Typography } from 'antd';
import { HomeOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NotificationRulesManager } from '../../components/notifications/NotificationRulesManager';

const { Title } = Typography;

export default function NotificationRulesPage() {
  const { t } = useTranslation();

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: (
              <Link to="/">
                <HomeOutlined />
              </Link>
            ),
          },
          {
            title: (
              <Space>
                <SettingOutlined />
                {t('nav.settings', 'Settings')}
              </Space>
            ),
          },
          {
            title: (
              <Space>
                <ThunderboltOutlined />
                {t('notifications.rules', 'Notification Rules')}
              </Space>
            ),
          },
        ]}
      />

      <Title level={3} style={{ marginBottom: 24 }}>
        <Space>
          <ThunderboltOutlined />
          {t('notifications.rulesManagement', 'Notification Rules Management')}
        </Space>
      </Title>

      <NotificationRulesManager />
    </div>
  );
}
