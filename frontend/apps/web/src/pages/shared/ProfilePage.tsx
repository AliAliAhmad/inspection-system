import { useState } from 'react';
import {
  Card,
  Descriptions,
  Typography,
  Switch,
  Space,
  Tag,
  Divider,
  Button,
  Modal,
  Form,
  Input,
  Row,
  Col,
  Tabs,
  Badge,
  Tooltip,
  Progress,
  Skeleton,
  message,
} from 'antd';
import {
  UserOutlined,
  GlobalOutlined,
  LogoutOutlined,
  EditOutlined,
  LockOutlined,
  SettingOutlined,
  TrophyOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  HistoryOutlined,
  BellOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CheckCircleOutlined,
  StarOutlined,
  ThunderboltOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useUserProfile, useAIInsights } from '../../hooks';
import { StatCard, ActivityFeed, PerformanceChart, AIInsightsPanel, AvatarUpload } from '../../components/shared';
import type { ActivityItem } from '../../components/shared';

const { Title, Text, Paragraph } = Typography;

const roleColors: Record<string, string> = {
  admin: 'red',
  inspector: 'blue',
  specialist: 'green',
  engineer: 'orange',
  quality_engineer: 'purple',
};

const roleBadges: Record<string, { icon: React.ReactNode; label: string }> = {
  admin: { icon: <SafetyCertificateOutlined />, label: 'Administrator' },
  engineer: { icon: <ThunderboltOutlined />, label: 'Engineer' },
  inspector: { icon: <EyeOutlined />, label: 'Inspector' },
  specialist: { icon: <StarOutlined />, label: 'Specialist' },
  quality_engineer: { icon: <CheckCircleOutlined />, label: 'Quality Engineer' },
};

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const { t } = useTranslation();

  const {
    profile,
    stats,
    activity,
    isLoading,
    isStatsLoading,
    updateProfile,
    isUpdating,
    changePassword,
    isChangingPassword,
    uploadAvatar,
  } = useUserProfile();

  const { insights, isLoading: isInsightsLoading, refetch: refetchInsights } = useAIInsights();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  if (!user) return null;

  const handleEditProfile = () => {
    editForm.setFieldsValue({
      full_name: user.full_name,
      email: user.email,
      phone: (user as any).phone || '',
      employee_id: user.employee_id,
      specialization: user.specialization || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveProfile = async () => {
    try {
      const values = await editForm.validateFields();
      updateProfile(values);
      setEditModalOpen(false);
    } catch (error) {
      // Form validation failed
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      changePassword(values);
      setPasswordModalOpen(false);
      passwordForm.resetFields();
    } catch (error) {
      // Form validation failed
    }
  };

  const handleAvatarUpload = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Convert to base64 for now (backend upload would be used in production)
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        updateProfile({ avatar_url: base64 });
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Convert activity to ActivityFeed format
  const activityItems: ActivityItem[] = activity.map((item: any) => ({
    id: item.id,
    type: item.type === 'inspection' ? 'complete' :
          item.type === 'defect' ? 'create' :
          item.type === 'achievement' ? 'star' : 'system',
    title: item.title,
    description: item.description,
    timestamp: item.timestamp,
    entity: item.type,
    entityId: item.entityId,
  }));

  // Performance data for charts (value required for ChartDataPoint compatibility)
  const performanceData = [
    { name: 'Mon', value: 4, inspections: 4, defects: 2 },
    { name: 'Tue', value: 6, inspections: 6, defects: 1 },
    { name: 'Wed', value: 5, inspections: 5, defects: 3 },
    { name: 'Thu', value: 8, inspections: 8, defects: 2 },
    { name: 'Fri', value: 7, inspections: 7, defects: 4 },
    { name: 'Sat', value: 3, inspections: 3, defects: 1 },
    { name: 'Sun', value: 2, inspections: 2, defects: 0 },
  ];

  const qualityData = [
    { name: 'Jan', value: 85 },
    { name: 'Feb', value: 88 },
    { name: 'Mar', value: 92 },
    { name: 'Apr', value: 90 },
    { name: 'May', value: 95 },
    { name: 'Jun', value: 93 },
  ];

  const tabItems = [
    {
      key: 'overview',
      label: (
        <Space>
          <UserOutlined />
          {t('profile.overview', 'Overview')}
        </Space>
      ),
      children: (
        <Row gutter={[16, 16]}>
          {/* Stats Cards */}
          <Col xs={12} sm={6}>
            <StatCard
              title={t('profile.inspections', 'Inspections')}
              value={stats?.inspections_completed || 0}
              icon={<EyeOutlined />}
              trend={12}
              trendLabel={t('common.vsLastMonth', 'vs last month')}
              loading={isStatsLoading}
            />
          </Col>
          <Col xs={12} sm={6}>
            <StatCard
              title={t('profile.defects', 'Defects Found')}
              value={stats?.defects_found || 0}
              icon={<FireOutlined />}
              loading={isStatsLoading}
            />
          </Col>
          <Col xs={12} sm={6}>
            <StatCard
              title={t('profile.rating', 'Avg Rating')}
              value={(stats?.average_rating || 0).toFixed(1)}
              suffix="/5"
              icon={<StarOutlined />}
              progress={((stats?.average_rating || 0) / 5) * 100}
              progressColor="#faad14"
              loading={isStatsLoading}
            />
          </Col>
          <Col xs={12} sm={6}>
            <StatCard
              title={t('profile.points', 'Points')}
              value={stats?.points_earned || 0}
              icon={<TrophyOutlined />}
              trend={8}
              loading={isStatsLoading}
            />
          </Col>

          {/* Performance Chart */}
          <Col xs={24} lg={14}>
            <PerformanceChart
              title={t('profile.weeklyPerformance', 'Weekly Performance')}
              data={performanceData}
              series={[
                { key: 'inspections', name: t('profile.inspections', 'Inspections'), color: '#1890ff' },
                { key: 'defects', name: t('profile.defects', 'Defects'), color: '#ff4d4f' },
              ]}
              type="bar"
              height={250}
              showTimeFilter
            />
          </Col>

          {/* AI Insights */}
          <Col xs={24} lg={10}>
            <AIInsightsPanel
              insights={insights}
              loading={isInsightsLoading}
              onRefresh={refetchInsights}
              maxItems={3}
              compact
            />
          </Col>

          {/* Quality Trend */}
          <Col xs={24} md={12}>
            <PerformanceChart
              title={t('profile.qualityTrend', 'Quality Score Trend')}
              data={qualityData}
              type="area"
              height={200}
              colors={['#52c41a']}
            />
          </Col>

          {/* Recent Activity */}
          <Col xs={24} md={12}>
            <Card title={t('profile.recentActivity', 'Recent Activity')} size="small">
              <ActivityFeed items={activityItems} maxItems={5} compact />
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'details',
      label: (
        <Space>
          <SettingOutlined />
          {t('profile.details', 'Details')}
        </Space>
      ),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title={t('profile.personalInfo', 'Personal Information')}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('auth.username', 'Username')}>
                  {user.username}
                </Descriptions.Item>
                <Descriptions.Item label={t('common.email', 'Email')}>
                  {user.email}
                </Descriptions.Item>
                <Descriptions.Item label={t('profile.employeeId', 'Employee ID')}>
                  {user.employee_id}
                </Descriptions.Item>
                <Descriptions.Item label={t('common.role', 'Role')}>
                  <Tag color={roleColors[user.role] || 'default'}>
                    {user.role.replace('_', ' ').toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                {user.specialization && (
                  <Descriptions.Item label={t('profile.specialization', 'Specialization')}>
                    {user.specialization}
                  </Descriptions.Item>
                )}
                {user.shift && (
                  <Descriptions.Item label={t('profile.shift', 'Shift')}>
                    {user.shift}
                  </Descriptions.Item>
                )}
              </Descriptions>
              <div style={{ marginTop: 16 }}>
                <Button icon={<EditOutlined />} onClick={handleEditProfile}>
                  {t('profile.editInfo', 'Edit Information')}
                </Button>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title={t('profile.achievements', 'Achievements')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      backgroundColor: '#fff7e6', display: 'flex',
                      alignItems: 'center', justifyContent: 'center'
                    }}>
                      <TrophyOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
                    </div>
                    <div>
                      <Text strong>{t('profile.totalPoints', 'Total Points')}</Text>
                      <br />
                      <Text type="secondary">{user.total_points || 0} pts</Text>
                    </div>
                  </Space>
                  <Badge count={t('profile.level', 'Level') + ' ' + Math.floor((user.total_points || 0) / 100 + 1)} style={{ backgroundColor: '#722ed1' }} />
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <div>
                  <Text type="secondary">{t('profile.nextLevel', 'Next Level Progress')}</Text>
                  <Progress
                    percent={((user.total_points || 0) % 100)}
                    strokeColor="#722ed1"
                    showInfo={false}
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {100 - ((user.total_points || 0) % 100)} {t('profile.pointsToNext', 'points to next level')}
                  </Text>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <Space wrap>
                  <Tooltip title={t('profile.badgeInspector', '100+ Inspections')}>
                    <Badge count={<CheckCircleOutlined style={{ color: '#52c41a' }} />}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        backgroundColor: '#f6ffed', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                      }}>
                        <EyeOutlined style={{ fontSize: 18, color: '#52c41a' }} />
                      </div>
                    </Badge>
                  </Tooltip>
                  <Tooltip title={t('profile.badgeDefectHunter', '50+ Defects Found')}>
                    <Badge count={<CheckCircleOutlined style={{ color: '#52c41a' }} />}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        backgroundColor: '#fff1f0', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                      }}>
                        <FireOutlined style={{ fontSize: 18, color: '#ff4d4f' }} />
                      </div>
                    </Badge>
                  </Tooltip>
                  <Tooltip title={t('profile.badgeQualityStar', 'Avg Rating 4.5+')}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      backgroundColor: '#fffbe6', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      opacity: (stats?.average_rating || 0) >= 4.5 ? 1 : 0.3
                    }}>
                      <StarOutlined style={{ fontSize: 18, color: '#faad14' }} />
                    </div>
                  </Tooltip>
                </Space>
              </Space>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'settings',
      label: (
        <Space>
          <SettingOutlined />
          {t('profile.settings', 'Settings')}
        </Space>
      ),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title={t('profile.languageSettings', 'Language & Display')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <GlobalOutlined />
                    <Text>{t('common.language', 'Language')}</Text>
                  </Space>
                  <Space>
                    <Text>English</Text>
                    <Switch
                      checked={language === 'ar'}
                      onChange={(checked) => setLanguage(checked ? 'ar' : 'en')}
                    />
                    <Text>العربية</Text>
                  </Space>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {isRTL ? 'الاتجاه: من اليمين إلى اليسار' : 'Direction: Left to Right'}
                </Text>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title={t('profile.security', 'Security')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  icon={<LockOutlined />}
                  onClick={() => setPasswordModalOpen(true)}
                  block
                >
                  {t('profile.changePassword', 'Change Password')}
                </Button>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title={t('profile.notifications', 'Notification Preferences')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('profile.emailNotifications', 'Email Notifications')}</Text>
                  <Switch defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('profile.pushNotifications', 'Push Notifications')}</Text>
                  <Switch defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('profile.weeklyDigest', 'Weekly Digest')}</Text>
                  <Switch />
                </div>
              </Space>
            </Card>
          </Col>

          <Col xs={24}>
            <Card>
              <Button danger block icon={<LogoutOutlined />} onClick={logout}>
                {t('auth.logout', 'Logout')}
              </Button>
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Profile Header */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col>
            <AvatarUpload
              value={(user as any).avatar_url}
              onChange={(url) => updateProfile({ avatar_url: url })}
              size={100}
              onUpload={handleAvatarUpload}
            />
          </Col>
          <Col flex={1}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {user.full_name}
                </Title>
                <Space style={{ marginTop: 8 }}>
                  <Tag color={roleColors[user.role] || 'default'} icon={roleBadges[user.role]?.icon}>
                    {user.role.replace('_', ' ').toUpperCase()}
                  </Tag>
                  {user.specialization && (
                    <Tag color="blue">{user.specialization}</Tag>
                  )}
                </Space>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">
                    {user.email} | {t('profile.employeeId', 'ID')}: {user.employee_id}
                  </Text>
                </div>
              </div>
              <Space>
                <Button icon={<EditOutlined />} onClick={handleEditProfile}>
                  {t('common.edit', 'Edit')}
                </Button>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Tabs */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      {/* Edit Profile Modal */}
      <Modal
        title={t('profile.editProfile', 'Edit Profile')}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveProfile}
        confirmLoading={isUpdating}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="full_name"
            label={t('profile.fullName', 'Full Name')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('common.email', 'Email')}
            rules={[{ required: true, type: 'email' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="phone" label={t('profile.phone', 'Phone')}>
            <Input />
          </Form.Item>
          <Form.Item name="employee_id" label={t('profile.employeeId', 'Employee ID')}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="specialization" label={t('profile.specialization', 'Specialization')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={t('profile.changePassword', 'Change Password')}
        open={passwordModalOpen}
        onCancel={() => {
          setPasswordModalOpen(false);
          passwordForm.resetFields();
        }}
        onOk={handleChangePassword}
        confirmLoading={isChangingPassword}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="current_password"
            label={t('profile.currentPassword', 'Current Password')}
            rules={[{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="new_password"
            label={t('profile.newPassword', 'New Password')}
            rules={[
              { required: true },
              { min: 8, message: t('profile.passwordMinLength', 'Password must be at least 8 characters') },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label={t('profile.confirmPassword', 'Confirm Password')}
            dependencies={['new_password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('profile.passwordMismatch', 'Passwords do not match')));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
