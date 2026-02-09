/**
 * Performance Report Page (Web)
 * Performance dashboards, heat maps, comparisons, and date-range reports.
 */
import React, { useState } from 'react';
import {
  Card, Row, Col, DatePicker, Select, Table, Statistic, Tag, Space,
  Typography, Tabs, Progress, Button, message,
} from 'antd';
import {
  TrophyOutlined, FireOutlined, BarChartOutlined,
  TeamOutlined, UserOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { workPlanTrackingApi } from '@inspection/shared';
import type { WorkPlanPerformance, HeatMapEntry, ComparisonEntry } from '@inspection/shared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const HEAT_MAP_COLORS: Record<string, string> = {
  green: '#52c41a',
  yellow: '#faad14',
  red: '#ff4d4f',
};

export default function PerformanceReportPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState<string>('daily');
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);
  const [selectedWorker, setSelectedWorker] = useState<number | undefined>();
  const [weekStart, setWeekStart] = useState(
    dayjs().startOf('week').format('YYYY-MM-DD')
  );

  // Performance report
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ['performance-report', period, dateRange, selectedWorker],
    queryFn: () => workPlanTrackingApi.getPerformanceReport({
      period,
      start_date: dateRange[0],
      end_date: dateRange[1],
      worker_id: selectedWorker,
    }),
  });

  // Heat map
  const { data: heatMapData, isLoading: heatMapLoading } = useQuery({
    queryKey: ['heat-map', weekStart],
    queryFn: () => workPlanTrackingApi.getHeatMap(weekStart),
    enabled: activeTab === 'heatmap',
  });

  // Comparison
  const { data: compData, isLoading: compLoading } = useQuery({
    queryKey: ['comparison', period, dateRange],
    queryFn: () => workPlanTrackingApi.getPerformanceComparison({
      period,
      start_date: dateRange[0],
      end_date: dateRange[1],
    }),
    enabled: activeTab === 'comparison',
  });

  // Compute performance
  const computeMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.computePerformance(dayjs().subtract(1, 'day').format('YYYY-MM-DD')),
    onSuccess: (res) => message.success(`Computed for ${res?.data?.records_computed || 0} workers`),
    onError: () => message.error('Failed to compute'),
  });

  const performances: WorkPlanPerformance[] = perfData?.data?.performances || [];
  const heatMap: HeatMapEntry[] = heatMapData?.data?.heat_map || [];
  const comparisons: ComparisonEntry[] = compData?.data?.comparison || [];

  // Performance table columns
  const perfColumns = [
    { title: 'Period', dataIndex: 'period_start', key: 'period', width: 110 },
    {
      title: 'Worker',
      key: 'worker',
      width: 150,
      render: (_: any, r: WorkPlanPerformance) => r.user?.full_name || `User #${r.user_id}`,
    },
    {
      title: 'Jobs',
      key: 'jobs',
      width: 100,
      render: (_: any, r: WorkPlanPerformance) => (
        <Text>{r.total_jobs_completed}/{r.total_jobs_assigned}</Text>
      ),
    },
    {
      title: 'Completion',
      key: 'completion',
      width: 100,
      render: (_: any, r: WorkPlanPerformance) => (
        <Progress
          percent={r.completion_rate}
          size="small"
          strokeColor={r.completion_rate >= 90 ? '#52c41a' : r.completion_rate >= 70 ? '#faad14' : '#ff4d4f'}
        />
      ),
    },
    {
      title: 'Hours',
      key: 'hours',
      width: 120,
      render: (_: any, r: WorkPlanPerformance) => (
        <Text>{r.total_actual_hours}h / {r.total_estimated_hours}h</Text>
      ),
    },
    {
      title: 'Time Rating',
      key: 'time_rating',
      width: 100,
      render: (_: any, r: WorkPlanPerformance) =>
        r.avg_time_rating ? <Tag color="gold">{r.avg_time_rating} / 7</Tag> : '--',
    },
    {
      title: 'QC',
      key: 'qc',
      width: 80,
      render: (_: any, r: WorkPlanPerformance) =>
        r.avg_qc_rating ? <Tag color="blue">{r.avg_qc_rating} / 5</Tag> : '--',
    },
    {
      title: 'Points',
      dataIndex: 'total_points_earned',
      key: 'points',
      width: 80,
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: 'Streak',
      key: 'streak',
      width: 80,
      render: (_: any, r: WorkPlanPerformance) =>
        r.current_streak_days > 0 ? (
          <Tag color="volcano" icon={<FireOutlined />}>{r.current_streak_days}d</Tag>
        ) : '--',
    },
  ];

  // Comparison table columns
  const compColumns = [
    {
      title: 'Worker',
      key: 'worker',
      width: 150,
      render: (_: any, r: ComparisonEntry) => <Text strong>{r.user?.full_name}</Text>,
    },
    {
      title: 'Jobs Completed',
      key: 'completed',
      width: 120,
      render: (_: any, r: ComparisonEntry) => `${r.totals.jobs_completed}/${r.totals.jobs_assigned}`,
      sorter: (a: ComparisonEntry, b: ComparisonEntry) => b.totals.jobs_completed - a.totals.jobs_completed,
    },
    {
      title: 'Completion Rate',
      key: 'rate',
      width: 130,
      render: (_: any, r: ComparisonEntry) => (
        <Progress percent={r.totals.completion_rate} size="small" />
      ),
      sorter: (a: ComparisonEntry, b: ComparisonEntry) => b.totals.completion_rate - a.totals.completion_rate,
    },
    {
      title: 'Avg Time Rating',
      key: 'rating',
      width: 120,
      render: (_: any, r: ComparisonEntry) =>
        r.totals.avg_time_rating ? `${r.totals.avg_time_rating} / 7` : '--',
      sorter: (a: ComparisonEntry, b: ComparisonEntry) =>
        (b.totals.avg_time_rating || 0) - (a.totals.avg_time_rating || 0),
    },
    {
      title: 'Hours',
      key: 'hours',
      width: 130,
      render: (_: any, r: ComparisonEntry) =>
        `${r.totals.actual_hours.toFixed(1)}h / ${r.totals.estimated_hours.toFixed(1)}h`,
    },
    {
      title: 'Points',
      key: 'points',
      width: 80,
      render: (_: any, r: ComparisonEntry) => <Text strong>{r.totals.points}</Text>,
      sorter: (a: ComparisonEntry, b: ComparisonEntry) => b.totals.points - a.totals.points,
    },
  ];

  // Heat map day columns (Mon-Sun)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const heatMapColumns = [
    {
      title: 'Worker',
      key: 'worker',
      width: 150,
      render: (_: any, r: HeatMapEntry) => <Text strong>{r.user?.full_name}</Text>,
    },
    ...dayNames.map((day, i) => {
      const dateKey = dayjs(weekStart).add(i, 'day').format('YYYY-MM-DD');
      return {
        title: `${day} ${dayjs(dateKey).format('DD')}`,
        key: dateKey,
        width: 80,
        align: 'center' as const,
        render: (_: any, r: HeatMapEntry) => {
          const dayData = r.days[dateKey];
          if (!dayData) return <Text type="secondary">--</Text>;
          return (
            <Tag
              color={HEAT_MAP_COLORS[dayData.color]}
              style={{ minWidth: 50, textAlign: 'center' }}
            >
              {dayData.completion_rate}%
            </Tag>
          );
        },
      };
    }),
  ];

  const tabItems = [
    {
      key: 'overview',
      label: <span><BarChartOutlined /> Overview</span>,
      children: (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col>
              <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
                <Select.Option value="daily">Daily</Select.Option>
                <Select.Option value="weekly">Weekly</Select.Option>
                <Select.Option value="monthly">Monthly</Select.Option>
              </Select>
            </Col>
            <Col>
              <RangePicker
                value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                  }
                }}
              />
            </Col>
            <Col flex="auto" />
            <Col>
              <Button
                onClick={() => computeMutation.mutate()}
                loading={computeMutation.isPending}
              >
                Recompute Yesterday
              </Button>
            </Col>
          </Row>
          <Table
            columns={perfColumns}
            dataSource={performances}
            rowKey="id"
            loading={perfLoading}
            pagination={{ pageSize: 20 }}
            size="small"
          />
        </>
      ),
    },
    {
      key: 'heatmap',
      label: <span><FireOutlined /> Heat Map</span>,
      children: (
        <>
          <Row style={{ marginBottom: 16 }}>
            <Col>
              <DatePicker
                picker="week"
                value={dayjs(weekStart)}
                onChange={(d) => d && setWeekStart(d.startOf('week').format('YYYY-MM-DD'))}
              />
            </Col>
          </Row>
          <Table
            columns={heatMapColumns}
            dataSource={heatMap}
            rowKey={(r) => r.user?.id?.toString() || ''}
            loading={heatMapLoading}
            pagination={false}
            size="small"
          />
        </>
      ),
    },
    {
      key: 'comparison',
      label: <span><TeamOutlined /> Comparison</span>,
      children: (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col>
              <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
                <Select.Option value="daily">Daily</Select.Option>
                <Select.Option value="weekly">Weekly</Select.Option>
                <Select.Option value="monthly">Monthly</Select.Option>
              </Select>
            </Col>
            <Col>
              <RangePicker
                value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                  }
                }}
              />
            </Col>
          </Row>
          <Table
            columns={compColumns}
            dataSource={comparisons}
            rowKey={(r) => r.user?.id?.toString() || ''}
            loading={compLoading}
            pagination={false}
            size="small"
          />
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={3} style={{ margin: 0 }}>
            <TrophyOutlined /> Performance Reports
          </Title>
        </Col>
      </Row>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}
