import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  Space,
  message,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  Progress,
  Drawer,
  Alert,
  Checkbox,
  Tooltip,
  Badge,
  Spin,
  Tabs,
  List,
  Divider,
  Empty,
  Radio,
  Steps,
  Input,
} from 'antd';
import {
  PlusOutlined,
  TeamOutlined,
  ReloadOutlined,
  FilterOutlined,
  RobotOutlined,
  CalendarOutlined,
  TableOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  ClusterOutlined,
  FileOutlined,
  SwapOutlined,
  WarningOutlined,
  SunOutlined,
  CloudOutlined,
  MoonOutlined,
  AppstoreOutlined,
  SearchOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionAssignmentsApi,
  rosterApi,
  inspectionRoutinesApi,
  equipmentApi,
  type AssignTeamPayload,
  type AssignmentStats,
  type InspectorSuggestion,
} from '@inspection/shared';
import dayjs from 'dayjs';
import {
  SmartBatchView,
  TemplateManager,
  WorkloadBalancer,
  InspectorScoreboardCard,
  TeamPerformanceDashboard,
  FatigueAlerts,
  RouteOptimizer,
} from '../../components/inspection-assignments';
import { scheduleAIApi } from '@inspection/shared';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// SLA Monitor Component
function SLAMonitorView() {
  const { t } = useTranslation();

  // Fetch SLA warnings
  const { data: slaWarnings, isLoading: slaLoading } = useQuery({
    queryKey: ['schedule-ai', 'sla-warnings', 14],
    queryFn: async () => {
      const response = await scheduleAIApi.getSLAWarnings(14);
      return response;
    },
    staleTime: 60000,
  });

  // Fetch capacity forecast
  const { data: capacityForecast, isLoading: capacityLoading } = useQuery({
    queryKey: ['schedule-ai', 'capacity-forecast', 7],
    queryFn: async () => {
      const response = await scheduleAIApi.getCapacityForecast(7);
      return response;
    },
    staleTime: 60000,
  });

  const warnings = slaWarnings || [];
  const forecast = capacityForecast || [];

  // Chart data for capacity forecast
  const chartData = forecast.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    required: item.required_inspections,
    available: item.available_capacity,
    utilization: item.utilization_rate,
  }));

  return (
    <Row gutter={[16, 16]}>
      {/* SLA Warnings Panel */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              <ClockCircleOutlined />
              <span>{t('scheduleAI.slaWarnings', 'SLA Warnings (14 Days)')}</span>
            </Space>
          }
          extra={<Badge count={warnings.filter((w: any) => w.risk_level === 'critical').length} />}
        >
          {slaLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : warnings.length > 0 ? (
            <List
              size="small"
              dataSource={warnings}
              renderItem={(warning: any) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Badge
                        status={
                          warning.risk_level === 'critical'
                            ? 'error'
                            : warning.risk_level === 'high'
                            ? 'warning'
                            : 'processing'
                        }
                      />
                    }
                    title={
                      <Space>
                        <Text strong>{warning.equipment_name}</Text>
                        <Tag
                          color={
                            warning.risk_level === 'critical'
                              ? 'red'
                              : warning.risk_level === 'high'
                              ? 'orange'
                              : 'blue'
                          }
                        >
                          {warning.risk_level}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <Text type="secondary">
                          SLA Due: {new Date(warning.sla_due_date).toLocaleDateString()} (
                          {warning.days_until_due} days)
                        </Text>
                        <br />
                        <Text type="secondary">{warning.recommended_action}</Text>
                        {warning.assigned_inspector && (
                          <>
                            <br />
                            <Text type="secondary">
                              Assigned: {warning.assigned_inspector}
                            </Text>
                          </>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Alert
              type="success"
              message={t('scheduleAI.noSLAWarnings', 'All inspections within SLA')}
              showIcon
            />
          )}
        </Card>
      </Col>

      {/* Capacity Forecast Panel */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              <BulbOutlined />
              <span>{t('scheduleAI.capacityForecast', 'Capacity Forecast (7 Days)')}</span>
            </Space>
          }
        >
          {capacityLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : forecast.length > 0 ? (
            <>
              <List
                size="small"
                dataSource={forecast}
                style={{ marginBottom: 16 }}
                renderItem={(day: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{new Date(day.date).toLocaleDateString()}</Text>
                          {day.is_overloaded && (
                            <Tag color="red" icon={<WarningOutlined />}>
                              OVERLOADED
                            </Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <Text type="secondary">
                            Required: {day.required_inspections} | Available: {day.available_capacity} | Utilization: {day.utilization_rate.toFixed(0)}%
                          </Text>
                          <Progress
                            percent={day.utilization_rate}
                            status={day.is_overloaded ? 'exception' : 'normal'}
                            size="small"
                            style={{ marginTop: 4 }}
                          />
                          {day.recommendations?.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              {day.recommendations.map((rec: string, idx: number) => (
                                <Tag key={idx} color="orange" style={{ marginTop: 4 }}>
                                  {rec}
                                </Tag>
                              ))}
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            </>
          ) : (
            <Alert
              type="info"
              message={t('scheduleAI.noCapacityData', 'No capacity forecast data available')}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ─── Generate Inspection List Modal (Wizard) ────────────────────────────────

interface GenerateWizardProps {
  open: boolean;
  onClose: () => void;
  form: any;
  selectedEquipmentIds: number[];
  onSelectChange: (ids: number[]) => void;
  generateMutation: any;
}

function GenerateWizardModal({ open, onClose, form, selectedEquipmentIds, onSelectChange, generateMutation }: GenerateWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [equipSearch, setEquipSearch] = useState('');
  const [autoSelected, setAutoSelected] = useState(false);

  // Watch form values
  const targetDate = Form.useWatch('target_date', form);
  const shift = Form.useWatch('shift', form);

  // Reset step when modal opens/closes
  useEffect(() => {
    if (open) { setStep(0); setEquipSearch(''); setAutoSelected(false); }
  }, [open]);

  // Day of week from date
  const dayOfWeek = useMemo(() => {
    if (!targetDate) return null;
    const d = dayjs(targetDate).day();
    return d === 0 ? 6 : d - 1;
  }, [targetDate]);

  // Fetch schedules — use same queryKey as SchedulesPage to share cache
  const { data: allSchedulesData, isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['inspection-schedules'],
    queryFn: async () => {
      const response = await inspectionRoutinesApi.getSchedules();
      return (response.data as any).data || [];
    },
    staleTime: 30000,
    enabled: open,
  });

  // Filter equipment by day + shift
  const equipment = useMemo(() => {
    if (!allSchedulesData || !Array.isArray(allSchedulesData) || dayOfWeek === null || !shift) return [];
    return allSchedulesData
      .filter((item: any) => {
        const days = item.days || {};
        const dayValue = days[String(dayOfWeek)];
        if (!dayValue) return false;
        // Match exact shift or 'both'
        if (dayValue === shift || dayValue === 'both') return true;
        // Legacy 'day' matches 'morning' or 'afternoon'
        if (dayValue === 'day' && (shift === 'morning' || shift === 'afternoon')) return true;
        // Legacy 'night' matches 'night'
        if (dayValue === 'night' && shift === 'night') return true;
        return false;
      })
      .map((item: any) => ({
        id: item.equipment_id,
        name: item.equipment_name,
        equipment_type: item.equipment_type,
        berth: item.berth,
      }));
  }, [allSchedulesData, dayOfWeek, shift]);

  // Search filter
  const filteredEquipment = useMemo(() => {
    if (!equipSearch.trim()) return equipment;
    const q = equipSearch.toLowerCase();
    return equipment.filter((eq: any) =>
      eq.name?.toLowerCase().includes(q) ||
      eq.equipment_type?.toLowerCase().includes(q) ||
      eq.berth?.toLowerCase().includes(q)
    );
  }, [equipment, equipSearch]);

  // Group by berth
  const berthGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const eq of filteredEquipment) {
      const key = eq.berth || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(eq);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEquipment]);

  // Auto-select all when equipment first loads (one-time only)
  useEffect(() => {
    if (equipment.length > 0 && !autoSelected) {
      onSelectChange(equipment.map((eq: any) => eq.id));
      setAutoSelected(true);
    }
  }, [equipment.length, autoSelected]);

  const canProceedStep1 = !!targetDate && !!shift;
  const canGenerate = canProceedStep1 && selectedEquipmentIds.length > 0;

  const shiftOptions = [
    { value: 'morning',   label: t('assignments.morning', 'Morning'),     icon: <SunOutlined />,   color: '#fa8c16', bg: '#fff7e6', border: '#ffd591', time: '06:00 – 14:00' },
    { value: 'afternoon', label: t('assignments.afternoon', 'Afternoon'), icon: <CloudOutlined />, color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff', time: '14:00 – 22:00' },
    { value: 'night',     label: t('assignments.night', 'Night'),         icon: <MoonOutlined />,  color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7', time: '22:00 – 06:00' },
  ];

  const handleGenerate = () => {
    if (!canGenerate) return;
    generateMutation.mutate({
      target_date: dayjs(targetDate).format('YYYY-MM-DD'),
      shift,
    });
  };

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={720}
      styles={{ body: { padding: 0 } }}
      style={{ top: 40 }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 28px 16px',
        background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
        borderRadius: '8px 8px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(255,255,255,0.2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div>
            <Title level={4} style={{ color: '#fff', margin: 0, lineHeight: 1.2 }}>
              {t('assignments.generate', 'Generate Inspection List')}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
              {t('assignments.generateDesc', 'Select date, shift, and review equipment')}
            </Text>
          </div>
        </div>
        <Steps
          current={step}
          size="small"
          onChange={(s) => { if (s === 0 || canProceedStep1) setStep(s); }}
          items={[
            { title: <span style={{ color: '#fff' }}>{t('assignments.dateShift', 'Date & Shift')}</span>, icon: <CalendarOutlined style={{ color: step >= 0 ? '#fff' : 'rgba(255,255,255,0.5)' }} /> },
            { title: <span style={{ color: '#fff' }}>{t('assignments.equipment', 'Equipment')}</span>, icon: <AppstoreOutlined style={{ color: step >= 1 ? '#fff' : 'rgba(255,255,255,0.5)' }} /> },
            { title: <span style={{ color: '#fff' }}>{t('assignments.confirm', 'Confirm')}</span>, icon: <CheckCircleOutlined style={{ color: step >= 2 ? '#fff' : 'rgba(255,255,255,0.5)' }} /> },
          ]}
          style={{ maxWidth: 480 }}
        />
      </div>

      <div style={{ padding: '24px 28px 20px' }}>
        <Form form={form} layout="vertical">

          {/* ── STEP 1: Date & Shift (kept mounted so Form.useWatch works) ── */}
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
              <Form.Item
                name="target_date"
                label={<Text strong style={{ fontSize: 14 }}><CalendarOutlined style={{ marginRight: 6 }} />{t('assignments.targetDate', 'Target Date')}</Text>}
                rules={[{ required: true, message: t('assignments.selectDate', 'Select a date') }]}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  format="DD/MM/YYYY"
                  size="large"
                  placeholder={t('assignments.pickDate', 'Pick inspection date')}
                />
              </Form.Item>

              {targetDate && (
                <div style={{
                  background: '#f0f5ff', borderRadius: 8, padding: '8px 14px',
                  marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <CalendarOutlined style={{ color: '#1890ff' }} />
                  <Text style={{ color: '#1890ff', fontWeight: 500 }}>
                    {dayjs(targetDate).format('dddd, DD MMMM YYYY')}
                  </Text>
                </div>
              )}

              <Form.Item
                name="shift"
                label={<Text strong style={{ fontSize: 14 }}><ClockCircleOutlined style={{ marginRight: 6 }} />{t('assignments.selectShift', 'Shift')}</Text>}
                rules={[{ required: true, message: t('assignments.selectShiftMsg', 'Select a shift') }]}
              >
                <div style={{ display: 'flex', gap: 12 }}>
                  {shiftOptions.map((opt) => {
                    const isActive = shift === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => form.setFieldValue('shift', opt.value)}
                        style={{
                          flex: 1, cursor: 'pointer', borderRadius: 12, padding: '16px 12px',
                          textAlign: 'center', transition: 'all 0.25s',
                          background: isActive ? opt.bg : '#fafafa',
                          border: `2px solid ${isActive ? opt.color : '#e8e8e8'}`,
                          boxShadow: isActive ? `0 2px 8px ${opt.color}33` : 'none',
                          transform: isActive ? 'scale(1.03)' : 'scale(1)',
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 6, color: isActive ? opt.color : '#bfbfbf' }}>
                          {opt.icon}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: isActive ? opt.color : '#595959' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{opt.time}</div>
                      </div>
                    );
                  })}
                </div>
              </Form.Item>
          </div>

          {/* ── STEP 2: Equipment Selection ── */}
          {step === 1 && (
            <div>
              {isLoadingSchedule ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 12, color: '#8c8c8c' }}>{t('assignments.loadingSchedule', 'Loading equipment...')}</div>
                </div>
              ) : equipment.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message={t('assignments.noScheduledEquipment', 'No equipment scheduled')}
                  description={t('assignments.noScheduledEquipmentDesc', 'No equipment is scheduled for this date and shift. Please import an inspection schedule first, or select a different date/shift.')}
                  style={{ borderRadius: 10 }}
                />
              ) : (
                <>
                  {/* Toolbar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <Input
                      placeholder={t('assignments.searchEquipment', 'Search equipment...')}
                      prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                      value={equipSearch}
                      onChange={(e) => setEquipSearch(e.target.value)}
                      allowClear
                      style={{ width: 240, borderRadius: 8 }}
                    />
                    <Space size={8}>
                      <Tag color="blue" style={{ margin: 0, borderRadius: 6, padding: '2px 10px' }}>
                        {selectedEquipmentIds.length} / {equipment.length} {t('assignments.selected', 'selected')}
                      </Tag>
                      <Button size="small" type="link" onClick={() => onSelectChange(equipment.map((eq: any) => eq.id))}>
                        {t('assignments.selectAll', 'Select All')}
                      </Button>
                      <Button size="small" type="link" onClick={() => onSelectChange([])}>
                        {t('assignments.deselectAll', 'Deselect All')}
                      </Button>
                    </Space>
                  </div>

                  {/* Equipment list grouped by berth */}
                  <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                    <Checkbox.Group
                      value={selectedEquipmentIds}
                      onChange={onSelectChange as any}
                      style={{ width: '100%' }}
                    >
                      {berthGroups.map(([berth, items]) => (
                        <div key={berth} style={{ marginBottom: 16 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            marginBottom: 8, padding: '4px 0',
                            borderBottom: '1px solid #f0f0f0',
                          }}>
                            <EnvironmentOutlined style={{ color: '#52c41a', fontSize: 13 }} />
                            <Text strong style={{ fontSize: 13, color: '#389e0d' }}>{berth}</Text>
                            <Badge count={items.length} style={{ backgroundColor: '#d9d9d9', color: '#595959', fontSize: 11 }} />
                          </div>
                          <Row gutter={[8, 8]}>
                            {items.map((eq: any) => {
                              const isChecked = selectedEquipmentIds.includes(eq.id);
                              return (
                                <Col xs={24} sm={12} key={eq.id}>
                                  <div
                                    onClick={() => {
                                      if (isChecked) onSelectChange(selectedEquipmentIds.filter(id => id !== eq.id));
                                      else onSelectChange([...selectedEquipmentIds, eq.id]);
                                    }}
                                    style={{
                                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                      transition: 'all 0.2s',
                                      background: isChecked ? '#f6ffed' : '#fafafa',
                                      border: `1.5px solid ${isChecked ? '#b7eb8f' : '#e8e8e8'}`,
                                    }}
                                  >
                                    <Checkbox value={eq.id} onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
                                      <div>
                                        <Text strong style={{ fontSize: 13 }}>{eq.name}</Text>
                                        {eq.equipment_type && (
                                          <Tag color="processing" style={{ fontSize: 10, margin: '0 0 0 6px', padding: '0 5px', borderRadius: 4 }}>
                                            {eq.equipment_type}
                                          </Tag>
                                        )}
                                      </div>
                                    </Checkbox>
                                  </div>
                                </Col>
                              );
                            })}
                          </Row>
                        </div>
                      ))}
                    </Checkbox.Group>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 3: Confirm ── */}
          {step === 2 && (
            <div>
              <div style={{
                background: 'linear-gradient(135deg, #f6ffed 0%, #e6f7ff 100%)',
                borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 20,
              }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 12 }} />
                <Title level={3} style={{ margin: 0, color: '#237804' }}>
                  {t('assignments.readyToGenerate', 'Ready to Generate')}
                </Title>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  {t('assignments.reviewBelow', 'Review the details below and click Generate')}
                </Text>
              </div>

              <Row gutter={16}>
                <Col span={8}>
                  <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                    <CalendarOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#8c8c8c' }}>
                      {t('assignments.date', 'Date')}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
                      {dayjs(targetDate).format('DD MMM YYYY')}
                    </div>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {dayjs(targetDate).format('dddd')}
                    </div>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                    {(shiftOptions.find(s => s.value === shift)?.icon) &&
                      <span style={{ fontSize: 24, color: shiftOptions.find(s => s.value === shift)?.color }}>
                        {shiftOptions.find(s => s.value === shift)?.icon}
                      </span>
                    }
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#8c8c8c', marginTop: 8 }}>
                      {t('assignments.shift', 'Shift')}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, textTransform: 'capitalize' }}>
                      {shift}
                    </div>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {shiftOptions.find(s => s.value === shift)?.time}
                    </div>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                    <AppstoreOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#8c8c8c' }}>
                      {t('assignments.equipment', 'Equipment')}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 22, marginTop: 4, color: '#52c41a' }}>
                      {selectedEquipmentIds.length}
                    </div>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {t('assignments.assignments', 'assignments')}
                    </div>
                  </Card>
                </Col>
              </Row>

              <Alert
                type="info"
                showIcon
                icon={<BulbOutlined />}
                message={t('assignments.afterGenerate', 'After generation, assignments will be in "unassigned" status. You can assign inspector teams from the main table.')}
                style={{ marginTop: 16, borderRadius: 8 }}
              />
            </div>
          )}
        </Form>

        {/* Footer Buttons */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0',
        }}>
          <Button onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Space>
            {step > 0 && (
              <Button onClick={() => setStep(step - 1)}>
                {t('common.back', 'Back')}
              </Button>
            )}
            {step < 2 ? (
              <Button
                type="primary"
                disabled={step === 0 ? !canProceedStep1 : equipment.length === 0 || selectedEquipmentIds.length === 0}
                onClick={() => setStep(step + 1)}
                style={{ minWidth: 120 }}
              >
                {t('common.next', 'Next')}
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                loading={generateMutation.isPending}
                disabled={!canGenerate}
                onClick={handleGenerate}
                style={{ fontWeight: 600, borderRadius: 8, minWidth: 180 }}
              >
                {t('assignments.generateList', 'Generate List')}
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  );
}

export default function InspectionAssignmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Modal states
  const [generateOpen, setGenerateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);
  const [workloadDrawerOpen, setWorkloadDrawerOpen] = useState(false);

  // View mode: table or calendar
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  // Active tab for Phase 4 features + AI Intelligence
  const [activeTab, setActiveTab] = useState<'assignments' | 'batching' | 'templates' | 'balancer' | 'ai' | 'sla'>('assignments');

  // Selected list for Phase 4 operations
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
    shift: undefined as string | undefined,
    status: undefined as string | undefined,
    equipmentType: undefined as string | undefined,
  });

  // Bulk selection
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const [generateForm] = Form.useForm();
  const [assignForm] = Form.useForm();

  // Fetch stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['inspection-assignments', 'stats'],
    queryFn: () => inspectionAssignmentsApi.getStats().then((r) => r.data?.data),
    staleTime: 60000,
  });

  // Fetch all lists with their assignments
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inspection-assignments', filters],
    queryFn: () => inspectionAssignmentsApi.getLists({
      date_from: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
      date_to: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
      shift: filters.shift as any,
      status: filters.status,
      equipment_type: filters.equipmentType,
    }),
  });

  // Fetch calendar view
  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['inspection-assignments', 'calendar'],
    queryFn: () => inspectionAssignmentsApi.getCalendarView().then((r) => r.data?.data),
    enabled: viewMode === 'calendar',
  });

  // Fetch roster availability for the selected assignment's date + shift
  const assignmentDate = selectedAssignment?.list_target_date;
  const assignmentShift = selectedAssignment?.list_shift;

  const { data: availabilityData } = useQuery({
    queryKey: ['roster', 'day-availability', assignmentDate, assignmentShift],
    queryFn: () => rosterApi.getDayAvailability(assignmentDate, assignmentShift),
    enabled: assignOpen && !!assignmentDate && !!assignmentShift,
  });

  // AI Suggestion query
  const { data: aiSuggestion, isLoading: aiSuggestionLoading, refetch: refetchAISuggestion } = useQuery({
    queryKey: ['inspection-assignments', 'ai-suggest', selectedAssignment?.id],
    queryFn: () => inspectionAssignmentsApi.getAISuggestion(selectedAssignment!.id).then((r) => r.data?.data),
    enabled: aiSuggestionOpen && !!selectedAssignment,
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'morning' | 'afternoon' | 'night' | 'day' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: (res) => {
      const result = (res.data as any)?.data ?? res.data;
      message.success(
        t('assignments.generateSuccess', 'Inspection list generated — {{count}} assignments created', {
          count: result?.total_assets ?? 0,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setGenerateOpen(false);
      generateForm.resetFields();
      setSelectedEquipmentIds([]);
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('assignments.generateError', 'Failed to generate list'));
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignTeamPayload }) =>
      inspectionAssignmentsApi.assignTeam(id, payload),
    onSuccess: (res) => {
      const data = res.data as any;
      const autoCount = data.auto_assigned || 0;
      const msg = autoCount > 0
        ? `Team assigned successfully (also auto-assigned to ${autoCount} other equipment at same berth)`
        : t('assignments.assignSuccess', 'Team assigned successfully');
      message.success(msg);
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setAssignOpen(false);
      setAiSuggestionOpen(false);
      setSelectedAssignment(null);
      assignForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('assignments.assignError', 'Failed to assign team'));
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: (assignmentIds: number[]) =>
      inspectionAssignmentsApi.bulkAssign({ assignment_ids: assignmentIds, auto_assign: true }),
    onSuccess: (res) => {
      const summary = (res.data as any)?.summary;
      message.success(`Auto-assigned ${summary?.successful || 0} of ${summary?.total || 0} assignments`);
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setSelectedRowKeys([]);
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Bulk assign failed');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => inspectionAssignmentsApi.clearAllAssignments(),
    onSuccess: (res) => {
      const result = (res.data as any).data || res.data;
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      message.success(`Cleared ${result.deleted || 0} assignments`);
    },
    onError: () => message.error('Failed to clear assignments'),
  });

  // Flatten: extract all assignments from all lists
  const rawLists: any[] = data?.data?.data || (data?.data as any)?.data || [];
  const allAssignments: any[] = useMemo(() => {
    const result: any[] = [];
    for (const list of rawLists) {
      const assignments = list.assignments || [];
      for (const a of assignments) {
        result.push({
          ...a,
          list_target_date: list.target_date,
          list_shift: list.shift,
          list_status: list.status,
        });
      }
    }
    // Sort by date descending
    result.sort((a, b) => (b.list_target_date || '').localeCompare(a.list_target_date || ''));
    return result;
  }, [rawLists]);

  // Get unique values for filters
  const equipmentTypes = useMemo(() => {
    const types = new Set<string>();
    allAssignments.forEach((a) => {
      if (a.equipment?.equipment_type) types.add(a.equipment.equipment_type);
    });
    return Array.from(types);
  }, [allAssignments]);

  // Build inspector lists from roster availability
  const availData = (availabilityData?.data as any)?.data ?? availabilityData?.data;
  const availableUsers: any[] = availData?.available ?? [];
  const onLeaveUsers: any[] = availData?.on_leave ?? [];

  const mechAvailable = availableUsers.filter(
    (u: any) => u.specialization === 'mechanical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)),
  );
  const elecAvailable = availableUsers.filter(
    (u: any) => u.specialization === 'electrical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)),
  );

  const mechOnLeave = onLeaveUsers.filter((u: any) => u.role === 'inspector' && u.specialization === 'mechanical');
  const elecOnLeave = onLeaveUsers.filter((u: any) => u.role === 'inspector' && u.specialization === 'electrical');

  const mechOptions = [...mechAvailable, ...mechOnLeave];
  const elecOptions = [...elecAvailable, ...elecOnLeave];

  const coverUserIds = new Set<number>();
  for (const u of availableUsers) {
    if (u.covering_for) coverUserIds.add(u.id);
  }

  const PENDING_LABELS: Record<string, string> = {
    both_inspections: 'Pending: Both inspections',
    mechanical_inspection: 'Pending: Mechanical inspection',
    electrical_inspection: 'Pending: Electrical inspection',
    both_verdicts: 'Pending: Both verdicts',
    mechanical_verdict: 'Pending: Mechanical verdict',
    electrical_verdict: 'Pending: Electrical verdict',
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'green';
      case 'assigned': return 'blue';
      case 'in_progress': return 'processing';
      case 'mech_complete': return 'purple';
      case 'elec_complete': return 'purple';
      case 'both_complete': return 'cyan';
      case 'assessment_pending': return 'orange';
      case 'unassigned': return 'default';
      default: return 'default';
    }
  };

  const columns = [
    {
      title: t('assignments.targetDate', 'Date'),
      dataIndex: 'list_target_date',
      key: 'date',
      width: 110,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
    {
      title: t('assignments.shift', 'Shift'),
      dataIndex: 'list_shift',
      key: 'shift',
      width: 100,
      render: (v: string) => {
        if (!v) return '-';
        const colors: Record<string, string> = {
          morning: 'gold',
          afternoon: 'blue',
          night: 'purple',
          day: 'orange'
        };
        return <Tag color={colors[v] || 'default'}>{v.toUpperCase()}</Tag>;
      },
    },
    {
      title: t('assignments.equipment', 'Equipment'),
      key: 'equipment_name',
      render: (_: unknown, record: any) => record.equipment?.name || `ID: ${record.equipment_id}`,
    },
    {
      title: t('assignments.equipmentType', 'Type'),
      key: 'equipment_type',
      render: (_: unknown, record: any) => record.equipment?.equipment_type || '-',
    },
    {
      title: t('assignments.berth', 'Berth'),
      key: 'berth',
      width: 80,
      render: (_: unknown, record: any) => record.berth || record.equipment?.berth || '-',
    },
    {
      title: t('assignments.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 180,
      render: (v: string, record: any) => (
        <div>
          <Tag color={statusColor(v)}>{(v || 'unknown').replace(/_/g, ' ').toUpperCase()}</Tag>
          {record.pending_on && PENDING_LABELS[record.pending_on] ? (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {PENDING_LABELS[record.pending_on]}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('assignments.mechInspector', 'Mech'),
      key: 'mech',
      width: 120,
      ellipsis: true,
      render: (_: unknown, record: any) =>
        record.mechanical_inspector
          ? record.mechanical_inspector.full_name
          : <Text type="secondary">—</Text>,
    },
    {
      title: t('assignments.elecInspector', 'Elec'),
      key: 'elec',
      width: 120,
      ellipsis: true,
      render: (_: unknown, record: any) =>
        record.electrical_inspector
          ? record.electrical_inspector.full_name
          : <Text type="secondary">—</Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: any) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => {
              setSelectedAssignment(record);
              assignForm.resetFields();
              setAssignOpen(true);
            }}
            disabled={record.status === 'completed'}
          >
            {record.mechanical_inspector_id ? 'Reassign' : 'Assign'}
          </Button>
          {!record.mechanical_inspector_id && (
            <Tooltip title="AI Suggest">
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={() => {
                  setSelectedAssignment(record);
                  setAiSuggestionOpen(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const renderInspectorOption = (u: any) => {
    const onLeave = onLeaveUsers.some((ol: any) => ol.id === u.id);
    const isCover = coverUserIds.has(u.id);
    return (
      <Select.Option key={u.id} value={u.id} disabled={onLeave}>
        <span style={{
          color: onLeave ? '#ff4d4f' : isCover ? '#52c41a' : undefined,
          fontWeight: onLeave || isCover ? 600 : undefined,
        }}>
          {u.full_name} ({u.role_id})
          {onLeave && u.leave_cover ? ` — Cover: ${u.leave_cover.full_name}` : ''}
          {onLeave && !u.leave_cover ? ' — On Leave' : ''}
          {isCover && u.covering_for ? ` — Covering ${u.covering_for.full_name}` : ''}
        </span>
      </Select.Option>
    );
  };

  const renderSuggestionCard = (suggestion: InspectorSuggestion | null, type: 'mechanical' | 'electrical') => {
    if (!suggestion) {
      return (
        <Card size="small" style={{ marginBottom: 8 }}>
          <Text type="secondary">No {type} inspector available</Text>
        </Card>
      );
    }

    const scoreColor = suggestion.match_score >= 80 ? 'green' : suggestion.match_score >= 60 ? 'orange' : 'red';

    return (
      <Card
        size="small"
        style={{ marginBottom: 8 }}
        extra={<Tag color={scoreColor}>{suggestion.match_score}% match</Tag>}
      >
        <Space direction="vertical" size={0}>
          <Text strong>{suggestion.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {suggestion.active_assignments} active assignments
          </Text>
          <Space size={4} style={{ marginTop: 4 }}>
            <Tag color={suggestion.factors.workload === 'low' ? 'green' : suggestion.factors.workload === 'medium' ? 'orange' : 'red'}>
              {suggestion.factors.workload} workload
            </Tag>
            <Tag color={suggestion.factors.availability === 'available' ? 'green' : 'orange'}>
              {suggestion.factors.availability}
            </Tag>
          </Space>
        </Space>
      </Card>
    );
  };

  // Stats summary
  const stats: AssignmentStats | undefined = statsData as any;

  // Row selection for bulk actions
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
    getCheckboxProps: (record: any) => ({
      disabled: record.status !== 'unassigned',
    }),
  };

  const unassignedCount = allAssignments.filter((a) => a.status === 'unassigned').length;

  return (
    <div style={{ padding: 0 }}>
      {/* Stats Dashboard */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Today Total"
              value={stats?.today?.total || 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Unassigned"
              value={stats?.today?.unassigned || 0}
              valueStyle={{ color: (stats?.today?.unassigned || 0) > 0 ? '#faad14' : '#52c41a' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Completed"
              value={stats?.today?.completed || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Overdue"
              value={stats?.overdue_count || 0}
              valueStyle={{ color: (stats?.overdue_count || 0) > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Week Completion"
              value={stats?.completion_rate || 0}
              suffix="%"
              prefix={<Progress type="circle" percent={stats?.completion_rate || 0} size={20} showInfo={false} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small" hoverable onClick={() => setWorkloadDrawerOpen(true)}>
            <Statistic
              title="Inspector Workload"
              value={stats?.inspector_workload?.length || 0}
              suffix="active"
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Tab Navigation for Phase 4 Features */}
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
          items={[
            {
              key: 'assignments',
              label: (
                <span>
                  <TableOutlined />
                  {t('assignments.tab_assignments', 'Assignments')}
                </span>
              ),
            },
            {
              key: 'batching',
              label: (
                <span>
                  <ClusterOutlined />
                  {t('assignments.tab_batching', 'Smart Batching')}
                </span>
              ),
            },
            {
              key: 'templates',
              label: (
                <span>
                  <FileOutlined />
                  {t('assignments.tab_templates', 'Templates')}
                </span>
              ),
            },
            {
              key: 'balancer',
              label: (
                <span>
                  <SwapOutlined />
                  {t('assignments.tab_balancer', 'Workload Balancer')}
                </span>
              ),
            },
            {
              key: 'ai',
              label: (
                <span>
                  <RobotOutlined />
                  {t('assignments.tab_ai', 'AI Intelligence')}
                </span>
              ),
            },
            {
              key: 'sla',
              label: (
                <span>
                  <ClockCircleOutlined />
                  {t('assignments.tab_sla', 'SLA Monitor')}
                </span>
              ),
            },
          ]}
        />
      </Card>

      {/* Smart Batching Tab */}
      {activeTab === 'batching' && (
        <SmartBatchView
          selectedAssignments={allAssignments.filter((a) => selectedRowKeys.includes(a.id))}
          onBatchApplied={() => {
            refetch();
            setSelectedRowKeys([]);
          }}
        />
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <TemplateManager
          currentListId={selectedListId || rawLists[0]?.id}
          targetListId={selectedListId || rawLists[0]?.id}
          onTemplateApplied={() => refetch()}
        />
      )}

      {/* Workload Balancer Tab */}
      {activeTab === 'balancer' && (
        <WorkloadBalancer
          listId={selectedListId || rawLists[0]?.id}
          onBalanceApplied={() => refetch()}
        />
      )}

      {/* AI Intelligence Tab */}
      {activeTab === 'ai' && (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <TeamPerformanceDashboard />
          </Col>
          <Col xs={24} lg={12}>
            <InspectorScoreboardCard />
          </Col>
          <Col xs={24} lg={12}>
            <FatigueAlerts />
          </Col>
          <Col span={24}>
            <RouteOptimizer />
          </Col>
        </Row>
      )}

      {/* SLA Monitor Tab */}
      {activeTab === 'sla' && (
        <SLAMonitorView />
      )}

      {/* Main Card - Only show on assignments tab */}
      {activeTab === 'assignments' && (
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              {t('nav.assignments', 'Inspection Assignments')}
            </Title>
            <Tag color="blue">{allAssignments.length} total</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button.Group>
              <Button
                icon={<TableOutlined />}
                type={viewMode === 'table' ? 'primary' : 'default'}
                onClick={() => setViewMode('table')}
              />
              <Button
                icon={<CalendarOutlined />}
                type={viewMode === 'calendar' ? 'primary' : 'default'}
                onClick={() => setViewMode('calendar')}
              />
            </Button.Group>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            <Button
              danger
              onClick={() => {
                Modal.confirm({
                  title: 'Clear All Assignments?',
                  content: 'This will delete ALL inspection assignments from the database. This cannot be undone!',
                  okText: 'Yes, Clear All',
                  okType: 'danger',
                  onOk: () => clearAllMutation.mutate(),
                });
              }}
              loading={clearAllMutation.isPending}
            >
              🗑️ Clear All
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)}>
              {t('assignments.generate', 'Generate List')}
            </Button>
          </Space>
        }
      >
        {/* Filters Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={filters.dateRange}
              onChange={(dates) => setFilters({ ...filters, dateRange: dates as any })}
              placeholder={['From', 'To']}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Shift"
              allowClear
              value={filters.shift}
              onChange={(v) => setFilters({ ...filters, shift: v })}
            >
              <Select.Option value="morning">Morning</Select.Option>
              <Select.Option value="afternoon">Afternoon</Select.Option>
              <Select.Option value="night">Night</Select.Option>
              <Select.Option value="day">Day (Legacy)</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Status"
              allowClear
              value={filters.status}
              onChange={(v) => setFilters({ ...filters, status: v })}
            >
              <Select.Option value="unassigned">Unassigned</Select.Option>
              <Select.Option value="assigned">Assigned</Select.Option>
              <Select.Option value="in_progress">In Progress</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Equipment Type"
              allowClear
              value={filters.equipmentType}
              onChange={(v) => setFilters({ ...filters, equipmentType: v })}
            >
              {equipmentTypes.map((type) => (
                <Select.Option key={type} value={type}>{type}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={6}>
            <Button
              onClick={() => setFilters({ dateRange: null, shift: undefined, status: undefined, equipmentType: undefined })}
            >
              Clear Filters
            </Button>
          </Col>
        </Row>

        {/* Bulk Actions Bar */}
        {selectedRowKeys.length > 0 && (
          <Alert
            type="info"
            style={{ marginBottom: 16 }}
            message={
              <Space>
                <Text strong>{selectedRowKeys.length} assignments selected</Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={bulkAssignMutation.isPending}
                  onClick={() => bulkAssignMutation.mutate(selectedRowKeys)}
                >
                  Auto-Assign All
                </Button>
                <Button size="small" onClick={() => setSelectedRowKeys([])}>
                  Clear Selection
                </Button>
              </Space>
            }
          />
        )}

        {/* Unassigned Alert */}
        {unassignedCount > 0 && (
          <Alert
            type="warning"
            style={{ marginBottom: 16 }}
            message={`${unassignedCount} assignments need team assignment`}
            action={
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  const unassignedIds = allAssignments
                    .filter((a) => a.status === 'unassigned')
                    .map((a) => a.id);
                  setSelectedRowKeys(unassignedIds);
                }}
              >
                Select All Unassigned
              </Button>
            }
          />
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={allAssignments}
            loading={isLoading}
            rowSelection={rowSelection}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1200 }}
            size="small"
            bordered
            locale={{ emptyText: t('common.noData', 'No inspection assignments. Click "Generate List" to create one.') }}
          />
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div>
            {calendarLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" />
              </div>
            ) : (
              <Row gutter={[8, 8]}>
                {calendarData?.days?.map((day: any) => (
                  <Col key={day.date} xs={24} sm={12} md={8} lg={6} xl={3}>
                    <Card
                      size="small"
                      title={
                        <div>
                          <div style={{ fontWeight: 600 }}>{day.day_name}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{dayjs(day.date).format('MMM D')}</div>
                        </div>
                      }
                      extra={<Badge count={day.stats?.total || 0} showZero style={{ backgroundColor: '#1890ff' }} />}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="gold">Day: {day.day?.length || 0}</Tag>
                        <Tag color="geekblue">Night: {day.night?.length || 0}</Tag>
                      </div>
                      <Progress
                        percent={day.stats?.total > 0 ? Math.round((day.stats?.completed || 0) / day.stats.total * 100) : 0}
                        size="small"
                        status={day.stats?.unassigned > 0 ? 'exception' : 'success'}
                      />
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        {day.stats?.unassigned > 0 && (
                          <Text type="warning">{day.stats.unassigned} unassigned</Text>
                        )}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </div>
        )}
      </Card>
      )}

      {/* Generate List Wizard Modal */}
      <GenerateWizardModal
        open={generateOpen}
        onClose={() => { setGenerateOpen(false); generateForm.resetFields(); setSelectedEquipmentIds([]); }}
        form={generateForm}
        selectedEquipmentIds={selectedEquipmentIds}
        onSelectChange={setSelectedEquipmentIds}
        generateMutation={generateMutation}
      />

      {/* Assign Team Modal */}
      <Modal
        title={t('assignments.assignTeam', 'Assign Inspection Team')}
        open={assignOpen}
        onCancel={() => { setAssignOpen(false); setSelectedAssignment(null); assignForm.resetFields(); }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        destroyOnClose
        width={600}
      >
        {selectedAssignment && (
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Equipment" span={2}>
              {selectedAssignment.equipment?.name || `ID: ${selectedAssignment.equipment_id}`}
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              {selectedAssignment.equipment?.equipment_type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Berth">
              {selectedAssignment.berth || selectedAssignment.equipment?.berth || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Shift">
              <Tag color={selectedAssignment.list_shift === 'day' ? 'gold' : 'geekblue'}>
                {selectedAssignment.list_shift?.toUpperCase() || '-'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {selectedAssignment.list_target_date ? dayjs(selectedAssignment.list_target_date).format('DD/MM/YYYY') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
        <Form
          form={assignForm}
          layout="vertical"
          onFinish={(v: AssignTeamPayload) =>
            selectedAssignment && assignMutation.mutate({ id: selectedAssignment.id, payload: v })
          }
        >
          <Form.Item
            name="mechanical_inspector_id"
            label={t('assignments.mechInspector', 'Mechanical Inspector')}
            rules={[{ required: true, message: 'Please select a mechanical inspector' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('assignments.selectInspector', 'Select mechanical inspector')}
            >
              {mechOptions.map(renderInspectorOption)}
            </Select>
          </Form.Item>
          <Form.Item
            name="electrical_inspector_id"
            label={t('assignments.elecInspector', 'Electrical Inspector')}
            rules={[{ required: true, message: 'Please select an electrical inspector' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('assignments.selectInspector', 'Select electrical inspector')}
            >
              {elecOptions.map(renderInspectorOption)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* AI Suggestion Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            AI Smart Assignment
          </Space>
        }
        open={aiSuggestionOpen}
        onCancel={() => { setAiSuggestionOpen(false); setSelectedAssignment(null); }}
        footer={[
          <Button key="cancel" onClick={() => setAiSuggestionOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="apply"
            type="primary"
            icon={<ThunderboltOutlined />}
            disabled={!aiSuggestion?.recommended?.mechanical || !aiSuggestion?.recommended?.electrical}
            onClick={() => {
              if (selectedAssignment && aiSuggestion?.recommended) {
                assignMutation.mutate({
                  id: selectedAssignment.id,
                  payload: {
                    mechanical_inspector_id: aiSuggestion.recommended.mechanical!.id,
                    electrical_inspector_id: aiSuggestion.recommended.electrical!.id,
                  },
                });
              }
            }}
          >
            Apply Recommendation
          </Button>,
        ]}
        destroyOnClose
      >
        {aiSuggestionLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Analyzing workload and availability...</div>
          </div>
        ) : aiSuggestion ? (
          <div>
            <Alert
              type="info"
              message={`Assignment: ${aiSuggestion.assignment?.equipment || 'Unknown'}`}
              description={`${aiSuggestion.context?.date} - ${aiSuggestion.context?.shift} shift`}
              style={{ marginBottom: 16 }}
            />

            <Title level={5}>Recommended Team</Title>
            <Row gutter={16}>
              <Col span={12}>
                <Text type="secondary">Mechanical</Text>
                {renderSuggestionCard(aiSuggestion.recommended?.mechanical || null, 'mechanical')}
              </Col>
              <Col span={12}>
                <Text type="secondary">Electrical</Text>
                {renderSuggestionCard(aiSuggestion.recommended?.electrical || null, 'electrical')}
              </Col>
            </Row>

            <Divider />

            <Title level={5}>Other Options</Title>
            <Tabs
              items={[
                {
                  key: 'mechanical',
                  label: 'Mechanical',
                  children: (
                    <List
                      size="small"
                      dataSource={aiSuggestion.suggestions?.mechanical?.slice(1, 5) || []}
                      renderItem={(item: InspectorSuggestion) => (
                        <List.Item>
                          <Space>
                            <Tag color={item.match_score >= 70 ? 'green' : 'orange'}>{item.match_score}%</Tag>
                            <Text>{item.name}</Text>
                            <Text type="secondary">({item.active_assignments} active)</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ),
                },
                {
                  key: 'electrical',
                  label: 'Electrical',
                  children: (
                    <List
                      size="small"
                      dataSource={aiSuggestion.suggestions?.electrical?.slice(1, 5) || []}
                      renderItem={(item: InspectorSuggestion) => (
                        <List.Item>
                          <Space>
                            <Tag color={item.match_score >= 70 ? 'green' : 'orange'}>{item.match_score}%</Tag>
                            <Text>{item.name}</Text>
                            <Text type="secondary">({item.active_assignments} active)</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <Alert type="error" message="Failed to get AI suggestions" />
        )}
      </Modal>

      {/* Workload Drawer */}
      <Drawer
        title="Inspector Workload"
        open={workloadDrawerOpen}
        onClose={() => setWorkloadDrawerOpen(false)}
        width={400}
      >
        {statsLoading ? (
          <Spin />
        ) : (
          <List
            dataSource={stats?.inspector_workload || []}
            renderItem={(item: any) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<UserOutlined style={{ fontSize: 24 }} />}
                  title={item.name}
                  description={`${item.active_assignments} active assignments`}
                />
                <Progress
                  type="circle"
                  percent={Math.min(100, item.active_assignments * 20)}
                  size={40}
                  status={item.active_assignments > 4 ? 'exception' : 'normal'}
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
}
