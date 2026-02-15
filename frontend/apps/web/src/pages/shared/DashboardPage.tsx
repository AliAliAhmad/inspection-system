import { Card, Row, Col, Typography, Spin, Alert, Button, Progress, Tag, Tooltip, Space, Badge } from 'antd';
import {
  CalendarOutlined,
  PlusOutlined,
  UploadOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi, DashboardData, AdminDashboardData, WorkPlanStats } from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { CACHE_KEYS } from '../../utils/offline-storage';
import { useQuery } from '@tanstack/react-query';

const { Title, Text } = Typography;

// ─── Hub Card Config ─────────────────────────────────────────

interface HubCard {
  key: string;
  emoji: string;
  titleKey: string;
  descKey: string;
  path: string;
  roles: string[];
  color: string;
  statFn?: (admin: AdminDashboardData | null, dash: DashboardData | null) => string | number | null;
  badgeColor?: (admin: AdminDashboardData | null, dash: DashboardData | null) => string;
}

const HUB_CARDS: HubCard[] = [
  {
    key: 'work_planning',
    emoji: '📅',
    titleKey: 'hub.work_planning',
    descKey: 'hub.work_planning_desc',
    path: '/admin/work-planning',
    roles: ['admin', 'engineer'],
    color: '#667eea',
  },
  {
    key: 'equipment',
    emoji: '🔧',
    titleKey: 'hub.equipment',
    descKey: 'hub.equipment_desc',
    path: '/equipment-dashboard',
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    color: '#1890ff',
    statFn: (admin) => admin?.equipment_count ?? null,
  },
  {
    key: 'inspections',
    emoji: '📋',
    titleKey: 'hub.inspections',
    descKey: 'hub.inspections_desc',
    path: '/admin/inspections',
    roles: ['admin'],
    color: '#52c41a',
    statFn: (admin) => admin ? `${admin.inspections_today} today` : null,
  },
  {
    key: 'defects',
    emoji: '🐛',
    titleKey: 'hub.defects',
    descKey: 'hub.defects_desc',
    path: '/admin/defects',
    roles: ['admin', 'engineer'],
    color: '#ff4d4f',
    statFn: (admin) => admin?.open_defects ?? null,
    badgeColor: (admin) => (admin?.open_defects ?? 0) > 0 ? '#ff4d4f' : '#52c41a',
  },
  {
    key: 'team',
    emoji: '👥',
    titleKey: 'hub.team',
    descKey: 'hub.team_desc',
    path: '/admin/users',
    roles: ['admin'],
    color: '#722ed1',
    statFn: (admin) => admin?.users_count ?? null,
  },
  {
    key: 'schedules',
    emoji: '📆',
    titleKey: 'hub.schedules',
    descKey: 'hub.schedules_desc',
    path: '/admin/schedules',
    roles: ['admin'],
    color: '#13c2c2',
  },
  {
    key: 'materials',
    emoji: '📦',
    titleKey: 'hub.materials',
    descKey: 'hub.materials_desc',
    path: '/admin/materials',
    roles: ['admin', 'engineer'],
    color: '#fa8c16',
  },
  {
    key: 'reports',
    emoji: '📊',
    titleKey: 'hub.reports',
    descKey: 'hub.reports_desc',
    path: '/admin/reports',
    roles: ['admin'],
    color: '#eb2f96',
  },
  {
    key: 'quality',
    emoji: '⭐',
    titleKey: 'hub.quality',
    descKey: 'hub.quality_desc',
    path: '/admin/quality-reviews',
    roles: ['admin'],
    color: '#faad14',
  },
  {
    key: 'approvals',
    emoji: '✔️',
    titleKey: 'hub.approvals',
    descKey: 'hub.approvals_desc',
    path: '/admin/approvals',
    roles: ['admin'],
    color: '#52c41a',
  },
  {
    key: 'leaves',
    emoji: '🏖️',
    titleKey: 'hub.leaves',
    descKey: 'hub.leaves_desc',
    path: '/leaves',
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    color: '#36cfc9',
    statFn: (admin) => admin?.active_leaves ?? null,
  },
  {
    key: 'running_hours',
    emoji: '⏱️',
    titleKey: 'hub.running_hours',
    descKey: 'hub.running_hours_desc',
    path: '/admin/running-hours',
    roles: ['admin', 'engineer'],
    color: '#597ef7',
  },
  {
    key: 'daily_review',
    emoji: '📝',
    titleKey: 'hub.daily_review',
    descKey: 'hub.daily_review_desc',
    path: '/admin/daily-review',
    roles: ['admin', 'engineer'],
    color: '#9254de',
  },
  {
    key: 'overdue',
    emoji: '⏰',
    titleKey: 'hub.overdue',
    descKey: 'hub.overdue_desc',
    path: '/admin/overdue',
    roles: ['admin', 'engineer'],
    color: '#ff7a45',
  },
  {
    key: 'performance',
    emoji: '📈',
    titleKey: 'hub.performance',
    descKey: 'hub.performance_desc',
    path: '/admin/performance',
    roles: ['admin', 'engineer'],
    color: '#73d13d',
  },
  {
    key: 'routines',
    emoji: '🔁',
    titleKey: 'hub.routines',
    descKey: 'hub.routines_desc',
    path: '/admin/routines',
    roles: ['admin'],
    color: '#40a9ff',
  },
  {
    key: 'notifications',
    emoji: '🔔',
    titleKey: 'hub.notifications',
    descKey: 'hub.notifications_desc',
    path: '/notifications',
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    color: '#ffa940',
  },
  {
    key: 'leaderboard',
    emoji: '🏆',
    titleKey: 'hub.leaderboard',
    descKey: 'hub.leaderboard_desc',
    path: '/leaderboard',
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    color: '#ffd666',
  },
  // Role-specific
  {
    key: 'my_assignments',
    emoji: '📋',
    titleKey: 'hub.my_assignments',
    descKey: 'hub.my_assignments_desc',
    path: '/inspector/assignments',
    roles: ['inspector'],
    color: '#1890ff',
    statFn: (_, dash) => dash?.total_inspections ?? null,
  },
  {
    key: 'my_jobs_specialist',
    emoji: '🔧',
    titleKey: 'hub.my_jobs',
    descKey: 'hub.my_jobs_desc',
    path: '/specialist/jobs',
    roles: ['specialist'],
    color: '#fa8c16',
    statFn: (_, dash) => dash?.active_jobs ?? null,
  },
  {
    key: 'my_jobs_engineer',
    emoji: '🛠️',
    titleKey: 'hub.my_jobs',
    descKey: 'hub.my_jobs_desc',
    path: '/engineer/jobs',
    roles: ['engineer'],
    color: '#fa8c16',
  },
  {
    key: 'qe_reviews',
    emoji: '🔍',
    titleKey: 'hub.quality',
    descKey: 'hub.quality_desc',
    path: '/quality/reviews',
    roles: ['quality_engineer'],
    color: '#722ed1',
  },
  {
    key: 'settings',
    emoji: '⚙️',
    titleKey: 'hub.settings',
    descKey: 'hub.settings_desc',
    path: '/admin/leave-settings',
    roles: ['admin'],
    color: '#8c8c8c',
  },
];

// Priority colors
const PRIORITY_COLORS: Record<string, string> = {
  normal: '#52c41a',
  high: '#faad14',
  urgent: '#ff4d4f',
  critical: '#ff4d4f',
};

// Job type emoji
const JOB_TYPE_EMOJI: Record<string, string> = {
  pm: '🔧',
  defect: '🔴',
  inspection: '✅',
};

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

  const loading = isAdmin ? adminLoading : dashLoading;
  const error = isAdmin ? adminError : dashError;

  if (loading || wpLoading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  const role = user?.role || '';
  const visibleCards = HUB_CARDS.filter((c) => c.roles.includes(role));

  const formatWeekRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  return (
    <div>
      {/* Welcome */}
      <Title level={4} style={{ marginBottom: 8 }}>
        👋 {t('common.welcome')}, {user?.full_name}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </Text>

      {/* Quick Actions for Engineers/Admins */}
      {isEngineer && (
        <Card
          size="small"
          style={{ marginBottom: 20, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 12 }}
          styles={{ body: { padding: '12px 16px' } }}
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
                  Work Planning
                </Button>
                <Button
                  type="primary"
                  ghost
                  icon={<UploadOutlined />}
                  onClick={() => navigate('/admin/work-planning')}
                  style={{ borderColor: '#fff', color: '#fff' }}
                >
                  Import SAP
                </Button>
                {workPlanStats && !workPlanStats.has_plan && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/admin/work-planning')}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  >
                    Create Plan
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* ─── Hub Cards Grid ─── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {visibleCards.map((card) => {
          const stat = card.statFn ? card.statFn(adminData || null, dashData || null) : null;
          const badgeColor = card.badgeColor ? card.badgeColor(adminData || null, dashData || null) : card.color;

          return (
            <Col xs={24} sm={12} md={8} lg={6} key={card.key}>
              <Card
                hoverable
                className="hub-card"
                onClick={() => navigate(card.path)}
                style={{ borderTop: `3px solid ${card.color}` }}
                styles={{ body: { padding: '20px 16px', textAlign: 'center' } }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>{card.emoji}</div>
                <Title level={5} style={{ margin: '0 0 4px', fontSize: 14 }}>
                  {t(card.titleKey)}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t(card.descKey)}
                </Text>
                {stat !== null && (
                  <div style={{ marginTop: 8 }}>
                    <Badge
                      count={stat}
                      showZero
                      color={badgeColor}
                      style={{ fontSize: 12 }}
                    />
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* ─── Work Plan Stats Widget (Engineers/Admins) ─── */}
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
          style={{ marginBottom: 16, borderRadius: 12 }}
        >
          {!workPlanStats.has_plan ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary" style={{ fontSize: 16 }}>No work plan for this week</Text>
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
                {[
                  { label: 'Total', value: workPlanStats.total_jobs, bg: '#f6ffed', border: '#b7eb8f', color: '#52c41a', emoji: '📦' },
                  { label: 'In Pool', value: workPlanStats.jobs_in_pool, bg: '#e6f7ff', border: '#91d5ff', color: '#1890ff', emoji: '📥' },
                  { label: 'In Progress', value: workPlanStats.in_progress_jobs, bg: '#fff7e6', border: '#ffd591', color: '#fa8c16', emoji: '🔄' },
                  { label: 'Done', value: workPlanStats.completed_jobs, bg: '#f6ffed', border: '#b7eb8f', color: '#52c41a', emoji: '✅' },
                  { label: 'Overdue', value: workPlanStats.overdue_jobs, bg: workPlanStats.overdue_jobs > 0 ? '#fff2e8' : '#fafafa', border: workPlanStats.overdue_jobs > 0 ? '#ffbb96' : '#d9d9d9', color: workPlanStats.overdue_jobs > 0 ? '#fa541c' : '#8c8c8c', emoji: '⚠️' },
                  { label: 'Critical', value: workPlanStats.critical_jobs, bg: workPlanStats.critical_jobs > 0 ? '#fff1f0' : '#fafafa', border: workPlanStats.critical_jobs > 0 ? '#ffa39e' : '#d9d9d9', color: workPlanStats.critical_jobs > 0 ? '#cf1322' : '#8c8c8c', emoji: '🔥' },
                ].map((s) => (
                  <Col xs={12} sm={8} md={4} key={s.label}>
                    <Card size="small" style={{ textAlign: 'center', background: s.bg, borderColor: s.border, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{s.emoji} {s.label}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </Card>
                  </Col>
                ))}
              </Row>

              {/* Jobs by Type + Day */}
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col xs={24} md={8}>
                  <Card size="small" title="Jobs by Type" styles={{ body: { padding: '12px' } }} style={{ borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                      {[
                        { type: 'pm', label: 'PM', color: '#1890ff' },
                        { type: 'defect', label: 'Defect', color: '#f5222d' },
                        { type: 'inspection', label: 'Inspection', color: '#52c41a' },
                      ].map((jt) => (
                        <Tooltip key={jt.type} title={`${jt.label} Jobs`}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 24 }}>{JOB_TYPE_EMOJI[jt.type]}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: jt.color }}>
                              {(workPlanStats.jobs_by_type as any)[jt.type] || 0}
                            </div>
                            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{jt.label}</div>
                          </div>
                        </Tooltip>
                      ))}
                    </div>
                  </Card>
                </Col>

                <Col xs={24} md={16}>
                  <Card size="small" title="Jobs by Day" styles={{ body: { padding: '12px' } }} style={{ borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 80 }}>
                      {workPlanStats.jobs_by_day.map((day) => {
                        const maxJobs = Math.max(...workPlanStats.jobs_by_day.map((d) => d.count), 1);
                        const height = Math.max((day.count / maxJobs) * 60, 4);
                        return (
                          <Tooltip key={day.date} title={`${day.day_name}: ${day.count} jobs`}>
                            <div style={{ textAlign: 'center', flex: 1 }}>
                              <div
                                style={{
                                  height,
                                  background: day.is_today
                                    ? 'linear-gradient(180deg, #52c41a 0%, #237804 100%)'
                                    : 'linear-gradient(180deg, #1890ff 0%, #0050b3 100%)',
                                  borderRadius: '4px 4px 0 0',
                                  margin: '0 2px',
                                }}
                              />
                              <div style={{ fontSize: 10, fontWeight: day.is_today ? 700 : 400, color: day.is_today ? '#52c41a' : '#595959', marginTop: 4 }}>
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
                  title="🎯 Today's Focus"
                  style={{ marginTop: 16, borderRadius: 8 }}
                  extra={<Button type="link" onClick={() => navigate('/admin/work-planning')}>View All →</Button>}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {workPlanStats.today_jobs.map((job) => (
                      <Card
                        key={job.id}
                        size="small"
                        style={{ width: 200, borderLeft: `4px solid ${PRIORITY_COLORS[job.priority] || '#1890ff'}`, borderRadius: 8 }}
                        styles={{ body: { padding: '8px 12px' } }}
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
                <Card size="small" title="👥 Team Workload" style={{ marginTop: 16, borderRadius: 8 }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {workPlanStats.team_workload.slice(0, 6).map((member) => {
                      const maxHours = Math.max(...workPlanStats.team_workload.map((m) => m.hours), 40);
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
    </div>
  );
}
