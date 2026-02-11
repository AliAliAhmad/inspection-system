import { useState } from 'react';
import { Card, Typography, Space, Select, Row, Col, Tabs, Button, Tag, Spin, message } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  TrophyOutlined,
  RadarChartOutlined,
  HeartOutlined,
  BookOutlined,
  LineChartOutlined,
  TeamOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usersApi, type User } from '@inspection/shared';
import {
  PerformanceDashboard,
  GoalsManager,
  SkillGapsChart,
  BurnoutRiskCard,
  PeerComparisonCard,
  LearningPathCard,
  TrajectoryChart,
} from '../../components/performance';

const { Title, Text } = Typography;

type TabKey = 'overview' | 'goals' | 'skills' | 'trajectory' | 'learning' | 'burnout';

export default function PerformancePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Fetch users for selector (admin/engineer can select workers)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'list-for-performance'],
    queryFn: () =>
      usersApi
        .list({ per_page: 500, is_active: true })
        .then((r) => r.data),
  });

  const users: User[] = usersData?.data || [];

  // Get current user info from localStorage or context
  const currentUserStr = localStorage.getItem('user');
  const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
  const isAdminOrEngineer = currentUser?.role === 'admin' || currentUser?.role === 'engineer';

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['performance'] });
    message.success(t('common.refreshed', 'Data refreshed'));
  };

  const selectedUser = selectedUserId
    ? users.find((u) => u.id === selectedUserId)
    : null;

  const tabItems = [
    {
      key: 'overview',
      label: (
        <Space>
          <DashboardOutlined />
          {t('performance.overview', 'Overview')}
        </Space>
      ),
    },
    {
      key: 'goals',
      label: (
        <Space>
          <TrophyOutlined />
          {t('performance.goals', 'Goals')}
        </Space>
      ),
    },
    {
      key: 'skills',
      label: (
        <Space>
          <RadarChartOutlined />
          {t('performance.skills', 'Skills')}
        </Space>
      ),
    },
    {
      key: 'trajectory',
      label: (
        <Space>
          <LineChartOutlined />
          {t('performance.trajectory', 'Trajectory')}
        </Space>
      ),
    },
    {
      key: 'learning',
      label: (
        <Space>
          <BookOutlined />
          {t('performance.learning', 'Learning')}
        </Space>
      ),
    },
    ...(isAdminOrEngineer
      ? [
          {
            key: 'burnout',
            label: (
              <Space>
                <HeartOutlined />
                {t('performance.burnout', 'Burnout Risk')}
              </Space>
            ),
          },
        ]
      : []),
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <PerformanceDashboard userId={selectedUserId} showFullDashboard />
            </Col>
          </Row>
        );

      case 'goals':
        return (
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <GoalsManager
                userId={selectedUserId}
                readOnly={!!selectedUserId && selectedUserId !== currentUser?.id}
              />
            </Col>
          </Row>
        );

      case 'skills':
        return (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={16}>
              <SkillGapsChart userId={selectedUserId} />
            </Col>
            <Col xs={24} lg={8}>
              <LearningPathCard userId={selectedUserId} compact />
            </Col>
          </Row>
        );

      case 'trajectory':
        return (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={16}>
              <TrajectoryChart userId={selectedUserId} />
            </Col>
            <Col xs={24} lg={8}>
              <PeerComparisonCard userId={selectedUserId} />
            </Col>
          </Row>
        );

      case 'learning':
        return (
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <LearningPathCard userId={selectedUserId} />
            </Col>
          </Row>
        );

      case 'burnout':
        return isAdminOrEngineer ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <BurnoutRiskCard userId={selectedUserId || currentUser?.id} />
            </Col>
            <Col xs={24} lg={12}>
              {/* Team Burnout Overview - only show for admin/engineer viewing team */}
              {!selectedUserId && (
                <Card
                  title={
                    <Space>
                      <TeamOutlined style={{ color: '#1677ff' }} />
                      {t('performance.team_burnout', 'Team Burnout Overview')}
                    </Space>
                  }
                >
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <Text type="secondary">
                      {t(
                        'performance.select_user_burnout',
                        'Select a team member to view their burnout risk assessment, or view your own above.'
                      )}
                    </Text>
                  </div>
                </Card>
              )}
              {selectedUserId && (
                <Card
                  title={
                    <Space>
                      <SettingOutlined style={{ color: '#8c8c8c' }} />
                      {t('performance.interventions', 'Available Interventions')}
                    </Space>
                  }
                >
                  <div style={{ padding: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Button block icon={<HeartOutlined />}>
                        {t('performance.suggest_leave', 'Suggest Leave')}
                      </Button>
                      <Button block icon={<TeamOutlined />}>
                        {t('performance.reduce_workload', 'Reduce Workload')}
                      </Button>
                      <Button block icon={<TrophyOutlined />}>
                        {t('performance.send_recognition', 'Send Recognition')}
                      </Button>
                      <Button block icon={<BookOutlined />}>
                        {t('performance.assign_training', 'Assign Training')}
                      </Button>
                    </Space>
                  </div>
                </Card>
              )}
            </Col>
          </Row>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Page Header */}
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <Space>
            <DashboardOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <div>
              <Title level={3} style={{ margin: 0 }}>
                {t('performance.ai_title', 'Performance AI')}
              </Title>
              <Text type="secondary">
                {t(
                  'performance.ai_subtitle',
                  'Track performance, set goals, and get AI-powered insights'
                )}
              </Text>
            </div>
          </Space>

          <Space>
            {/* User Selector (Admin/Engineer only) */}
            {isAdminOrEngineer && (
              <Select
                placeholder={t('performance.select_user', 'Select user to view')}
                style={{ width: 250 }}
                allowClear
                showSearch
                loading={usersLoading}
                value={selectedUserId}
                onChange={(value) => setSelectedUserId(value)}
                filterOption={(input, option) => {
                  const label = option?.searchLabel as string;
                  return label?.toLowerCase().includes(input.toLowerCase()) ?? false;
                }}
                options={[
                  {
                    value: undefined,
                    label: (
                      <Space>
                        <UserOutlined />
                        {t('performance.my_performance', 'My Performance')}
                      </Space>
                    ),
                    searchLabel: 'My Performance',
                  },
                  ...users.map((user) => ({
                    value: user.id,
                    label: (
                      <Space>
                        <span>{user.full_name}</span>
                        <Tag style={{ fontSize: 10 }}>{user.role}</Tag>
                      </Space>
                    ),
                    searchLabel: `${user.full_name} ${user.role}`,
                  })),
                ]}
              />
            )}

            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              {t('common.refresh', 'Refresh')}
            </Button>
          </Space>
        </div>

        {/* Selected User Info */}
        {selectedUser && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 16px',
              backgroundColor: '#e6f7ff',
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <UserOutlined style={{ color: '#1677ff' }} />
            <Text>
              {t('performance.viewing', 'Viewing')}:{' '}
              <Text strong>{selectedUser.full_name}</Text>
            </Text>
            <Tag color="blue">{selectedUser.role}</Tag>
            <Button
              type="link"
              size="small"
              onClick={() => setSelectedUserId(undefined)}
              style={{ padding: 0 }}
            >
              {t('common.clear', 'Clear')}
            </Button>
          </div>
        )}
      </Card>

      {/* Tabs */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          items={tabItems.map((tab) => ({
            key: tab.key,
            label: tab.label,
          }))}
        />

        <div style={{ marginTop: 16 }}>{renderTabContent()}</div>
      </Card>
    </div>
  );
}
