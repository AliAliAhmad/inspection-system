import { Card, Descriptions, Typography, Switch, Space, Tag, Divider, Button, message } from 'antd';
import { UserOutlined, GlobalOutlined, LogoutOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';

const roleColors: Record<string, string> = {
  admin: 'red',
  inspector: 'blue',
  specialist: 'green',
  engineer: 'orange',
  quality_engineer: 'purple',
};

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const { t } = useTranslation();

  if (!user) return null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: '#1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <UserOutlined style={{ fontSize: 36, color: '#fff' }} />
          </div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {user.full_name}
          </Typography.Title>
          <Tag color={roleColors[user.role] || 'default'} style={{ marginTop: 8 }}>
            {user.role.replace('_', ' ').toUpperCase()}
          </Tag>
        </div>

        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label={t('auth.username')}>{user.username}</Descriptions.Item>
          <Descriptions.Item label={t('common.email')}>{user.email}</Descriptions.Item>
          <Descriptions.Item label="Employee ID">{user.employee_id}</Descriptions.Item>
          <Descriptions.Item label={t('common.role')}>{user.role}</Descriptions.Item>
          {user.specialization && (
            <Descriptions.Item label="Specialization">{user.specialization}</Descriptions.Item>
          )}
          {user.shift && (
            <Descriptions.Item label="Shift">{user.shift}</Descriptions.Item>
          )}
          <Descriptions.Item label="Points">
            {user.total_points}
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        <Card size="small" title={<Space><GlobalOutlined /><span>{t('common.language')}</span></Space>}>
          <Space>
            <Typography.Text>English</Typography.Text>
            <Switch
              checked={language === 'ar'}
              onChange={(checked) => setLanguage(checked ? 'ar' : 'en')}
            />
            <Typography.Text>العربية</Typography.Text>
          </Space>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
            {isRTL ? 'الاتجاه: من اليمين إلى اليسار' : 'Direction: Left to Right'}
          </Typography.Text>
        </Card>

        <Divider />

        <Button
          danger
          block
          icon={<LogoutOutlined />}
          onClick={logout}
        >
          {t('auth.logout')}
        </Button>
      </Card>
    </div>
  );
}
