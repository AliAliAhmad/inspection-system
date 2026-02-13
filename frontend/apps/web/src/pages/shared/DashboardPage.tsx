import { Card, Row, Col, Statistic, Typography, Spin, Alert, Button, Progress, Badge, Tooltip, Space, Tag } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  ToolOutlined,
  PercentageOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  FireOutlined,
  RocketOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi, DashboardData, AdminDashboardData, WorkPlanStats } from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { CACHE_KEYS } from '../../utils/offline-storage';
import { useQuery } from '@tanstack/react-query';

const { Title, Text } = Typography;

// Job type emoji mapping
const JOB_TYPE_EMOJI: Record<string, string> = {
  pm: '🔧',
  defect: '🔴',
  inspection: '✅',
};

// Priority colors
const PRIORITY_COLORS: Record<string, string> = {
  normal: '#52c41a',
  high: '#faad14',
  urgent: '#ff4d4f',
  critical: '#ff4d4f',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isEngineer = user?.role === 'engineer' || user?.role === 'admin';

  // Basic dashboard data
  const { data: dashData, isLoading: dashLoading, error: dashError } = useOfflineQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard().then(r => r.data.data),
    enabled: !isAdmin,
    cacheKey: CACHE_KEYS.dashboard,
    cacheTtlMs: 15 * 60 * 1000,
  });

  const { data: adminData, isLoading: adminLoading, error: adminError } = useOfflineQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => reportsApi.getAdminDashboard().then(r => r.data.data),
    enabled: isAdmin,
    cacheKey: 'admin-dashboard',
    cacheTtlMs: 15 * 60 * 1000,
  });

  // Work plan stats - for engineers and admins
  const { data: workPlanStats, isLoading: wpLoading } = useQuery({
    queryKey: ['work-plan-stats'],
    queryFn: () => reportsApi.getWorkPlanStats().then(r => r.data.data),
    enabled: isEngineer,
    staleTime: 5 * 60 * 1000,
  });

  const loading = isAdmin ? adminLoading : dashLoading;
  const error = isAdmin ? adminError : dashError;

  if (loading || wpLoading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  // Format week range
  const formatWeekRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        👋 {t('common.welcome')}, {user?.full_name}
      </Title>

      {/* Quick Actions for Engineers/Admins */}
      {isEngineer && (
        <Card
          size="small"
          style={{ marginBottom: 16, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <RocketOutlined style={{ color: '#fff', fontSize: 20 }} />
                <Text strong style={{ color: '#fff', fontSize: 16 }}>Quick Actions</Text>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button
                  type="primary"
                  ghost
                  icon={<CalendarOutlined />}
                  onClick={() => navigate('/admin/work-planning')}
                  style={{ borderColor: '#fff', color: '#fff' }}
                >
                  📅 Work Planning
                </Button>
                <Button
                  type="primary"
                  ghost
                  icon={<UploadOutlined />}
                  onClick={() => navigate('/admin/work-planning')}
                  style={{ borderColor: '#fff', color: '#fff' }}
                >
                  📥 Import SAP
                </Button>
                {!workPlanStats?.has_plan && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/admin/work-planning')}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  >
                    ➕ Create Plan
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* Work Plan Stats Widget - For Engineers/Admins */}
      {isEngineer && workPlanStats && (
        <Card
          title={
            <Space>
              <span style={{ fontSize: 20 }}>📊</span>
              <span>This Week's Work Plan</span>
              {workPlanStats.has_plan && (
                <Tag color={workPlanStats.plan_status === 'published' ? 'green' : 'orange'}>
                  {workPlanStats.plan_status?.toUpperCase()}
                </Tag>
              )}
            </Space>
          }
          extra={
            <Text type="secondary">
              {formatWeekRange(workPlanStats.week_start, workPlanStats.week_end)}
            </Text>
          }
          style={{ marginBottom: 16 }}
        >
          {!workPlanStats.has_plan ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary" style={{ fontSize: 16 }}>
                📭 No work plan for this week
              </Text>
              <br />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ marginTop: 16 }}
                onClick={() => navigate('/admin/work-planning')}
              >
                Create Work Plan
              </Button>
            </div>
          ) : (
            <>
              {/* Stats Row */}
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={8} md={4}>
                  <Card size="small" style={{ textAlign: 'center', background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Statistic
                      title={<span>📦 Total</span>}
                      value={workPlanStats.total_jobs}
                      valueStyle={{ color: '#52c41a', fontSize: 28 }}
                    />
                  </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                  <Card size="small" style={{ textAlign: 'center', background: '#e6f7ff', borderColor: '#91d5ff' }}>
                    <Statistic
                      title={<span>📥 In Pool</span>}
                      value={workPlanStats.jobs_in_pool}
                      valueStyle={{ color: '#1890ff', fontSize: 28 }}
                    />
                  </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                  <Card size="small" style={{ textAlign: 'center', background: '#fff7e6', borderColor: '#ffd591' }}>
                    <Statistic
                      title={<span>🔄 In Progress</span>}
                      value={workPlanStats.in_progress_jobs}
                      valueStyle={{ color: '#fa8c16', fontSize: 28 }}
                    />
                  </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                  <Card size="small" style={{ textAlign: 'center', background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Statistic
                      title={<span>✅ Done</span>}
                      value={workPlanStats.completed_jobs}
                      valueStyle={{ color: '#52c41a', fontSize: 28 }}
                    />
                  </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                  <Card size="small" style={{ textAlign: 'center', background: workPlanStats.overdue_jobs > 0 ? '#fff2e8' : '#fafafa', borderColor: workPlanStats.overdue_jobs > 0 ? '#ffbb96' : '#d9d9d9' }}>
                    <Statistic
                      title={<span>⚠️ Overdue</span>}
                      value={workPlanStats.overdue_jobs}
                      valueStyle={{ color: workPlanStats.overdue_jobs > 0 ? '#fa541c' : '#8c8c8c', fontSize: 28 }}
                    />
                  </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                  <Card size="small" style={{ textAlign: 'center', background: workPlanStats.critical_jobs > 0 ? '#fff1f0' : '#fafafa', borderColor: workPlanStats.critical_jobs > 0 ? '#ffa39e' : '#d9d9d9' }}>
                    <Statistic
                      title={<span>🔥 Critical</span>}
                      value={workPlanStats.critical_jobs}
                      valueStyle={{ color: workPlanStats.critical_jobs > 0 ? '#cf1322' : '#8c8c8c', fontSize: 28 }}
                    />
                  </Card>
                </Col>
              </Row>

              {/* Jobs by Type */}
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col xs={24} md={8}>
                  <Card size="small" title="📊 Jobs by Type" bodyStyle={{ padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                      <Tooltip title="PM Jobs">
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 24 }}>🔧</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>{workPlanStats.jobs_by_type.pm}</div>
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>PM</div>
                        </div>
                      </Tooltip>
                      <Tooltip title="Defect Jobs">
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 24 }}>🔴</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#f5222d' }}>{workPlanStats.jobs_by_type.defect}</div>
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>Defect</div>
                        </div>
                      </Tooltip>
                      <Tooltip title="Inspection Jobs">
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 24 }}>✅</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{workPlanStats.jobs_by_type.inspection}</div>
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>Inspection</div>
                        </div>
                      </Tooltip>
                    </div>
                  </Card>
                </Col>

                {/* Jobs by Day Chart */}
                <Col xs={24} md={16}>
                  <Card size="small" title="📅 Jobs by Day" bodyStyle={{ padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 80 }}>
                      {workPlanStats.jobs_by_day.map((day) => {
                        const maxJobs = Math.max(...workPlanStats.jobs_by_day.map(d => d.count), 1);
                        const height = Math.max((day.count / maxJobs) * 60, 4);
                        return (
                          <Tooltip key={day.date} title={`${day.day_name}: ${day.count} jobs`}>
                            <div style={{ textAlign: 'center', flex: 1 }}>
                              <div
                                style={{
                                  height: height,
                                  background: day.is_today
                                    ? 'linear-gradient(180deg, #52c41a 0%, #237804 100%)'
                                    : 'linear-gradient(180deg, #1890ff 0%, #0050b3 100%)',
                                  borderRadius: '4px 4px 0 0',
                                  margin: '0 2px',
                                  transition: 'height 0.3s'
                                }}
                              />
                              <div style={{
                                fontSize: 10,
                                fontWeight: day.is_today ? 700 : 400,
                                color: day.is_today ? '#52c41a' : '#595959',
                                marginTop: 4
                              }}>
                                {day.day_name}
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{day.count}</div>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* Today's Focus */}
              {workPlanStats.today_jobs.length > 0 && (
                <Card
                  size="small"
                  title={<span>🎯 Today's Focus</span>}
                  style={{ marginTop: 16 }}
                  extra={
                    <Button type="link" onClick={() => navigate('/admin/work-planning')}>
                      View All →
                    </Button>
                  }
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {workPlanStats.today_jobs.map((job) => (
                      <Card
                        key={job.id}
                        size="small"
                        style={{
                          width: 200,
                          borderLeft: `4px solid ${PRIORITY_COLORS[job.priority] || '#1890ff'}`
                        }}
                        bodyStyle={{ padding: '8px 12px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 16 }}>{JOB_TYPE_EMOJI[job.job_type] || '📋'}</span>
                          <Text strong ellipsis style={{ flex: 1 }}>{job.equipment_name}</Text>
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tag color={job.status === 'completed' ? 'green' : job.status === 'in_progress' ? 'orange' : 'default'}>
                            {job.status}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{job.estimated_hours}h</Text>
                        </div>
                      </Card>
                    ))}
                  </div>
                </Card>
              )}

              {/* Team Workload */}
              {workPlanStats.team_workload.length > 0 && (
                <Card
                  size="small"
                  title={<span>👥 Team Workload</span>}
                  style={{ marginTop: 16 }}
                >
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {workPlanStats.team_workload.slice(0, 6).map((member) => {
                      const maxHours = Math.max(...workPlanStats.team_workload.map(m => m.hours), 40);
                      const percent = Math.min((member.hours / maxHours) * 100, 100);
                      return (
                        <div key={member.user_id} style={{ minWidth: 150, flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text ellipsis style={{ maxWidth: 100 }}>
                              {member.on_leave ? '🏖️ ' : ''}{member.name}
                            </Text>
                            <Text strong>{member.hours}h</Text>
                          </div>
                          <Progress
                            percent={percent}
                            showInfo={false}
                            strokeColor={member.on_leave ? '#d9d9d9' : percent > 80 ? '#ff4d4f' : percent > 60 ? '#faad14' : '#52c41a'}
                            size="small"
                          />
                          <Text type="secondary" style={{ fontSize: 11 }}>{member.job_count} jobs</Text>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </>
          )}
        </Card>
      )}

      {/* Admin Stats */}
      {isAdmin && adminData ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/admin/users')}>
              <Statistic
                title={<span>👥 {t('nav.users')}</span>}
                value={adminData.users_count}
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/admin/equipment')}>
              <Statistic
                title={<span>⚙️ {t('nav.equipment')}</span>}
                value={adminData.equipment_count}
                prefix={<AppstoreOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/admin/inspections')}>
              <Statistic
                title={<span>✅ {t('nav.inspections')} Today</span>}
                value={adminData.inspections_today}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/admin/defects')}>
              <Statistic
                title={<span>⚠️ Open {t('nav.defects')}</span>}
                value={adminData.open_defects}
                prefix={<WarningOutlined />}
                valueStyle={{ color: adminData.open_defects > 0 ? '#cf1322' : undefined }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/leaves')}>
              <Statistic
                title={<span>🏖️ Active {t('nav.leaves')}</span>}
                value={adminData.active_leaves}
                prefix={<CalendarOutlined />}
              />
            </Card>
          </Col>
        </Row>
      ) : dashData && !isEngineer ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={<span>✅ {t('nav.inspections')}</span>}
                value={dashData.total_inspections}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={<span>⚠️ Pending {t('nav.defects')}</span>}
                value={dashData.pending_defects}
                prefix={<WarningOutlined />}
                valueStyle={{ color: dashData.pending_defects > 0 ? '#cf1322' : undefined }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={<span>🔧 Active Jobs</span>}
                value={dashData.active_jobs}
                prefix={<ToolOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={<span>📈 Completion Rate</span>}
                value={dashData.completion_rate}
                suffix="%"
                prefix={<PercentageOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
        </Row>
      ) : null}
    </div>
  );
}
