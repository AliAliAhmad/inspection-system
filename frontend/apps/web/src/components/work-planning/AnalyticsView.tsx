import React, { useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Progress,
  Statistic,
  Typography,
  Table,
  Tag,
  Space,
  Empty,
  Tooltip,
} from 'antd';
import {
  TeamOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ToolOutlined,
  WarningOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { WorkPlan, WorkPlanJob, WorkPlanDay } from '@inspection/shared';

const { Title, Text } = Typography;

interface AnalyticsViewProps {
  plan: WorkPlan | null;
  weekStart: string;
}

interface DayStats {
  date: string;
  dayName: string;
  eastHours: number;
  westHours: number;
  totalHours: number;
  jobCount: number;
}

interface JobTypeStats {
  type: string;
  label: string;
  count: number;
  hours: number;
  color: string;
  emoji: string;
}

interface TeamMemberStats {
  userId: number;
  name: string;
  role: string;
  totalHours: number;
  jobCount: number;
  leadCount: number;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ plan, weekStart }) => {
  // Calculate all analytics from the plan
  const analytics = useMemo(() => {
    if (!plan?.days) {
      return null;
    }

    const allJobs: (WorkPlanJob & { dayDate: string })[] = [];
    const dayStats: DayStats[] = [];
    const teamMap = new Map<number, TeamMemberStats>();

    // Collect all jobs and calculate day stats
    plan.days.forEach((day: WorkPlanDay) => {
      const eastJobs = day.jobs_east || [];
      const westJobs = day.jobs_west || [];
      const bothJobs = day.jobs_both || [];

      const allDayJobs = [...eastJobs, ...westJobs, ...bothJobs];
      allDayJobs.forEach(job => {
        allJobs.push({ ...job, dayDate: day.date });

        // Track team assignments
        (job.assignments || []).forEach((assignment: any) => {
          const userId = assignment.user_id || assignment.user?.id;
          const userName = assignment.user?.full_name || `User ${userId}`;
          const userRole = assignment.user?.role || 'Unknown';

          if (!teamMap.has(userId)) {
            teamMap.set(userId, {
              userId,
              name: userName,
              role: userRole,
              totalHours: 0,
              jobCount: 0,
              leadCount: 0,
            });
          }

          const stats = teamMap.get(userId)!;
          stats.totalHours += job.estimated_hours || 0;
          stats.jobCount += 1;
          if (assignment.is_lead) {
            stats.leadCount += 1;
          }
        });
      });

      const eastHours = eastJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);
      const westHours = westJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);
      const bothHours = bothJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);

      dayStats.push({
        date: day.date,
        dayName: dayjs(day.date).format('ddd'),
        eastHours: eastHours + bothHours / 2,
        westHours: westHours + bothHours / 2,
        totalHours: eastHours + westHours + bothHours,
        jobCount: allDayJobs.length,
      });
    });

    // Job type breakdown
    const pmJobs = allJobs.filter(j => j.job_type === 'pm');
    const defectJobs = allJobs.filter(j => j.job_type === 'defect');
    const inspectionJobs = allJobs.filter(j => j.job_type === 'inspection');

    const jobTypeStats: JobTypeStats[] = [
      {
        type: 'pm',
        label: 'Preventive Maintenance',
        count: pmJobs.length,
        hours: pmJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0),
        color: '#1890ff',
        emoji: '🔧',
      },
      {
        type: 'defect',
        label: 'Defect Repairs',
        count: defectJobs.length,
        hours: defectJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0),
        color: '#ff4d4f',
        emoji: '🔴',
      },
      {
        type: 'inspection',
        label: 'Inspections',
        count: inspectionJobs.length,
        hours: inspectionJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0),
        color: '#52c41a',
        emoji: '✅',
      },
    ];

    // Priority breakdown
    const criticalJobs = allJobs.filter(j => j.computed_priority === 'critical' || j.priority === 'urgent');
    const highPriorityJobs = allJobs.filter(j => j.computed_priority === 'high' || j.priority === 'high');
    const overdueJobs = allJobs.filter(j => (j.overdue_value || 0) > 0);

    // Totals
    const totalJobs = allJobs.length;
    const totalHours = allJobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);
    const assignedJobs = allJobs.filter(j => (j.assignments || []).length > 0);
    const unassignedJobs = allJobs.filter(j => (j.assignments || []).length === 0);

    // Max hours for scaling
    const maxDayHours = Math.max(...dayStats.map(d => d.totalHours), 1);

    return {
      allJobs,
      dayStats,
      jobTypeStats,
      teamStats: Array.from(teamMap.values()).sort((a, b) => b.totalHours - a.totalHours),
      totalJobs,
      totalHours,
      assignedJobs: assignedJobs.length,
      unassignedJobs: unassignedJobs.length,
      criticalJobs: criticalJobs.length,
      highPriorityJobs: highPriorityJobs.length,
      overdueJobs: overdueJobs.length,
      maxDayHours,
    };
  }, [plan]);

  if (!plan || !analytics) {
    return (
      <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="No work plan data available for analytics"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const totalJobTypeCount = analytics.jobTypeStats.reduce((sum, jt) => sum + jt.count, 0) || 1;

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          📊 Analytics Dashboard
        </Title>
        <Text type="secondary">
          Week of {dayjs(weekStart).format('MMM D')} - {dayjs(weekStart).add(6, 'day').format('MMM D, YYYY')}
        </Text>
      </div>

      {/* Weekly Summary Stats */}
      <Card
        title={<span>📈 Weekly Summary</span>}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Statistic
              title="Total Jobs"
              value={analytics.totalJobs}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Total Hours"
              value={analytics.totalHours}
              suffix="h"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Assigned"
              value={analytics.assignedJobs}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Unassigned"
              value={analytics.unassignedJobs}
              prefix={<WarningOutlined />}
              valueStyle={{ color: analytics.unassignedJobs > 0 ? '#faad14' : '#52c41a' }}
            />
          </Col>
        </Row>

        {/* Priority alerts */}
        {(analytics.criticalJobs > 0 || analytics.overdueJobs > 0) && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591' }}>
            <Space size="large">
              {analytics.criticalJobs > 0 && (
                <Tag color="red" icon={<WarningOutlined />}>
                  {analytics.criticalJobs} Critical Job{analytics.criticalJobs > 1 ? 's' : ''}
                </Tag>
              )}
              {analytics.highPriorityJobs > 0 && (
                <Tag color="orange">
                  {analytics.highPriorityJobs} High Priority
                </Tag>
              )}
              {analytics.overdueJobs > 0 && (
                <Tag color="volcano">
                  ⏰ {analytics.overdueJobs} Overdue
                </Tag>
              )}
            </Space>
          </div>
        )}
      </Card>

      <Row gutter={16}>
        {/* Workload Distribution Chart - By Day */}
        <Col xs={24} lg={12}>
          <Card
            title={<span>📅 Workload by Day</span>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            {analytics.dayStats.map((day) => {
              const isWeekend = ['Sat', 'Sun'].includes(day.dayName);
              const isToday = day.date === dayjs().format('YYYY-MM-DD');
              const hoursPercent = (day.totalHours / analytics.maxDayHours) * 100;

              return (
                <div key={day.date} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                      <Text strong style={{
                        minWidth: 40,
                        color: isToday ? '#52c41a' : isWeekend ? '#8c8c8c' : undefined
                      }}>
                        {day.dayName}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(day.date).format('MMM D')}
                      </Text>
                      {isToday && <Tag color="green" style={{ fontSize: 10 }}>Today</Tag>}
                    </Space>
                    <Space>
                      <Text type="secondary">{day.jobCount} jobs</Text>
                      <Text strong>{day.totalHours}h</Text>
                    </Space>
                  </div>
                  <Tooltip title={`East: ${day.eastHours.toFixed(1)}h | West: ${day.westHours.toFixed(1)}h`}>
                    <Progress
                      percent={hoursPercent}
                      showInfo={false}
                      strokeColor={{
                        '0%': '#1890ff',
                        '100%': '#52c41a',
                      }}
                      trailColor={isWeekend ? '#f0f0f0' : '#e8e8e8'}
                      size="small"
                    />
                  </Tooltip>
                  {/* Berth breakdown bar */}
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                    <div
                      style={{
                        width: `${(day.eastHours / Math.max(day.totalHours, 1)) * 100}%`,
                        backgroundColor: '#1890ff',
                        transition: 'width 0.3s'
                      }}
                    />
                    <div
                      style={{
                        width: `${(day.westHours / Math.max(day.totalHours, 1)) * 100}%`,
                        backgroundColor: '#52c41a',
                        transition: 'width 0.3s'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8c8c8c', marginTop: 2 }}>
                    <span>🚢 East: {day.eastHours.toFixed(1)}h</span>
                    <span>⚓ West: {day.westHours.toFixed(1)}h</span>
                  </div>
                </div>
              );
            })}
          </Card>
        </Col>

        {/* Job Type Breakdown - Pie Chart Style */}
        <Col xs={24} lg={12}>
          <Card
            title={<span>🥧 Job Type Breakdown</span>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            {analytics.jobTypeStats.map((jt) => {
              const percentage = (jt.count / totalJobTypeCount) * 100;

              return (
                <div key={jt.type} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                      <span style={{ fontSize: 18 }}>{jt.emoji}</span>
                      <Text strong>{jt.label}</Text>
                    </Space>
                    <Space>
                      <Tag color={jt.color}>{jt.count} jobs</Tag>
                      <Text type="secondary">{jt.hours}h</Text>
                    </Space>
                  </div>
                  <Progress
                    percent={percentage}
                    strokeColor={jt.color}
                    format={() => `${percentage.toFixed(0)}%`}
                    size="small"
                  />
                </div>
              );
            })}

            {/* Visual pie representation */}
            <div style={{
              marginTop: 24,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16
            }}>
              <div style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: `conic-gradient(
                  ${analytics.jobTypeStats[0].color} 0% ${(analytics.jobTypeStats[0].count / totalJobTypeCount) * 100}%,
                  ${analytics.jobTypeStats[1].color} ${(analytics.jobTypeStats[0].count / totalJobTypeCount) * 100}% ${((analytics.jobTypeStats[0].count + analytics.jobTypeStats[1].count) / totalJobTypeCount) * 100}%,
                  ${analytics.jobTypeStats[2].color} ${((analytics.jobTypeStats[0].count + analytics.jobTypeStats[1].count) / totalJobTypeCount) * 100}% 100%
                )`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }} />
              <div>
                {analytics.jobTypeStats.map(jt => (
                  <div key={jt.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: jt.color }} />
                    <Text style={{ fontSize: 12 }}>{jt.emoji} {jt.label}</Text>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Team Utilization */}
      <Card
        title={<span>👥 Team Utilization</span>}
        size="small"
        style={{ marginBottom: 16 }}
      >
        {analytics.teamStats.length === 0 ? (
          <Empty
            description="No team assignments yet"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            dataSource={analytics.teamStats}
            rowKey="userId"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Team Member',
                dataIndex: 'name',
                key: 'name',
                render: (name, record) => (
                  <Space>
                    <TeamOutlined />
                    <span>{name}</span>
                    {record.leadCount > 0 && (
                      <Tooltip title={`Lead on ${record.leadCount} job(s)`}>
                        <Tag color="gold" style={{ fontSize: 10 }}>👑 {record.leadCount}</Tag>
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
              {
                title: 'Role',
                dataIndex: 'role',
                key: 'role',
                render: (role) => <Tag>{role}</Tag>,
              },
              {
                title: 'Jobs',
                dataIndex: 'jobCount',
                key: 'jobCount',
                align: 'center' as const,
                sorter: (a, b) => a.jobCount - b.jobCount,
              },
              {
                title: 'Hours Assigned',
                dataIndex: 'totalHours',
                key: 'totalHours',
                sorter: (a, b) => a.totalHours - b.totalHours,
                defaultSortOrder: 'descend' as const,
                render: (hours) => {
                  const maxHours = Math.max(...analytics.teamStats.map(t => t.totalHours), 1);
                  const percent = (hours / maxHours) * 100;
                  const color = hours > 40 ? '#ff4d4f' : hours > 30 ? '#faad14' : '#52c41a';

                  return (
                    <div style={{ minWidth: 150 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text strong style={{ color }}>{hours}h</Text>
                        {hours > 40 && <Tag color="red" style={{ fontSize: 10 }}>⚠️ Over 40h</Tag>}
                      </div>
                      <Progress
                        percent={percent}
                        showInfo={false}
                        strokeColor={color}
                        size="small"
                      />
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      {/* Completion Progress */}
      <Card
        title={<span>✅ Completion Progress</span>}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Jobs with Assignments</Text>
              <Progress
                type="circle"
                percent={Math.round((analytics.assignedJobs / Math.max(analytics.totalJobs, 1)) * 100)}
                format={(percent) => (
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{analytics.assignedJobs}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>of {analytics.totalJobs}</div>
                  </div>
                )}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#52c41a',
                }}
                size={120}
              />
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  {analytics.unassignedJobs > 0
                    ? `${analytics.unassignedJobs} job${analytics.unassignedJobs > 1 ? 's' : ''} need assignment`
                    : '🎉 All jobs assigned!'
                  }
                </Text>
              </div>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Plan Status</Text>
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <Tag
                  color={plan.status === 'published' ? 'success' : 'warning'}
                  style={{ fontSize: 16, padding: '8px 16px' }}
                >
                  {plan.status === 'published' ? '📤 Published' : '📝 Draft'}
                </Tag>
              </div>
              <div>
                {plan.status === 'published' ? (
                  <Text type="success">
                    <CheckCircleOutlined /> Team has been notified
                  </Text>
                ) : (
                  <Text type="warning">
                    <WarningOutlined /> Not yet published to team
                  </Text>
                )}
              </div>
              {plan.pdf_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={plan.pdf_url} target="_blank" rel="noopener noreferrer">
                    📑 View PDF Report
                  </a>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Quick Insights */}
      <Card
        title={<span>💡 Quick Insights</span>}
        size="small"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* Busiest day */}
          {analytics.dayStats.length > 0 && (
            <div style={{ padding: 8, backgroundColor: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <Text>
                📆 <strong>Busiest Day:</strong>{' '}
                {(() => {
                  const busiest = [...analytics.dayStats].sort((a, b) => b.totalHours - a.totalHours)[0];
                  return `${busiest.dayName} (${dayjs(busiest.date).format('MMM D')}) with ${busiest.totalHours}h across ${busiest.jobCount} jobs`;
                })()}
              </Text>
            </div>
          )}

          {/* Most utilized team member */}
          {analytics.teamStats.length > 0 && (
            <div style={{ padding: 8, backgroundColor: '#e6f7ff', borderRadius: 8, border: '1px solid #91d5ff' }}>
              <Text>
                👤 <strong>Most Utilized:</strong>{' '}
                {analytics.teamStats[0].name} with {analytics.teamStats[0].totalHours}h across {analytics.teamStats[0].jobCount} jobs
              </Text>
            </div>
          )}

          {/* Average hours per job */}
          {analytics.totalJobs > 0 && (
            <div style={{ padding: 8, backgroundColor: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591' }}>
              <Text>
                ⏱️ <strong>Average Job Duration:</strong>{' '}
                {(analytics.totalHours / analytics.totalJobs).toFixed(1)} hours per job
              </Text>
            </div>
          )}

          {/* Berth balance */}
          {(() => {
            const totalEast = analytics.dayStats.reduce((sum, d) => sum + d.eastHours, 0);
            const totalWest = analytics.dayStats.reduce((sum, d) => sum + d.westHours, 0);
            const balance = totalEast / Math.max(totalEast + totalWest, 1) * 100;

            return (
              <div style={{ padding: 8, backgroundColor: '#f9f0ff', borderRadius: 8, border: '1px solid #d3adf7' }}>
                <Text>
                  ⚖️ <strong>Berth Balance:</strong>{' '}
                  🚢 East {totalEast.toFixed(0)}h ({balance.toFixed(0)}%) | ⚓ West {totalWest.toFixed(0)}h ({(100 - balance).toFixed(0)}%)
                </Text>
              </div>
            );
          })()}
        </Space>
      </Card>
    </div>
  );
};

export default AnalyticsView;
