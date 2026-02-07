import { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Button,
  Statistic,
  Space,
  Descriptions,
  Timeline,
  Spin,
  Empty,
  message,
  Typography,
  Divider,
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  ToolOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi } from '@inspection/shared';
import { useAuth } from '../providers/AuthProvider';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface EquipmentCard {
  id: number;
  name: string;
  name_ar: string | null;
  status: string;
  status_color: 'green' | 'yellow' | 'red';
  days_stopped: number | null;
}

interface EquipmentGroup {
  equipment_type: string;
  berth: string | null;
  equipment: EquipmentCard[];
}

interface DashboardData {
  summary: { green: number; yellow: number; red: number };
  groups: EquipmentGroup[];
  berths: string[];
}

interface StatusLog {
  id: number;
  old_status: string | null;
  new_status: string;
  reason: string;
  next_action: string;
  changed_by: string;
  changed_by_role_id: string;
  created_at: string;
}

interface EquipmentDetails {
  id: number;
  name: string;
  name_ar: string | null;
  equipment_type: string;
  equipment_type_2: string | null;
  serial_number: string;
  berth: string | null;
  location: string | null;
  manufacturer: string | null;
  model_number: string | null;
  capacity: string | null;
  installation_date: string | null;
  status: string;
  days_stopped: number | null;
  current_reason: string | null;
  current_next_action: string | null;
  latest_status_change: StatusLog | null;
  status_sources: { type: string; id: number; message: string; date: string }[];
}

const statusColorMap: Record<string, string> = {
  active: 'green',
  under_maintenance: 'orange',
  paused: 'orange',
  stopped: 'red',
  out_of_service: 'red',
};

const statusLabelMap: Record<string, string> = {
  active: 'Active',
  under_maintenance: 'Under Maintenance',
  paused: 'Paused',
  stopped: 'Stopped',
  out_of_service: 'Out of Service',
};

export default function EquipmentDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [berthFilter, setBerthFilter] = useState<string | undefined>(undefined);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form] = Form.useForm();

  const canEdit = user?.role === 'admin' || user?.role === 'engineer';

  // Fetch dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['equipment-dashboard', statusFilter, berthFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status_color = statusFilter;
      if (berthFilter) params.berth = berthFilter;
      const res = await equipmentApi.getDashboard(params);
      return res.data?.data as DashboardData;
    },
  });

  // Fetch equipment details
  const { data: equipmentDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['equipment-details', selectedEquipmentId],
    queryFn: async () => {
      if (!selectedEquipmentId) return null;
      const res = await equipmentApi.getDetails(selectedEquipmentId);
      return res.data?.data as EquipmentDetails;
    },
    enabled: !!selectedEquipmentId,
  });

  // Fetch status history
  const { data: statusHistory } = useQuery({
    queryKey: ['equipment-status-history', selectedEquipmentId],
    queryFn: async () => {
      if (!selectedEquipmentId) return [];
      const res = await equipmentApi.getStatusHistory(selectedEquipmentId);
      return res.data?.data as StatusLog[];
    },
    enabled: !!selectedEquipmentId,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (payload: { status: string; reason: string; next_action: string }) =>
      equipmentApi.updateStatus(selectedEquipmentId!, payload),
    onSuccess: () => {
      message.success(t('equipment.statusUpdated', 'Status updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['equipment-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-details', selectedEquipmentId] });
      queryClient.invalidateQueries({ queryKey: ['equipment-status-history', selectedEquipmentId] });
      setEditMode(false);
      form.resetFields();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || t('common.error', 'Error');
      message.error(msg);
    },
  });

  const handleCardClick = (equipmentId: number) => {
    setSelectedEquipmentId(equipmentId);
    setDetailModalOpen(true);
    setEditMode(false);
  };

  const handleCloseModal = () => {
    setDetailModalOpen(false);
    setSelectedEquipmentId(null);
    setEditMode(false);
    form.resetFields();
  };

  const handleSaveStatus = () => {
    form.validateFields().then((values) => {
      updateStatusMutation.mutate(values);
    });
  };

  const getStatusIcon = (color: string) => {
    switch (color) {
      case 'green':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />;
      case 'yellow':
        return <ToolOutlined style={{ color: '#faad14', fontSize: 24 }} />;
      case 'red':
        return <StopOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />;
      default:
        return null;
    }
  };

  const getCardStyle = (color: string) => {
    const styles: Record<string, React.CSSProperties> = {
      green: { borderLeft: '4px solid #52c41a', background: '#f6ffed' },
      yellow: { borderLeft: '4px solid #faad14', background: '#fffbe6' },
      red: { borderLeft: '4px solid #ff4d4f', background: '#fff2f0' },
    };
    return styles[color] || {};
  };

  if (dashboardLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const summary = dashboardData?.summary || { green: 0, yellow: 0, red: 0 };
  const groups = dashboardData?.groups || [];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>{t('equipment.dashboard', 'Equipment Dashboard')}</Title>

      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={8}>
          <Card
            hoverable
            onClick={() => setStatusFilter(statusFilter === 'green' ? undefined : 'green')}
            style={{
              background: statusFilter === 'green' ? '#52c41a' : '#f6ffed',
              cursor: 'pointer',
            }}
          >
            <Statistic
              title={<span style={{ color: statusFilter === 'green' ? '#fff' : '#52c41a' }}>{t('equipment.active', 'Active')}</span>}
              value={summary.green}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: statusFilter === 'green' ? '#fff' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card
            hoverable
            onClick={() => setStatusFilter(statusFilter === 'yellow' ? undefined : 'yellow')}
            style={{
              background: statusFilter === 'yellow' ? '#faad14' : '#fffbe6',
              cursor: 'pointer',
            }}
          >
            <Statistic
              title={<span style={{ color: statusFilter === 'yellow' ? '#fff' : '#faad14' }}>{t('equipment.maintenance', 'Maintenance')}</span>}
              value={summary.yellow}
              prefix={<ToolOutlined />}
              valueStyle={{ color: statusFilter === 'yellow' ? '#fff' : '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card
            hoverable
            onClick={() => setStatusFilter(statusFilter === 'red' ? undefined : 'red')}
            style={{
              background: statusFilter === 'red' ? '#ff4d4f' : '#fff2f0',
              cursor: 'pointer',
            }}
          >
            <Statistic
              title={<span style={{ color: statusFilter === 'red' ? '#fff' : '#ff4d4f' }}>{t('equipment.stopped', 'Stopped')}</span>}
              value={summary.red}
              prefix={<StopOutlined />}
              valueStyle={{ color: statusFilter === 'red' ? '#fff' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder={t('equipment.filterByBerth', 'Filter by Berth')}
          allowClear
          style={{ width: 150 }}
          value={berthFilter}
          onChange={(v) => setBerthFilter(v)}
        >
          <Select.Option value="east">{t('equipment.east', 'East')}</Select.Option>
          <Select.Option value="west">{t('equipment.west', 'West')}</Select.Option>
          <Select.Option value="both">{t('equipment.both', 'Both')}</Select.Option>
        </Select>
        {(statusFilter || berthFilter) && (
          <Button onClick={() => { setStatusFilter(undefined); setBerthFilter(undefined); }}>
            {t('common.clearFilters', 'Clear Filters')}
          </Button>
        )}
      </Space>

      {/* Equipment Groups */}
      {groups.length === 0 ? (
        <Empty description={t('equipment.noEquipment', 'No equipment found')} />
      ) : (
        groups.map((group, idx) => (
          <Card
            key={idx}
            title={`${group.equipment_type} - ${group.berth ? group.berth.charAt(0).toUpperCase() + group.berth.slice(1) : 'Unassigned'}`}
            style={{ marginBottom: 16 }}
            size="small"
          >
            <Row gutter={[12, 12]}>
              {group.equipment.map((eq) => (
                <Col key={eq.id} xs={12} sm={8} md={6} lg={4}>
                  <Card
                    hoverable
                    size="small"
                    style={{ ...getCardStyle(eq.status_color), textAlign: 'center' }}
                    onClick={() => handleCardClick(eq.id)}
                  >
                    {getStatusIcon(eq.status_color)}
                    <div style={{ marginTop: 8, fontWeight: 600 }}>{eq.name}</div>
                    {eq.days_stopped !== null && eq.days_stopped > 0 && (
                      <Tag color="red" style={{ marginTop: 4 }}>
                        <ClockCircleOutlined /> {eq.days_stopped} {t('equipment.days', 'days')}
                      </Tag>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        ))
      )}

      {/* Detail Modal */}
      <Modal
        title={equipmentDetails?.name || t('equipment.details', 'Equipment Details')}
        open={detailModalOpen}
        onCancel={handleCloseModal}
        width={700}
        footer={null}
      >
        {detailsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : equipmentDetails ? (
          <div>
            {/* Equipment Details */}
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label={t('equipment.name', 'Name')}>{equipmentDetails.name}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.type', 'Type')}>{equipmentDetails.equipment_type}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.type2', 'Type 2')}>{equipmentDetails.equipment_type_2 || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.serial', 'Serial')}>{equipmentDetails.serial_number}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.berth', 'Berth')}>{equipmentDetails.berth || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.location', 'Location')}>{equipmentDetails.location || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.manufacturer', 'Manufacturer')}>{equipmentDetails.manufacturer || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.model', 'Model')}>{equipmentDetails.model_number || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.capacity', 'Capacity')}>{equipmentDetails.capacity || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('equipment.installDate', 'Install Date')}>{equipmentDetails.installation_date || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider />

            {/* Current Status */}
            <Title level={5}>{t('equipment.currentStatus', 'Current Status')}</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Tag color={statusColorMap[equipmentDetails.status]} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {statusLabelMap[equipmentDetails.status] || equipmentDetails.status}
                </Tag>
                {equipmentDetails.days_stopped !== null && equipmentDetails.days_stopped > 0 && (
                  <Text type="danger" style={{ marginLeft: 8 }}>
                    ({equipmentDetails.days_stopped} {t('equipment.days', 'days')})
                  </Text>
                )}
              </div>
              {equipmentDetails.current_reason && (
                <div>
                  <Text strong>{t('equipment.reason', 'Reason')}: </Text>
                  <Text>{equipmentDetails.current_reason}</Text>
                </div>
              )}
              {equipmentDetails.current_next_action && (
                <div>
                  <Text strong>{t('equipment.nextAction', 'Next Action')}: </Text>
                  <Text>{equipmentDetails.current_next_action}</Text>
                </div>
              )}
              {equipmentDetails.latest_status_change && (
                <div>
                  <Text type="secondary">
                    {t('equipment.changedBy', 'Changed by')}: {equipmentDetails.latest_status_change.changed_by_role_id} - {equipmentDetails.latest_status_change.changed_by}
                    {' '}({new Date(equipmentDetails.latest_status_change.created_at).toLocaleDateString()})
                  </Text>
                </div>
              )}
            </Space>

            {/* Status Sources */}
            {equipmentDetails.status_sources && equipmentDetails.status_sources.length > 0 && (
              <>
                <Divider />
                <Title level={5}>{t('equipment.statusSource', 'Status Source (from workflow)')}</Title>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {equipmentDetails.status_sources.map((src, i) => (
                    <li key={i}>
                      <Text>{src.message}</Text>
                      <Text type="secondary"> ({new Date(src.date).toLocaleDateString()})</Text>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Edit Status Form (Admin/Engineer only) */}
            {canEdit && (
              <>
                <Divider />
                {!editMode ? (
                  <Button type="primary" onClick={() => setEditMode(true)}>
                    {t('equipment.editStatus', 'Edit Status')}
                  </Button>
                ) : (
                  <Card title={t('equipment.editStatus', 'Edit Status')} size="small">
                    <Form form={form} layout="vertical">
                      <Form.Item
                        name="status"
                        label={t('equipment.newStatus', 'New Status')}
                        rules={[{ required: true }]}
                        initialValue={equipmentDetails.status}
                      >
                        <Select>
                          <Select.Option value="active">{t('equipment.active', 'Active')}</Select.Option>
                          <Select.Option value="under_maintenance">{t('equipment.underMaintenance', 'Under Maintenance')}</Select.Option>
                          <Select.Option value="paused">{t('equipment.paused', 'Paused')}</Select.Option>
                          <Select.Option value="stopped">{t('equipment.stoppedStatus', 'Stopped')}</Select.Option>
                          <Select.Option value="out_of_service">{t('equipment.outOfService', 'Out of Service')}</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item
                        name="reason"
                        label={t('equipment.reason', 'Reason')}
                        rules={[{ required: true, message: t('equipment.reasonRequired', 'Reason is required') }]}
                      >
                        <TextArea rows={2} placeholder={t('equipment.reasonPlaceholder', 'Enter reason for status change...')} />
                      </Form.Item>
                      <Form.Item
                        name="next_action"
                        label={t('equipment.nextAction', 'Next Action')}
                        rules={[{ required: true, message: t('equipment.nextActionRequired', 'Next action is required') }]}
                      >
                        <TextArea rows={2} placeholder={t('equipment.nextActionPlaceholder', 'Enter next action needed...')} />
                      </Form.Item>
                      <Space>
                        <Button type="primary" onClick={handleSaveStatus} loading={updateStatusMutation.isPending}>
                          {t('common.save', 'Save')}
                        </Button>
                        <Button onClick={() => { setEditMode(false); form.resetFields(); }}>
                          {t('common.cancel', 'Cancel')}
                        </Button>
                      </Space>
                    </Form>
                  </Card>
                )}
              </>
            )}

            {/* Status History */}
            {statusHistory && statusHistory.length > 0 && (
              <>
                <Divider />
                <Title level={5}>{t('equipment.statusHistory', 'Status History')}</Title>
                <Timeline
                  items={statusHistory.map((log) => ({
                    color: statusColorMap[log.new_status] || 'gray',
                    children: (
                      <div>
                        <div>
                          <Tag>{log.old_status || 'new'}</Tag> → <Tag color={statusColorMap[log.new_status]}>{log.new_status}</Tag>
                        </div>
                        <div><Text strong>{t('equipment.reason', 'Reason')}:</Text> {log.reason}</div>
                        <div><Text strong>{t('equipment.nextAction', 'Next Action')}:</Text> {log.next_action}</div>
                        <div>
                          <Text type="secondary">
                            {log.changed_by_role_id} - {log.changed_by} ({new Date(log.created_at).toLocaleString()})
                          </Text>
                        </div>
                      </div>
                    ),
                  }))}
                />
              </>
            )}
          </div>
        ) : (
          <Empty />
        )}
      </Modal>
    </div>
  );
}
