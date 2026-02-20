import { Card, Row, Col, Typography, Spin, Alert, Button, Progress, Tag, Tooltip, Space, Badge, Tabs, Statistic } from 'antd';
import {
  CalendarOutlined,
  PlusOutlined,
  RocketOutlined,
  TeamOutlined,
  ToolOutlined,
  FileTextOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  RightOutlined,
  BugOutlined,
  ScheduleOutlined,
  SafetyOutlined,
  FireOutlined,
  AimOutlined,
  FundProjectionScreenOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  UserSwitchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi, DashboardData, AdminDashboardData, WorkPlanStats, rosterApi } from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { CACHE_KEYS } from '../../utils/offline-storage';
import { useQuery } from '@tanstack/react-query';

const { Title, Text } = Typography;

// Priority colors
const PRIORITY_COLORS: Record<string, string> = {
  normal: '#52c41a',
  high: '#faad14',
  urgent: '#ff4d4f',
  critical: '#ff4d4f',
};

// Job type config
const JOB_TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  pm: { emoji: '\u{1F527}', label: 'PM', color: '#1890ff' },
  defect: { emoji: '\u{1F534}', label: 'Defect', color: '#f5222d' },
  inspection: { emoji: '\u2705', label: 'Inspection', color: '#52c41a' },
};

// Time-based greeting
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isEngineer = user?.role === 'engineer' || user?.role === 'admin';

  const { data: dashData, isLoading: dashLoading, error: dashError } = useOfflineQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard().then((r) => r.data.data),
    enabled: !isAdmin,
    cacheKey: CACHE_KEYS.dashboard,
    cacheTtlMs: 15 * 60 * 1000,
  });

  const { data: adminData, isLoading: adminLoading, error: adminError } = useOfflineQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => reportsApi.getAdminDashboard().then((r) => r.data.data),
    enabled: isAdmin,
    cacheKey: 'admin-dashboard',
    cacheTtlMs: 15 * 60 * 1000,
  });

  const { data: workPlanStats, isLoading: wpLoading } = useQuery({
    queryKey: ['work-plan-stats'],
    queryFn: () => reportsApi.getWorkPlanStats().then((r) => r.data.data),
    enabled: isEngineer,
    staleTime: 5 * 60 * 1000,
  });

  // Roster availability for shift overview
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: rosterData } = useQuery({
    queryKey: ['roster-availability', todayStr],
    queryFn: () => rosterApi.getDayAvailability(todayStr).then(r => r.data.data),
    enabled: isEngineer,
    staleTime: 10 * 60 * 1000,
  });

  const loading = isAdmin ? adminLoading : dashLoading;
  const error = isAdmin ? adminError : dashError;

  if (loading || wpLoading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  const formatWeekRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  // Compute KPIs
  const kpis = isAdmin ? {
    totalEquipment: adminData?.equipment_count ?? 0,
    inspectionsToday: adminData?.inspections_today ?? 0,
    openDefects: adminData?.open_defects ?? 0,
    activeLeaves: adminData?.active_leaves ?? 0,
    usersCount: adminData?.users_count ?? 0,
    overdueJobs: workPlanStats?.overdue_jobs ?? 0,
    criticalJobs: workPlanStats?.critical_jobs ?? 0,
    completionRate: workPlanStats && workPlanStats.total_jobs > 0
      ? Math.round((workPlanStats.completed_jobs / workPlanStats.total_jobs) * 100) : 0,
  } : {
    totalInspections: (dashData as DashboardData)?.total_inspections ?? 0,
    activeJobs: (dashData as DashboardData)?.active_jobs ?? 0,
    completionRate: 0,
    totalEquipment: 0,
    inspectionsToday: 0,
    openDefects: 0,
    activeLeaves: 0,
    usersCount: 0,
    overdueJobs: 0,
    criticalJobs: 0,
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ─── Welcome Header ─── */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          {getGreeting()}, {user?.full_name?.split(' ')[0]}
        </Title>
        <Text type="secondary" style={{ fontSize: 14 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          {isAdmin && adminData && (
            <span> &middot; {kpis.usersCount} team members</span>
          )}
        </Text>
      </div>

      {/* ─── Smart Alerts (only shows when something needs attention) ─── */}
      {isAdmin && (kpis.openDefects > 0 || kpis.overdueJobs > 0 || kpis.completionRate === 0) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <ThunderboltOutlined style={{ color: '#fa8c16', fontSize: 16 }} />
            <Text strong style={{ fontSize: 13, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.5 }}>Needs Your Attention</Text>
          </div>
          <Row gutter={[12, 12]}>
            {kpis.openDefects > 0 && (
              <Col xs={12} sm={6}>
                <Card
                  hoverable
                  onClick={() => navigate('/admin/defects')}
                  style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f', cursor: 'pointer' }}
                  styles={{ body: { padding: '12px 14px' } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BugOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#ff4d4f', lineHeight: 1 }}>{kpis.openDefects}</div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>Open Defects</div>
                    </div>
                  </div>
                </Card>
              </Col>
            )}
            {kpis.overdueJobs > 0 && (
              <Col xs={12} sm={6}>
                <Card
                  hoverable
                  onClick={() => navigate('/admin/overdue')}
                  style={{ borderRadius: 10, borderLeft: '4px solid #fa541c', cursor: 'pointer' }}
                  styles={{ body: { padding: '12px 14px' } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ClockCircleOutlined style={{ fontSize: 20, color: '#fa541c' }} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fa541c', lineHeight: 1 }}>{kpis.overdueJobs}</div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>Overdue Jobs</div>
                    </div>
                  </div>
                </Card>
              </Col>
            )}
            {workPlanStats && kpis.completionRate === 0 && workPlanStats.total_jobs > 0 && (
              <Col xs={12} sm={6}>
                <Card
                  hoverable
                  onClick={() => navigate('/admin/work-planning')}
                  style={{ borderRadius: 10, borderLeft: '4px solid #faad14', cursor: 'pointer' }}
                  styles={{ body: { padding: '12px 14px' } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CalendarOutlined style={{ fontSize: 20, color: '#faad14' }} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#faad14', lineHeight: 1 }}>0%</div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>Work Plan</div>
                    </div>
                  </div>
                </Card>
              </Col>
            )}
            {workPlanStats?.plan_status === 'draft' && (
              <Col xs={12} sm={6}>
                <Card
                  hoverable
                  onClick={() => navigate('/admin/daily-review')}
                  style={{ borderRadius: 10, borderLeft: '4px solid #597ef7', cursor: 'pointer' }}
                  styles={{ body: { padding: '12px 14px' } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ScheduleOutlined style={{ fontSize: 20, color: '#597ef7' }} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#597ef7', lineHeight: 1 }}>Draft</div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>Review Pending</div>
                    </div>
                  </div>
                </Card>
              </Col>
            )}
          </Row>
        </div>
      )}

      {/* ─── KPI Stat Cards ─── */}
      {isAdmin && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {[
            {
              title: 'Work Plan Progress',
              value: `${kpis.completionRate}%`,
              icon: <CalendarOutlined />,
              color: '#667eea',
              gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              suffix: workPlanStats?.total_jobs ? `${workPlanStats.completed_jobs}/${workPlanStats.total_jobs} jobs` : 'No plan',
              onClick: () => navigate('/admin/work-planning'),
            },
            {
              title: 'Open Defects',
              value: kpis.openDefects,
              icon: <BugOutlined />,
              color: kpis.openDefects > 5 ? '#ff4d4f' : '#fa8c16',
              gradient: kpis.openDefects > 5
                ? 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)'
                : 'linear-gradient(135deg, #fa8c16 0%, #d48806 100%)',
              suffix: kpis.openDefects > 0 ? 'need attention' : 'all clear',
              onClick: () => navigate('/admin/defects'),
            },
            {
              title: 'Inspections Today',
              value: kpis.inspectionsToday,
              icon: <FileTextOutlined />,
              color: '#52c41a',
              gradient: 'linear-gradient(135deg, #52c41a 0%, #237804 100%)',
              suffix: 'scheduled',
              onClick: () => navigate('/admin/inspections'),
            },
            {
              title: 'Team on Leave',
              value: kpis.activeLeaves,
              icon: <TeamOutlined />,
              color: kpis.activeLeaves > 3 ? '#fa8c16' : '#13c2c2',
              gradient: kpis.activeLeaves > 3
                ? 'linear-gradient(135deg, #fa8c16 0%, #d48806 100%)'
                : 'linear-gradient(135deg, #13c2c2 0%, #006d75 100%)',
              suffix: `of ${kpis.usersCount} total`,
              onClick: () => navigate('/leaves'),
            },
          ].map((kpi, i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card
                className="dash-stat-card"
                hoverable
                onClick={kpi.onClick}
                style={{ borderRadius: 12, overflow: 'hidden' }}
                styles={{ body: { padding: 0 } }}
              >
                <div style={{
                  background: kpi.gradient,
                  padding: '16px 20px',
                  color: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>{kpi.title}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{kpi.value}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{kpi.suffix}</div>
                  </div>
                  <div style={{ fontSize: 32, opacity: 0.3 }}>{kpi.icon}</div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* ─── NEW: Extra Stat Cards ─── */}
      {isAdmin && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card hoverable onClick={() => navigate('/admin/work-planning')} style={{ borderRadius: 12, textAlign: 'center' }} styles={{ body: { padding: '14px 12px' } }}>
              <FundProjectionScreenOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 6 }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{kpis.completionRate}%</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>Completion Rate</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card hoverable onClick={() => navigate('/admin/assessments')} style={{ borderRadius: 12, textAlign: 'center' }} styles={{ body: { padding: '14px 12px' } }}>
              <AimOutlined style={{ fontSize: 24, color: '#722ed1', marginBottom: 6 }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: '#722ed1' }}>{kpis.inspectionsToday}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>Assessments Today</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card hoverable onClick={() => navigate('/admin/monitor-followups')} style={{ borderRadius: 12, textAlign: 'center' }} styles={{ body: { padding: '14px 12px' } }}>
              <FieldTimeOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 6 }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1890ff' }}>{kpis.criticalJobs}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>Follow-Up Pending</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card hoverable onClick={() => navigate('/admin/backlog')} style={{ borderRadius: 12, textAlign: 'center' }} styles={{ body: { padding: '14px 12px' } }}>
              <InboxOutlined style={{ fontSize: 24, color: '#fa8c16', marginBottom: 6 }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fa8c16' }}>{kpis.overdueJobs}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>Backlog Items</div>
            </Card>
          </Col>
        </Row>
      )}

      {/* ─── Non-Admin KPI Cards ─── */}
      {!isAdmin && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12}>
            <Card className="dash-stat-card" hoverable onClick={() => {
              if (user?.role === 'inspector') navigate('/inspector/assignments');
              else if (user?.role === 'specialist') navigate('/specialist/jobs');
              else if (user?.role === 'engineer') navigate('/engineer/jobs');
            }}>
              <Statistic
                title="My Active Tasks"
                value={kpis.activeJobs || kpis.totalInspections || 0}
                prefix={<FileTextOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card className="dash-stat-card" hoverable onClick={() => navigate('/leaderboard')}>
              <Statistic
                title="Leaderboard"
                value="View Rankings"
                prefix={<SafetyOutlined />}
                valueStyle={{ color: '#722ed1', fontSize: 18 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ─── Main Content: 2 columns ─── */}
      <Row gutter={[20, 20]}>
        {/* Left Column: Work Plan + Alerts */}
        <Col xs={24} lg={16}>
          {/* Work Plan Summary */}
          {isEngineer && workPlanStats && (
            <Card
              title={
                <Space>
                  <CalendarOutlined />
                  <span>This Week&apos;s Work Plan</span>
                  {workPlanStats.has_plan && (
                    <Tag color={workPlanStats.plan_status === 'published' ? 'green' : 'orange'}>
                      {workPlanStats.plan_status?.toUpperCase()}
                    </Tag>
                  )}
                </Space>
              }
              extra={
                <Button type="link" onClick={() => navigate('/admin/work-planning')} icon={<RightOutlined />}>
                  Open Plan
                </Button>
              }
              style={{ borderRadius: 12, marginBottom: 20 }}
              styles={{ body: { padding: workPlanStats.has_plan ? '0 0 12px' : undefined } }}
            >
              {!workPlanStats.has_plan ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Text type="secondary" style={{ fontSize: 16 }}>No work plan for this week</Text>
                  <br />
                  <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 16 }} onClick={() => navigate('/admin/work-planning')}>
                    Create Work Plan
                  </Button>
                </div>
              ) : (
                <Tabs
                  defaultActiveKey="overview"
                  style={{ padding: '0 16px' }}
                  items={[
                    {
                      key: 'overview',
                      label: 'Overview',
                      children: (
                        <div>
                          {/* Stat Row */}
                          <Row gutter={16} style={{ marginBottom: 12 }}>
                            {[
                              { label: 'Total', value: workPlanStats.total_jobs, color: '#595959' },
                              { label: 'Pool', value: workPlanStats.jobs_in_pool, color: '#1890ff' },
                              { label: 'Active', value: workPlanStats.in_progress_jobs, color: '#fa8c16' },
                              { label: 'Done', value: workPlanStats.completed_jobs, color: '#52c41a' },
                              { label: 'Overdue', value: workPlanStats.overdue_jobs, color: '#fa541c' },
                              { label: 'Critical', value: workPlanStats.critical_jobs, color: '#cf1322' },
                            ].map((s) => (
                              <Col xs={8} sm={4} key={s.label} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: 11, color: '#8c8c8c' }}>{s.label}</div>
                              </Col>
                            ))}
                          </Row>
                          {/* Progress bar */}
                          {workPlanStats.total_jobs > 0 && (
                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' }}>
                              {[
                                { value: workPlanStats.completed_jobs, color: '#52c41a' },
                                { value: workPlanStats.in_progress_jobs, color: '#fa8c16' },
                                { value: workPlanStats.jobs_in_pool, color: '#1890ff' },
                                { value: workPlanStats.overdue_jobs, color: '#fa541c' },
                              ].filter((s) => s.value > 0).map((s, i) => (
                                <Tooltip key={i} title={`${s.value} jobs`}>
                                  <div style={{ width: `${(s.value / workPlanStats.total_jobs) * 100}%`, background: s.color, transition: 'width 0.3s' }} />
                                </Tooltip>
                              ))}
                            </div>
                          )}

                          {/* Jobs by Type */}
                          <Row gutter={12} style={{ marginTop: 16 }}>
                            {[
                              { type: 'pm', label: 'PM', color: '#1890ff', emoji: '\u{1F527}' },
                              { type: 'defect', label: 'Defect', color: '#f5222d', emoji: '\u{1F534}' },
                              { type: 'inspection', label: 'Inspection', color: '#52c41a', emoji: '\u2705' },
                            ].map((jt) => {
                              const count = (workPlanStats.jobs_by_type as any)[jt.type] || 0;
                              const pct = workPlanStats.total_jobs > 0 ? Math.round((count / workPlanStats.total_jobs) * 100) : 0;
                              return (
                                <Col xs={24} sm={8} key={jt.type}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 18 }}>{jt.emoji}</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <Text style={{ fontSize: 12 }}>{jt.label}</Text>
                                        <Text strong style={{ fontSize: 12 }}>{count} ({pct}%)</Text>
                                      </div>
                                      <Progress percent={pct} showInfo={false} strokeColor={jt.color} size="small" />
                                    </div>
                                  </div>
                                </Col>
                              );
                            })}
                          </Row>
                        </div>
                      ),
                    },
                    {
                      key: 'schedule',
                      label: 'Schedule',
                      children: (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, gap: 6 }}>
                            {workPlanStats.jobs_by_day.map((day) => {
                              const maxJobs = Math.max(...workPlanStats.jobs_by_day.map((d) => d.count), 1);
                              const height = Math.max((day.count / maxJobs) * 110, 6);
                              const isToday = day.is_today;
                              return (
                                <Tooltip key={day.date} title={`${day.day_name}: ${day.count} jobs`}>
                                  <div
                                    style={{ textAlign: 'center', flex: 1, cursor: 'pointer', padding: '4px 0', borderRadius: 8, background: isToday ? '#f6ffed' : 'transparent' }}
                                    onClick={() => navigate('/admin/work-planning')}
                                  >
                                    <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? '#52c41a' : '#262626', marginBottom: 4 }}>
                                      {day.count}
                                    </div>
                                    <div
                                      style={{
                                        height,
                                        background: isToday
                                          ? 'linear-gradient(180deg, #73d13d 0%, #237804 100%)'
                                          : 'linear-gradient(180deg, #69b1ff 0%, #0958d9 100%)',
                                        borderRadius: 6,
                                        margin: '0 4px',
                                        transition: 'height 0.3s',
                                      }}
                                    />
                                    <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? '#52c41a' : '#595959', marginTop: 6 }}>
                                      {day.day_name}
                                    </div>
                                    {isToday && <Tag color="green" style={{ fontSize: 10, margin: '4px 0 0', padding: '0 4px' }}>TODAY</Tag>}
                                  </div>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'team',
                      label: `Team (${workPlanStats.team_workload.length})`,
                      children: (
                        <div>
                          {workPlanStats.team_workload.length === 0 ? (
                            <Text type="secondary">No team data available</Text>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                              {workPlanStats.team_workload.map((member) => {
                                const maxHours = Math.max(...workPlanStats.team_workload.map((m) => m.hours), 40);
                                const percent = Math.min(Math.round((member.hours / maxHours) * 100), 100);
                                return (
                                  <div key={member.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, background: member.on_leave ? '#fafafa' : 'transparent' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text ellipsis style={{ fontSize: 13, maxWidth: 120 }}>
                                          {member.on_leave && '\u{1F3D6}\uFE0F '}{member.name}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>{member.job_count} jobs &middot; {member.hours}h</Text>
                                      </div>
                                      <Progress
                                        percent={percent}
                                        showInfo={false}
                                        strokeColor={member.on_leave ? '#d9d9d9' : percent > 80 ? '#ff4d4f' : percent > 60 ? '#faad14' : '#52c41a'}
                                        size="small"
                                        style={{ marginTop: 2 }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'focus',
                      label: `Today (${workPlanStats.today_jobs.length})`,
                      children: (
                        <div>
                          {workPlanStats.today_jobs.length === 0 ? (
                            <Text type="secondary">No jobs scheduled for today</Text>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {workPlanStats.today_jobs.map((job) => (
                                <div
                                  key={job.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 8,
                                    borderLeft: `4px solid ${PRIORITY_COLORS[job.priority] || '#1890ff'}`,
                                    background: '#fafafa',
                                  }}
                                >
                                  <span style={{ fontSize: 18 }}>{JOB_TYPE_CONFIG[job.job_type]?.emoji || '\u{1F4CB}'}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text strong ellipsis style={{ fontSize: 13 }}>{job.equipment_name}</Text>
                                  </div>
                                  <Tag color={job.status === 'completed' ? 'green' : job.status === 'in_progress' ? 'orange' : 'default'} style={{ margin: 0 }}>
                                    {job.status}
                                  </Tag>
                                  <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{job.estimated_hours}h</Text>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          )}

          {/* ─── Shift Overview ─── */}
          {isEngineer && rosterData && (
            <Card
              title={
                <Space>
                  <UserSwitchOutlined style={{ color: '#722ed1' }} />
                  <span>Shift Overview</span>
                  <Tag color="purple">{new Date().toLocaleDateString('en-US', { weekday: 'short' })}</Tag>
                </Space>
              }
              style={{ borderRadius: 12, marginBottom: 20 }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <Row gutter={16}>
                <Col span={8} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}>
                    {rosterData.available?.length ?? 0}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>On Duty</Text>
                </Col>
                <Col span={8} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fa8c16' }}>
                    {rosterData.on_leave?.length ?? 0}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>On Leave</Text>
                </Col>
                <Col span={8} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#1890ff' }}>
                    {(rosterData.available?.length ?? 0) + (rosterData.on_leave?.length ?? 0)}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Total Team</Text>
                </Col>
              </Row>
              {rosterData.available && rosterData.available.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {rosterData.available.slice(0, 12).map((u: any) => (
                    <Tag key={u.id} style={{ borderRadius: 12, fontSize: 11 }}>
                      {u.full_name?.split(' ')[0]} {u.shift ? `(${u.shift})` : ''}
                    </Tag>
                  ))}
                  {rosterData.available.length > 12 && (
                    <Tag style={{ borderRadius: 12, fontSize: 11, cursor: 'pointer' }} onClick={() => navigate('/admin/roster')}>
                      +{rosterData.available.length - 12} more
                    </Tag>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* ─── Alerts & Attention Section ─── */}
          {isAdmin && (
            <Card
              title={
                <Space>
                  <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
                  <span>Needs Attention</span>
                </Space>
              }
              style={{ borderRadius: 12, marginBottom: 20 }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Overdue */}
                {(kpis.overdueJobs > 0 || kpis.criticalJobs > 0) && (
                  <div
                    className="dash-activity-item"
                    onClick={() => navigate('/admin/overdue')}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16,
                    }}>
                      <FireOutlined />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 13 }}>
                        {kpis.overdueJobs} overdue jobs{kpis.criticalJobs > 0 ? `, ${kpis.criticalJobs} critical` : ''}
                      </Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }}>Require immediate action</Text></div>
                    </div>
                    <RightOutlined style={{ color: '#bfbfbf' }} />
                  </div>
                )}

                {/* Open Defects */}
                {kpis.openDefects > 0 && (
                  <div
                    className="dash-activity-item"
                    onClick={() => navigate('/admin/defects')}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'linear-gradient(135deg, #fa8c16 0%, #d48806 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16,
                    }}>
                      <BugOutlined />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 13 }}>{kpis.openDefects} open defects</Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }}>Unresolved equipment issues</Text></div>
                    </div>
                    <RightOutlined style={{ color: '#bfbfbf' }} />
                  </div>
                )}

                {/* Active Leaves */}
                {kpis.activeLeaves > 0 && (
                  <div
                    className="dash-activity-item"
                    onClick={() => navigate('/leaves')}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'linear-gradient(135deg, #13c2c2 0%, #006d75 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16,
                    }}>
                      <TeamOutlined />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 13 }}>{kpis.activeLeaves} team members on leave</Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }}>Check roster for coverage</Text></div>
                    </div>
                    <RightOutlined style={{ color: '#bfbfbf' }} />
                  </div>
                )}

                {/* All clear */}
                {kpis.overdueJobs === 0 && kpis.criticalJobs === 0 && kpis.openDefects === 0 && kpis.activeLeaves === 0 && (
                  <div style={{ textAlign: 'center', padding: 16 }}>
                    <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 8 }} />
                    <div><Text type="secondary">All clear! No issues need attention.</Text></div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </Col>

        {/* Right Column: Quick Actions + Equipment + Stats */}
        <Col xs={24} lg={8}>
          {/* Quick Actions */}
          <Card
            title={
              <Space>
                <RocketOutlined style={{ color: '#667eea' }} />
                <span>Quick Actions</span>
              </Space>
            }
            style={{ borderRadius: 12, marginBottom: 20 }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {isEngineer && (
                <>
                  <Button
                    block
                    type="default"
                    icon={<CalendarOutlined />}
                    onClick={() => navigate('/admin/work-planning')}
                    style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
                  >
                    Open Work Planning
                  </Button>
                  <Button
                    block
                    type="default"
                    icon={<ScheduleOutlined />}
                    onClick={() => navigate('/admin/daily-review')}
                    style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
                  >
                    Daily Review
                  </Button>
                  <Button
                    block
                    type="default"
                    icon={<AimOutlined />}
                    onClick={() => navigate('/admin/assessments')}
                    style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
                  >
                    Assessment Tracking
                  </Button>
                </>
              )}
              <Button
                block
                type="default"
                icon={<ToolOutlined />}
                onClick={() => navigate('/equipment-dashboard')}
                style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
              >
                Equipment Dashboard
              </Button>
              {user?.role === 'inspector' && (
                <Button
                  block
                  type="default"
                  icon={<FileTextOutlined />}
                  onClick={() => navigate('/inspector/assignments')}
                  style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
                >
                  My Assignments
                </Button>
              )}
              {user?.role === 'specialist' && (
                <Button
                  block
                  type="default"
                  icon={<ToolOutlined />}
                  onClick={() => navigate('/specialist/jobs')}
                  style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
                >
                  My Jobs
                </Button>
              )}
              <Button
                block
                type="default"
                icon={<TeamOutlined />}
                onClick={() => navigate('/leaderboard')}
                style={{ textAlign: 'left', height: 40, borderRadius: 8 }}
              >
                Leaderboard
              </Button>
            </div>
          </Card>

          {/* Equipment Overview */}
          {isAdmin && adminData && (
            <Card
              title={
                <Space>
                  <ToolOutlined style={{ color: '#1890ff' }} />
                  <span>Equipment</span>
                </Space>
              }
              extra={
                <Button type="link" size="small" onClick={() => navigate('/equipment-dashboard')}>
                  View All
                </Button>
              }
              style={{ borderRadius: 12, marginBottom: 20 }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <Row gutter={16}>
                <Col span={12} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#1890ff' }}>{kpis.totalEquipment}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Total</Text>
                </Col>
                <Col span={12} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: kpis.openDefects > 0 ? '#ff4d4f' : '#52c41a' }}>{kpis.openDefects}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Defects</Text>
                </Col>
              </Row>
            </Card>
          )}

          {/* Today's Focus for engineers */}
          {isEngineer && workPlanStats?.today_jobs && workPlanStats.today_jobs.length > 0 && (
            <Card
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: '#52c41a' }} />
                  <span>Today&apos;s Focus</span>
                  <Badge count={workPlanStats.today_jobs.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              }
              style={{ borderRadius: 12 }}
              styles={{ body: { padding: '8px 12px' } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {workPlanStats.today_jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 6,
                      borderLeft: `3px solid ${PRIORITY_COLORS[job.priority] || '#1890ff'}`,
                      background: '#fafafa',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate('/admin/work-planning')}
                  >
                    <span>{JOB_TYPE_CONFIG[job.job_type]?.emoji || '\u{1F4CB}'}</span>
                    <Text ellipsis style={{ fontSize: 12, flex: 1 }}>{job.equipment_name}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{job.estimated_hours}h</Text>
                  </div>
                ))}
                {workPlanStats.today_jobs.length > 5 && (
                  <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', padding: 4 }}>
                    +{workPlanStats.today_jobs.length - 5} more
                  </Text>
                )}
              </div>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
