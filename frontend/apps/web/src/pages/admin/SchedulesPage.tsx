import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Upload,
  Tag,
  Row,
  Col,
  Alert,
  message,
  Typography,
  Tabs,
  Space,
} from 'antd';
import { UploadOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionRoutinesApi,
  scheduleAIApi,
  type EquipmentSchedule,
  type UpcomingEntry,
} from '@inspection/shared';
import {
  ScheduleStatsCards,
  AIScheduleInsights,
  CoverageGapsPanel,
  RiskIndicator,
  ScheduleHeatmap,
  HealthTrendChart,
  CapacityGauge,
} from '../../components/schedules';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shiftTag = (value: string | undefined) => {
  if (!value) return <Tag>-</Tag>;
  switch (value) {
    case 'day':
      return <Tag color="blue">D</Tag>;
    case 'night':
      return <Tag color="purple">N</Tag>;
    case 'both':
      return <Tag color="orange">D+N</Tag>;
    default:
      return <Tag>{value}</Tag>;
  }
};

export default function SchedulesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [uploadResult, setUploadResult] = useState<{
    created: number;
    equipment_processed: number;
    errors: string[];
    summary?: {
      day_shifts: number;
      night_shifts: number;
      total_active: number;
    };
    import_details?: any[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('1');
  const [debugData, setDebugData] = useState<any>(null);
  const [showFormatHelp, setShowFormatHelp] = useState(false);

  // Equipment schedule grid
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['inspection-schedules'],
    queryFn: () =>
      inspectionRoutinesApi
        .getSchedules()
        .then((r) => (r.data as any).data as EquipmentSchedule[]),
  });

  // Today & tomorrow inspections
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['inspection-schedules', 'upcoming'],
    queryFn: () =>
      inspectionRoutinesApi.getUpcoming().then((r) => (r.data as any).data),
  });

  // Risk scores for equipment
  const { data: riskScores } = useQuery({
    queryKey: ['schedule-ai', 'risk-scores'],
    queryFn: () => scheduleAIApi.getRiskScores(),
  });

  // Capacity forecast for gauge
  const { data: capacityData } = useQuery({
    queryKey: ['schedule-ai', 'capacity-forecast', 30],
    queryFn: () => scheduleAIApi.getCapacityForecast(30),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => inspectionRoutinesApi.uploadSchedule(file),
    onSuccess: (res) => {
      const result = res.data as any;
      setUploadResult({
        created: result.created ?? 0,
        equipment_processed: result.equipment_processed ?? 0,
        errors: result.errors ?? [],
        summary: result.summary,
        import_details: result.import_details,
      });
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      message.success(
        t('schedules.uploadSuccess', '{{count}} schedule entries created', {
          count: result.created ?? 0,
        }),
      );
    },
    onError: () =>
      message.error(
        t('schedules.uploadError', 'Failed to upload schedule'),
      ),
  });

  const debugMutation = useMutation({
    mutationFn: () => inspectionRoutinesApi.debugSchedules(),
    onSuccess: (res) => {
      setDebugData((res.data as any).data || res.data);
    },
    onError: () => message.error('Failed to fetch debug data'),
  });

  const clearMutation = useMutation({
    mutationFn: () => inspectionRoutinesApi.clearAllSchedules(),
    onSuccess: (res) => {
      const result = (res.data as any).data || res.data;
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      message.success(`Cleared ${result.deleted || 0} schedule entries`);
    },
    onError: () => message.error('Failed to clear schedules'),
  });

  const downloadTemplate = () => {
    const csvContent = `Equipment,Berth,Mon,Tue,Wed,Thu,Fri,Sat,Sun
Crane-01,East,D,D,D,D,D,,
Crane-02,East,N,N,N,N,N,,
Forklift-01,West,D,D,D,D,D,,
Loader-01,West,D+N,D+N,D+N,D+N,D+N,D,

Instructions:
- Column A: Equipment name (must match exactly with equipment in system)
- Column B: Berth (required, e.g. East, West)
- Columns C-I: Days of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Cell values:
  D or 1 or DAY = Day shift
  N or 2 or NIGHT = Night shift
  D+N or 3 or BOTH = Both shifts
  Empty = No inspection
`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'schedule-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Template downloaded! Open in Excel and save as .xlsx');
  };

  const scheduleColumns: ColumnsType<EquipmentSchedule> = [
    {
      title: t('equipment.name', 'Equipment'),
      dataIndex: 'equipment_name',
      key: 'equipment_name',
      fixed: 'left',
      width: 220,
      sorter: (a, b) => a.equipment_name.localeCompare(b.equipment_name),
      render: (_: unknown, record: EquipmentSchedule) => {
        const riskScore = riskScores?.equipment_risk_scores?.find(
          (r) => r.equipment_id === record.equipment_id
        );
        return (
          <Space>
            <span>{record.equipment_name}</span>
            {riskScore && <RiskIndicator level={riskScore.risk_level} size="small" />}
          </Space>
        );
      },
    },
    {
      title: t('equipment.type', 'Type'),
      dataIndex: 'equipment_type',
      key: 'equipment_type',
      width: 130,
      render: (v: string) => (v ? <Tag>{v}</Tag> : '-'),
      filters: [
        ...new Set(
          (schedules || []).map((s) => s.equipment_type).filter(Boolean),
        ),
      ].map((tp) => ({ text: tp!, value: tp! })),
      onFilter: (value, record) => record.equipment_type === value,
    },
    {
      title: t('equipment.berth', 'Berth'),
      dataIndex: 'berth',
      key: 'berth',
      width: 100,
      render: (v: string) => v || '-',
      filters: [
        ...new Set(
          (schedules || []).map((s) => s.berth).filter(Boolean),
        ),
      ].map((b) => ({ text: b!, value: b! })),
      onFilter: (value, record) => record.berth === value,
    },
    ...DAY_NAMES.map((day, idx) => ({
      title: day,
      key: `day_${idx}`,
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: EquipmentSchedule) =>
        shiftTag(record.days[String(idx)]),
    })),
  ];

  const todayEntries: UpcomingEntry[] = upcomingData?.today ?? [];
  const tomorrowEntries: UpcomingEntry[] = upcomingData?.tomorrow ?? [];
  const todayDate: string = upcomingData?.today_date ?? '';
  const tomorrowDate: string = upcomingData?.tomorrow_date ?? '';

  // Group entries by berth with day/night columns
  type BerthRow = { berth: string; day: UpcomingEntry[]; night: UpcomingEntry[] };
  const groupByBerth = (entries: UpcomingEntry[]): BerthRow[] => {
    const map: Record<string, { day: UpcomingEntry[]; night: UpcomingEntry[] }> = {};
    for (const e of entries) {
      const key = e.berth || 'Unknown';
      if (!map[key]) map[key] = { day: [], night: [] };
      // Default to day shift if shift is not specified
      const shift = e.shift || 'day';
      if (shift === 'night') {
        map[key].night.push(e);
      } else {
        // 'day', 'both', or any other value goes to day
        map[key].day.push(e);
      }
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([berth, shifts]) => ({ berth, ...shifts }));
  };

  const berthColumns: ColumnsType<BerthRow> = [
    {
      title: t('schedules.berth', 'Berth'),
      dataIndex: 'berth',
      key: 'berth',
      width: 90,
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: <><Tag color="gold">D</Tag> {t('schedules.dayShift', 'Day')}</>,
      key: 'day',
      render: (_: unknown, record: BerthRow) =>
        record.day.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          record.day.map((e) => (
            <Tag key={e.equipment_id} style={{ marginBottom: 4 }}>
              {e.equipment_name}
            </Tag>
          ))
        ),
    },
    {
      title: <><Tag color="purple">N</Tag> {t('schedules.nightShift', 'Night')}</>,
      key: 'night',
      render: (_: unknown, record: BerthRow) =>
        record.night.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          record.night.map((e) => (
            <Tag key={e.equipment_id} style={{ marginBottom: 4 }}>
              {e.equipment_name}
            </Tag>
          ))
        ),
    },
  ];

  const todayBerths = groupByBerth(todayEntries);
  const tomorrowBerths = groupByBerth(tomorrowEntries);

  // Calculate average capacity for gauge
  const avgCapacity = capacityData && capacityData.length > 0
    ? capacityData.reduce((sum, d) => sum + d.utilization_rate, 0) / capacityData.length
    : 0;

  return (
    <div>
      {/* AI Stats Cards */}
      <div style={{ marginBottom: 16 }}>
        <ScheduleStatsCards />
      </div>

      {/* AI Insights and Coverage Gaps */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <AIScheduleInsights compact />
        </Col>
        <Col xs={24} lg={8}>
          <CoverageGapsPanel compact />
        </Col>
      </Row>

      {/* Today & Tomorrow Inspections */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={
              <Typography.Text strong>
                {t('schedules.todayInspections', "Today's Inspections")}
                {todayDate && ` — ${todayDate}`}
              </Typography.Text>
            }
            size="small"
            loading={upcomingLoading}
          >
            {todayBerths.length === 0 ? (
              <Typography.Text type="secondary">
                {t('schedules.noInspectionsToday', 'No inspections scheduled for today')}
              </Typography.Text>
            ) : (
              <Table
                rowKey="berth"
                columns={berthColumns}
                dataSource={todayBerths}
                pagination={false}
                size="small"
                bordered
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={
              <Typography.Text strong>
                {t('schedules.tomorrowInspections', "Tomorrow's Inspections")}
                {tomorrowDate && ` — ${tomorrowDate}`}
              </Typography.Text>
            }
            size="small"
            loading={upcomingLoading}
          >
            {tomorrowBerths.length === 0 ? (
              <Typography.Text type="secondary">
                {t('schedules.noInspectionsTomorrow', 'No inspections scheduled for tomorrow')}
              </Typography.Text>
            ) : (
              <Table
                rowKey="berth"
                columns={berthColumns}
                dataSource={tomorrowBerths}
                pagination={false}
                size="small"
                bordered
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Tabbed Content */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: '1',
              label: t('schedules.ai.scheduleGrid', 'Schedule Grid'),
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                    <Space>
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={downloadTemplate}
                      >
                        Download Template
                      </Button>
                      <Button
                        icon={<InfoCircleOutlined />}
                        onClick={() => setShowFormatHelp(true)}
                      >
                        Import Format
                      </Button>
                      <Button
                        onClick={() => debugMutation.mutate()}
                        loading={debugMutation.isPending}
                      >
                        🔍 Debug Schedules
                      </Button>
                      <Button
                        danger
                        onClick={() => {
                          Modal.confirm({
                            title: 'Clear All Schedules?',
                            content: 'This will delete ALL schedule entries from the database. This cannot be undone!',
                            okText: 'Yes, Clear All',
                            okType: 'danger',
                            onOk: () => clearMutation.mutate(),
                          });
                        }}
                        loading={clearMutation.isPending}
                      >
                        🗑️ Clear All Schedules
                      </Button>
                    </Space>
                    <Upload
                      accept=".xlsx,.xls"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        uploadMutation.mutate(file);
                        return false;
                      }}
                    >
                      <Button
                        icon={<UploadOutlined />}
                        loading={uploadMutation.isPending}
                        type="primary"
                      >
                        {t('schedules.importSchedule', 'Import Schedule')}
                      </Button>
                    </Upload>
                  </div>
                  <Table
                    rowKey="equipment_id"
                    columns={scheduleColumns}
                    dataSource={schedules || []}
                    loading={schedulesLoading}
                    locale={{
                      emptyText: t(
                        'schedules.noSchedule',
                        'No schedule imported yet. Click "Import Schedule" to upload an Excel file.',
                      ),
                    }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 1000 }}
                    size="small"
                  />
                </div>
              ),
            },
            {
              key: '2',
              label: t('schedules.ai.heatmapView', 'Heatmap View'),
              children: <ScheduleHeatmap />,
            },
            {
              key: '3',
              label: t('schedules.ai.aiAnalytics', 'AI Analytics'),
              children: (
                <div>
                  <Row gutter={[16, 16]}>
                    <Col xs={24}>
                      <AIScheduleInsights />
                    </Col>
                    <Col xs={24} lg={16}>
                      <HealthTrendChart />
                    </Col>
                    <Col xs={24} lg={8}>
                      <CapacityGauge
                        utilization={avgCapacity}
                        title={t('schedules.ai.capacityUtilization', 'Capacity Utilization (30 Days)')}
                        showRecommendations={true}
                      />
                    </Col>
                    <Col xs={24}>
                      <CoverageGapsPanel />
                    </Col>
                  </Row>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Upload Result Modal */}
      <Modal
        title={t('schedules.uploadResult', 'Schedule Upload Result')}
        open={uploadResult !== null}
        onCancel={() => setUploadResult(null)}
        onOk={() => setUploadResult(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {uploadResult && (
          <>
            <p>
              <strong>{uploadResult.created}</strong>{' '}
              {t('schedules.entriesCreated', 'schedule entries created')} {t('schedules.forEquipment', 'for')}{' '}
              <strong>{uploadResult.equipment_processed}</strong>{' '}
              {t('schedules.equipment', 'equipment')}.
            </p>
            {uploadResult.summary && (
              <Alert
                type="success"
                showIcon
                message={
                  <div>
                    <strong>Import Summary:</strong>{' '}
                    <Tag color="gold">{uploadResult.summary.day_shifts} Day Shifts</Tag>
                    <Tag color="purple">{uploadResult.summary.night_shifts} Night Shifts</Tag>
                    <Tag>{uploadResult.summary.total_active} Total Active</Tag>
                  </div>
                }
                style={{ marginBottom: 16 }}
              />
            )}
            {uploadResult.errors.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={t('schedules.uploadWarnings', '{{count}} warnings', {
                  count: uploadResult.errors.length,
                })}
                description={
                  <ul
                    style={{
                      maxHeight: 200,
                      overflow: 'auto',
                      paddingLeft: 16,
                      margin: 0,
                    }}
                  >
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </>
        )}
      </Modal>

      {/* Debug Modal */}
      <Modal
        title="🔍 Schedule Debug Information"
        open={debugData !== null}
        onCancel={() => setDebugData(null)}
        onOk={() => setDebugData(null)}
        width={800}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {debugData && (
          <div>
            <Alert
              type="info"
              message={
                <div>
                  <strong>Summary:</strong> {debugData.total_schedules || 0} total schedules |{' '}
                  <Tag color="gold">{debugData.day_shifts || 0} Day Shifts</Tag>
                  <Tag color="purple">{debugData.night_shifts || 0} Night Shifts</Tag>
                  {debugData.other_shifts > 0 && (
                    <Tag color="red">{debugData.other_shifts} Other</Tag>
                  )}
                </div>
              }
              style={{ marginBottom: 16 }}
            />
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <Table
                size="small"
                dataSource={debugData.schedules || []}
                rowKey="id"
                pagination={false}
                columns={[
                  { title: 'ID', dataIndex: 'id', width: 60 },
                  { title: 'Equipment', dataIndex: 'equipment_name', width: 150 },
                  { title: 'Berth', dataIndex: 'berth', width: 80 },
                  {
                    title: 'Day',
                    dataIndex: 'day_of_week',
                    width: 100,
                    render: (d: number) =>
                      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d] || d,
                  },
                  {
                    title: 'Shift',
                    dataIndex: 'shift',
                    width: 100,
                    render: (shift: string) => (
                      <Tag color={shift === 'day' ? 'gold' : shift === 'night' ? 'purple' : 'red'}>
                        {shift}
                      </Tag>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Format Help Modal */}
      <Modal
        title="📋 Schedule Import Format"
        open={showFormatHelp}
        onCancel={() => setShowFormatHelp(false)}
        onOk={() => setShowFormatHelp(false)}
        width={700}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <div style={{ fontSize: '14px' }}>
          <Alert
            type="info"
            message="Excel Format Requirements"
            description={
              <div style={{ marginTop: 8 }}>
                <p><strong>Columns:</strong></p>
                <ul style={{ marginBottom: 16 }}>
                  <li><strong>Column A:</strong> Equipment name (must match exactly with equipment in system)</li>
                  <li><strong>Column B:</strong> Berth (required, e.g., East, West)</li>
                  <li><strong>Columns C-I:</strong> Days of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)</li>
                </ul>
                <p><strong>Cell Values (Day Columns):</strong></p>
                <ul>
                  <li><Tag color="gold">D</Tag> or <Tag>1</Tag> = Day shift only</li>
                  <li><Tag color="purple">N</Tag> or <Tag>2</Tag> = Night shift only</li>
                  <li><Tag color="blue">D+N</Tag> or <Tag>3</Tag> = Both day and night shifts</li>
                  <li><Tag color="default">Empty</Tag> = No inspection scheduled</li>
                </ul>
              </div>
            }
            style={{ marginBottom: 16 }}
          />

          <div style={{
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            padding: 12,
            backgroundColor: '#fafafa',
            fontFamily: 'monospace',
            fontSize: '12px',
            overflow: 'auto'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#e6f7ff' }}>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Equipment</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Berth</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Mon</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Tue</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Wed</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Thu</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Fri</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Sat</th>
                  <th style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Sun</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Crane-01</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>East</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#fff7e6' }}>D</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#fff7e6' }}>D</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#fff7e6' }}>D</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#fff7e6' }}>D</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#fff7e6' }}>D</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}></td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Crane-02</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>East</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#f9f0ff' }}>N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#f9f0ff' }}>N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#f9f0ff' }}>N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#f9f0ff' }}>N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#f9f0ff' }}>N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}></td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>Forklift-01</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}>West</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#e6f7ff' }}>D+N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#e6f7ff' }}>D+N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#e6f7ff' }}>D+N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#e6f7ff' }}>D+N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#e6f7ff' }}>D+N</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px', backgroundColor: '#e6f7ff' }}>D</td>
                  <td style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}></td>
                </tr>
              </tbody>
            </table>
          </div>

          <Alert
            type="success"
            message="Pro Tips"
            description={
              <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                <li>Equipment names are case-insensitive but must match exactly</li>
                <li>You can use <code>D</code>, <code>DAY</code>, or <code>1</code> for day shift</li>
                <li>You can use <code>N</code>, <code>NIGHT</code>, or <code>2</code> for night shift</li>
                <li>Click "Download Template" to get a ready-to-use example file</li>
              </ul>
            }
            style={{ marginTop: 16 }}
          />
        </div>
      </Modal>
    </div>
  );
}
