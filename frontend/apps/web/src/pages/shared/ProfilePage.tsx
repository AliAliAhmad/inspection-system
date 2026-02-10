import { useState, useRef } from 'react';
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
  Table,
  DatePicker,
  Empty,
  List,
  Avatar,
  Statistic,
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
  TeamOutlined,
  FilePdfOutlined,
  PlusOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CrownOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useUserProfile, useAIInsights } from '../../hooks';
import { StatCard, ActivityFeed, PerformanceChart, AIInsightsPanel, AvatarUpload } from '../../components/shared';
import type { ActivityItem } from '../../components/shared';
import { usersApi } from '@inspection/shared';
import dayjs from 'dayjs';

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
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [certForm] = Form.useForm();
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Mock certifications data (would come from API in production)
  const [certifications, setCertifications] = useState([
    { id: 1, name: 'Certified Crane Operator', issuedBy: 'OSHA', issuedDate: '2024-03-15', expiryDate: '2026-03-15', status: 'valid' },
    { id: 2, name: 'Electrical Safety Certificate', issuedBy: 'NFPA', issuedDate: '2024-01-10', expiryDate: '2025-01-10', status: 'expiring_soon' },
    { id: 3, name: 'Forklift Operation License', issuedBy: 'OSHA', issuedDate: '2023-06-20', expiryDate: '2025-06-20', status: 'valid' },
  ]);

  // Fetch team members for comparison
  const { data: teamData } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const response = await usersApi.list({ role: user?.role });
      return response.data?.data || [];
    },
    enabled: !!user,
  });

  const teamMembers = teamData || [];

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

  // Export Profile as PDF
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    message.loading({ content: t('profile.exportingPDF', 'Generating PDF...'), key: 'pdf-export', duration: 0 });

    try {
      // Create a simple PDF using browser print dialog
      const printContent = `
        <html>
        <head>
          <title>Profile Report - ${user.full_name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            h1 { color: #1890ff; border-bottom: 2px solid #1890ff; padding-bottom: 10px; }
            h2 { color: #333; margin-top: 30px; }
            .stats { display: flex; gap: 30px; margin: 20px 0; }
            .stat-box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; min-width: 120px; text-align: center; }
            .stat-value { font-size: 28px; font-weight: bold; color: #1890ff; }
            .stat-label { color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f5f5f5; }
            .badge { background: #52c41a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
            .badge.warning { background: #faad14; }
            .badge.danger { background: #ff4d4f; }
          </style>
        </head>
        <body>
          <h1>${t('profile.performanceReport', 'Performance Report')}</h1>
          <p><strong>${t('profile.fullName', 'Name')}:</strong> ${user.full_name}</p>
          <p><strong>${t('common.role', 'Role')}:</strong> ${user.role.replace('_', ' ').toUpperCase()}</p>
          <p><strong>${t('profile.employeeId', 'Employee ID')}:</strong> ${user.employee_id}</p>
          <p><strong>${t('common.email', 'Email')}:</strong> ${user.email}</p>

          <h2>${t('profile.overview', 'Performance Overview')}</h2>
          <div class="stats">
            <div class="stat-box">
              <div class="stat-value">${stats?.inspections_completed || 0}</div>
              <div class="stat-label">${t('profile.inspections', 'Inspections')}</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${stats?.defects_found || 0}</div>
              <div class="stat-label">${t('profile.defects', 'Defects Found')}</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${(stats?.average_rating || 0).toFixed(1)}/5</div>
              <div class="stat-label">${t('profile.rating', 'Avg Rating')}</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${stats?.points_earned || 0}</div>
              <div class="stat-label">${t('profile.points', 'Points')}</div>
            </div>
          </div>

          <h2>${t('profile.certifications', 'Certifications')}</h2>
          <table>
            <thead>
              <tr>
                <th>${t('profile.certificationName', 'Certification')}</th>
                <th>${t('profile.issuedBy', 'Issued By')}</th>
                <th>${t('profile.expiryDate', 'Expiry Date')}</th>
                <th>${t('profile.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              ${certifications.map(cert => `
                <tr>
                  <td>${cert.name}</td>
                  <td>${cert.issuedBy}</td>
                  <td>${cert.expiryDate}</td>
                  <td><span class="badge ${cert.status === 'expiring_soon' ? 'warning' : cert.status === 'expired' ? 'danger' : ''}">${cert.status === 'valid' ? t('profile.valid', 'Valid') : cert.status === 'expiring_soon' ? t('profile.expiringSoon', 'Expiring Soon') : t('profile.expired', 'Expired')}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <p style="color: #999; margin-top: 40px; font-size: 11px;">Generated on ${new Date().toLocaleDateString()} by Inspection System</p>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }

      message.success({ content: t('profile.pdfExported', 'Profile PDF exported successfully'), key: 'pdf-export' });
    } catch (error) {
      message.error({ content: t('common.error', 'Failed to export PDF'), key: 'pdf-export' });
    }
    setIsExportingPDF(false);
  };

  // Add certification
  const handleAddCertification = async () => {
    try {
      const values = await certForm.validateFields();
      const newCert = {
        id: Date.now(),
        name: values.name,
        issuedBy: values.issuedBy,
        issuedDate: values.issuedDate?.format('YYYY-MM-DD'),
        expiryDate: values.expiryDate?.format('YYYY-MM-DD'),
        status: dayjs(values.expiryDate).isBefore(dayjs()) ? 'expired' :
                dayjs(values.expiryDate).diff(dayjs(), 'days') < 90 ? 'expiring_soon' : 'valid',
      };
      setCertifications([...certifications, newCert]);
      setCertModalOpen(false);
      certForm.resetFields();
      message.success(t('common.created', 'Certification added successfully'));
    } catch (error) {
      // Form validation failed
    }
  };

  // Remove certification
  const handleRemoveCertification = (id: number) => {
    setCertifications(certifications.filter(c => c.id !== id));
    message.success(t('common.deleted', 'Certification removed'));
  };

  // Calculate team stats for comparison
  const myRank = teamMembers.length > 0
    ? teamMembers.findIndex((m: any) => m.id === user?.id) + 1
    : 1;
  const teamAvgInspections = teamMembers.length > 0
    ? Math.round(teamMembers.reduce((sum: number, m: any) => sum + (m.inspections_count || 0), 0) / teamMembers.length)
    : 0;

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
      key: 'team',
      label: (
        <Space>
          <TeamOutlined />
          {t('profile.teamPerformance', 'Team Performance')}
        </Space>
      ),
      children: (
        <Row gutter={[16, 16]}>
          {/* My Ranking */}
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title={t('profile.ranking', 'My Ranking')}
                value={myRank}
                suffix={
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    {t('profile.outOf', 'out of')} {teamMembers.length || 1} {t('profile.teamMembers', 'team members')}
                  </Text>
                }
                prefix={<CrownOutlined style={{ color: myRank <= 3 ? '#faad14' : '#d9d9d9' }} />}
              />
            </Card>
          </Col>

          {/* My Performance vs Team Average */}
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title={t('profile.myPerformance', 'My Inspections')}
                value={stats?.inspections_completed || 0}
                valueStyle={{ color: (stats?.inspections_completed || 0) >= teamAvgInspections ? '#52c41a' : '#ff4d4f' }}
              />
              <Text type="secondary">
                {t('profile.teamAverage', 'Team Average')}: {teamAvgInspections}
              </Text>
            </Card>
          </Col>

          {/* Top Performer */}
          <Col xs={24} md={8}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar icon={<TrophyOutlined />} style={{ backgroundColor: '#faad14' }} />
                <div>
                  <Text type="secondary">{t('profile.topPerformer', 'Top Performer')}</Text>
                  <div>
                    <Text strong>{teamMembers[0]?.full_name || user.full_name}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          {/* Team Comparison Chart */}
          <Col xs={24}>
            <PerformanceChart
              title={t('profile.teamComparison', 'Team Comparison')}
              data={(teamMembers.length > 0 ? teamMembers : [user]).slice(0, 8).map((m: any, i: number) => ({
                name: m.full_name?.split(' ')[0] || `Member ${i + 1}`,
                value: m.inspections_count || Math.floor(Math.random() * 50) + 10,
                inspections: m.inspections_count || Math.floor(Math.random() * 50) + 10,
              }))}
              series={[
                { key: 'inspections', name: t('profile.inspections', 'Inspections'), color: '#1890ff' },
              ]}
              type="bar"
              height={300}
            />
          </Col>

          {/* Team Rankings Table */}
          <Col xs={24}>
            <Card title={t('leaderboard.rankings', 'Team Rankings')}>
              <Table
                dataSource={(teamMembers.length > 0 ? teamMembers : [{ ...user, inspections_count: stats?.inspections_completed || 0 }]).slice(0, 10)}
                rowKey="id"
                pagination={false}
                size="small"
                columns={[
                  {
                    title: '#',
                    width: 50,
                    render: (_: any, __: any, index: number) => (
                      <Badge
                        count={index + 1}
                        style={{ backgroundColor: index < 3 ? '#faad14' : '#d9d9d9' }}
                      />
                    ),
                  },
                  {
                    title: t('common.name', 'Name'),
                    dataIndex: 'full_name',
                    render: (name: string, record: any) => (
                      <Space>
                        <Avatar size="small" icon={<UserOutlined />} src={(record as any).avatar_url} />
                        <Text strong={record.id === user?.id}>{name}</Text>
                        {record.id === user?.id && <Tag color="blue">{t('leaderboard.my_rank', 'You')}</Tag>}
                      </Space>
                    ),
                  },
                  {
                    title: t('profile.inspections', 'Inspections'),
                    dataIndex: 'inspections_count',
                    render: (count: number) => count || 0,
                  },
                  {
                    title: t('common.role', 'Role'),
                    dataIndex: 'role',
                    render: (role: string) => <Tag>{role?.replace('_', ' ')}</Tag>,
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'skills',
      label: (
        <Space>
          <SafetyCertificateOutlined />
          {t('profile.skills', 'Skills & Certifications')}
        </Space>
      ),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card
              title={t('profile.certifications', 'Certifications')}
              extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCertModalOpen(true)}>
                  {t('profile.addCertification', 'Add Certification')}
                </Button>
              }
            >
              {certifications.length === 0 ? (
                <Empty description={t('profile.noCertifications', 'No certifications added')} />
              ) : (
                <List
                  dataSource={certifications}
                  renderItem={(cert) => (
                    <List.Item
                      actions={[
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveCertification(cert.id)}
                        />,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={
                          <Avatar
                            icon={<SafetyCertificateOutlined />}
                            style={{
                              backgroundColor: cert.status === 'valid' ? '#52c41a' :
                                               cert.status === 'expiring_soon' ? '#faad14' : '#ff4d4f'
                            }}
                          />
                        }
                        title={cert.name}
                        description={
                          <Space direction="vertical" size={0}>
                            <Text type="secondary">{t('profile.issuedBy', 'Issued By')}: {cert.issuedBy}</Text>
                            <Text type="secondary">
                              {t('profile.expiryDate', 'Expires')}: {cert.expiryDate}
                            </Text>
                          </Space>
                        }
                      />
                      <Tag
                        color={cert.status === 'valid' ? 'success' : cert.status === 'expiring_soon' ? 'warning' : 'error'}
                        icon={cert.status === 'valid' ? <CheckCircleOutlined /> :
                              cert.status === 'expiring_soon' ? <ClockCircleOutlined /> : <WarningOutlined />}
                      >
                        {cert.status === 'valid' ? t('profile.valid', 'Valid') :
                         cert.status === 'expiring_soon' ? t('profile.expiringSoon', 'Expiring Soon') :
                         t('profile.expired', 'Expired')}
                      </Tag>
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>

          {/* Skills Progress */}
          <Col xs={24} md={12}>
            <Card title={t('workPlan.workerSkills', 'Skill Proficiency')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>{t('skillType.certification', 'Mechanical Systems')}</Text>
                    <Text>85%</Text>
                  </div>
                  <Progress percent={85} showInfo={false} strokeColor="#52c41a" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>{t('skillType.experience', 'Electrical Systems')}</Text>
                    <Text>70%</Text>
                  </div>
                  <Progress percent={70} showInfo={false} strokeColor="#1890ff" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>{t('skillType.training', 'Safety Protocols')}</Text>
                    <Text>95%</Text>
                  </div>
                  <Progress percent={95} showInfo={false} strokeColor="#722ed1" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>{t('skillType.license', 'Equipment Operation')}</Text>
                    <Text>80%</Text>
                  </div>
                  <Progress percent={80} showInfo={false} strokeColor="#faad14" />
                </div>
              </Space>
            </Card>
          </Col>

          {/* Certification Stats */}
          <Col xs={24} md={12}>
            <Card title={t('profile.certifications', 'Certification Status')}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title={t('profile.valid', 'Valid')}
                    value={certifications.filter(c => c.status === 'valid').length}
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<CheckCircleOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('profile.expiringSoon', 'Expiring')}
                    value={certifications.filter(c => c.status === 'expiring_soon').length}
                    valueStyle={{ color: '#faad14' }}
                    prefix={<ClockCircleOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('profile.expired', 'Expired')}
                    value={certifications.filter(c => c.status === 'expired').length}
                    valueStyle={{ color: '#ff4d4f' }}
                    prefix={<WarningOutlined />}
                  />
                </Col>
              </Row>
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
                <Button
                  icon={<FilePdfOutlined />}
                  onClick={handleExportPDF}
                  loading={isExportingPDF}
                >
                  {t('profile.exportPDF', 'Export PDF')}
                </Button>
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

      {/* Add Certification Modal */}
      <Modal
        title={t('profile.addCertification', 'Add Certification')}
        open={certModalOpen}
        onCancel={() => {
          setCertModalOpen(false);
          certForm.resetFields();
        }}
        onOk={handleAddCertification}
      >
        <Form form={certForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('profile.certificationName', 'Certification Name')}
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., Certified Crane Operator" />
          </Form.Item>
          <Form.Item
            name="issuedBy"
            label={t('profile.issuedBy', 'Issued By')}
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., OSHA" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="issuedDate"
                label={t('profile.issuedDate', 'Issued Date')}
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="expiryDate"
                label={t('profile.expiryDate', 'Expiry Date')}
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
