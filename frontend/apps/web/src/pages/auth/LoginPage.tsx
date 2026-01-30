import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Space, Select } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

export default function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { username: string; password: string }) => {
    setError(null);
    setLoading(true);
    try {
      await login(values.username, values.password);
    } catch (err: any) {
      setError(err?.response?.data?.error || t('auth.login_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3}>{t('common.app_title')}</Title>
          <Typography.Text type="secondary">{t('auth.sign_in_prompt')}</Typography.Text>
        </div>

        {error && (
          <Alert message={error} type="error" showIcon closable style={{ marginBottom: 16 }} />
        )}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('auth.username_required') }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder={t('auth.username')}
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('auth.password_required') }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('auth.password')}
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              {t('auth.login')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Space>
            <GlobalOutlined />
            <Select
              value={language}
              onChange={setLanguage}
              size="small"
              style={{ width: 120 }}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' },
              ]}
            />
          </Space>
        </div>
      </Card>
    </div>
  );
}
