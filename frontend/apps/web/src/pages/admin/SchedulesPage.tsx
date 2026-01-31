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
  List,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionRoutinesApi,
  type EquipmentSchedule,
  type UpcomingEntry,
} from '@inspection/shared';

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
  } | null>(null);

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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => inspectionRoutinesApi.uploadSchedule(file),
    onSuccess: (res) => {
      const result = res.data as any;
      setUploadResult({
        created: result.created ?? 0,
        equipment_processed: result.equipment_processed ?? 0,
        errors: result.errors ?? [],
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

  const scheduleColumns: ColumnsType<EquipmentSchedule> = [
    {
      title: t('equipment.name', 'Equipment'),
      dataIndex: 'equipment_name',
      key: 'equipment_name',
      fixed: 'left',
      width: 180,
      sorter: (a, b) => a.equipment_name.localeCompare(b.equipment_name),
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

  const renderUpcomingItem = (item: UpcomingEntry) => (
    <List.Item>
      <List.Item.Meta
        title={item.equipment_name}
        description={
          <>
            {item.equipment_type && <Tag>{item.equipment_type}</Tag>}
            {item.berth && <Tag color="geekblue">{item.berth}</Tag>}
            <Tag color={item.shift === 'day' ? 'gold' : 'purple'}>
              {item.shift.toUpperCase()}
            </Tag>
          </>
        }
      />
    </List.Item>
  );

  return (
    <div>
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
            {todayEntries.length === 0 ? (
              <Typography.Text type="secondary">
                {t('schedules.noInspectionsToday', 'No inspections scheduled for today')}
              </Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={todayEntries}
                renderItem={renderUpcomingItem}
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
            {tomorrowEntries.length === 0 ? (
              <Typography.Text type="secondary">
                {t('schedules.noInspectionsTomorrow', 'No inspections scheduled for tomorrow')}
              </Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={tomorrowEntries}
                renderItem={renderUpcomingItem}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Equipment Schedule Grid */}
      <Card
        title={
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('nav.inspectionSchedule', 'Inspection Schedule')}
          </Typography.Title>
        }
        extra={
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
        }
      >
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
          scroll={{ x: 900 }}
          size="small"
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
    </div>
  );
}
