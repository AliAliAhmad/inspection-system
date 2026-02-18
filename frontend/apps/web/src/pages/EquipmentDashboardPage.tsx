import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Tooltip,
  Checkbox,
  Slider,
  Collapse,
  Badge,
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  CloseCircleOutlined,
  FilterOutlined,
  SaveOutlined,
  ReloadOutlined,
  WarningOutlined,
  CalendarOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi, RiskLevel } from '@inspection/shared';
import { useAuth } from '../providers/AuthProvider';
import {
  EquipmentKPICard,
  EquipmentAlertsDrawer,
  EquipmentTrendChart,
  EquipmentQuickActions,
  EquipmentBulkActionsBar,
  HealthScoreTag,
  EquipmentAnomaliesPanel,
  NaturalLanguageSearch,
  ServiceAlertNotification,
} from '../components/equipment';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

interface EquipmentCard {
  id: number;
  name: string;
  name_ar: string | null;
  status: string;
  status_color: 'green' | 'yellow' | 'red';
  days_stopped: number | null;
  health_score?: number;
  last_inspection_date?: string;
  next_maintenance_date?: string;
  has_anomaly?: boolean;
  risk_level?: RiskLevel;
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

interface FilterState {
  status_color?: string;
  berth?: string;
  risk_level?: RiskLevel;
  days_stopped_min?: number;
  days_stopped_max?: number;
  last_inspection?: 'today' | 'week' | 'month' | 'overdue';
  search?: string;
}

interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
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

const riskLevelColors: Record<RiskLevel, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#fa8c16',
  critical: '#ff4d4f',
};

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default function EquipmentDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filters state
  const [filters, setFilters] = useState<FilterState>({});
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    const saved = localStorage.getItem('equipment-filter-presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Selection state
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // UI state
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAISearch, setShowAISearch] = useState(false);

  const [form] = Form.useForm();

  const canEdit = user?.role === 'admin' || user?.role === 'engineer';

  // Update search in filters when debounced value changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, search: debouncedSearch || undefined }));
  }, [debouncedSearch]);

  // Save filter presets to localStorage
  useEffect(() => {
    localStorage.setItem('equipment-filter-presets', JSON.stringify(filterPresets));
  }, [filterPresets]);

  // Fetch KPIs
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['equipment-kpis'],
    queryFn: async () => {
      const res = await equipmentApi.getKPIs();
      return res.data?.data;
    },
  });

  // Fetch dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['equipment-dashboard', filters.status_color, filters.berth],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.status_color) params.status_color = filters.status_color;
      if (filters.berth) params.berth = filters.berth;
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
      queryClient.invalidateQueries({ queryKey: ['equipment-kpis'] });
      setEditMode(false);
      form.resetFields();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || t('common.error', 'Error');
      message.error(msg);
    },
  });

  // Filter equipment based on search and advanced filters
  const filteredGroups = useMemo(() => {
    if (!dashboardData?.groups) return [];

    return dashboardData.groups
      .map((group) => ({
        ...group,
        equipment: group.equipment.filter((eq) => {
          // Search filter
          if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const matchesSearch =
              eq.name.toLowerCase().includes(searchLower) ||
              (eq.name_ar && eq.name_ar.includes(filters.search));
            if (!matchesSearch) return false;
          }

          // Risk level filter
          if (filters.risk_level && eq.risk_level !== filters.risk_level) {
            return false;
          }

          // Days stopped range filter
          if (filters.days_stopped_min !== undefined || filters.days_stopped_max !== undefined) {
            const days = eq.days_stopped ?? 0;
            if (filters.days_stopped_min !== undefined && days < filters.days_stopped_min) {
              return false;
            }
            if (filters.days_stopped_max !== undefined && days > filters.days_stopped_max) {
              return false;
            }
          }

          // Last inspection filter
          if (filters.last_inspection && eq.last_inspection_date) {
            const lastInspection = new Date(eq.last_inspection_date);
            const now = new Date();
            const daysDiff = Math.floor((now.getTime() - lastInspection.getTime()) / (1000 * 60 * 60 * 24));

            switch (filters.last_inspection) {
              case 'today':
                if (daysDiff > 0) return false;
                break;
              case 'week':
                if (daysDiff > 7) return false;
                break;
              case 'month':
                if (daysDiff > 30) return false;
                break;
              case 'overdue':
                if (daysDiff <= 30) return false;
                break;
            }
          }

          return true;
        }),
      }))
      .filter((group) => group.equipment.length > 0);
  }, [dashboardData?.groups, filters]);

  const handleCardClick = (equipmentId: number) => {
    setSelectedEquipmentId(equipmentId);
    setDetailModalOpen(true);
    setEditMode(false);
  };

  const handleCardSelect = (equipmentId: number, selected: boolean) => {
    if (selected) {
      setSelectedEquipmentIds((prev) => [...prev, equipmentId]);
    } else {
      setSelectedEquipmentIds((prev) => prev.filter((id) => id !== equipmentId));
    }
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

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      message.warning(t('equipment.presetNameRequired', 'Please enter a preset name'));
      return;
    }
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
    };
    setFilterPresets((prev) => [...prev, newPreset]);
    setSavePresetModalOpen(false);
    setPresetName('');
    message.success(t('equipment.presetSaved', 'Filter preset saved'));
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setFilters(preset.filters);
    setSearchInput(preset.filters.search || '');
    message.success(t('equipment.presetLoaded', 'Filter preset loaded'));
  };

  const handleDeletePreset = (presetId: string) => {
    setFilterPresets((prev) => prev.filter((p) => p.id !== presetId));
    message.success(t('equipment.presetDeleted', 'Filter preset deleted'));
  };

  const clearAllFilters = () => {
    setFilters({});
    setSearchInput('');
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

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

  const getCardStyle = (color: string, hasAnomaly?: boolean) => {
    const styles: Record<string, React.CSSProperties> = {
      green: { borderLeft: '4px solid #52c41a', background: '#f6ffed' },
      yellow: { borderLeft: '4px solid #faad14', background: '#fffbe6' },
      red: { borderLeft: '4px solid #ff4d4f', background: '#fff2f0' },
    };
    const baseStyle = styles[color] || {};
    if (hasAnomaly) {
      return {
        ...baseStyle,
        boxShadow: '0 0 0 2px #ff4d4f40',
        animation: 'pulse 2s infinite',
      };
    }
    return baseStyle;
  };

  const formatDaysSince = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return t('equipment.today', 'Today');
    if (days === 1) return t('equipment.yesterday', 'Yesterday');
    return `${days} ${t('equipment.daysAgo', 'days ago')}`;
  };

  const formatDaysUntil = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const days = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <Text type="danger">{t('equipment.overdue', 'Overdue')}</Text>;
    if (days === 0) return <Text type="warning">{t('equipment.today', 'Today')}</Text>;
    if (days === 1) return t('equipment.tomorrow', 'Tomorrow');
    return `${days} ${t('equipment.daysRemaining', 'days')}`;
  };

  if (dashboardLoading && !dashboardData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const summary = dashboardData?.summary || { green: 0, yellow: 0, red: 0 };

  return (
    <div style={{ padding: 24 }}>
      {/* Service Alerts */}
      <div style={{ marginBottom: 16 }}>
        <ServiceAlertNotification limit={3} onViewAll={() => {}} />
      </div>

      {/* Header with Search */}
      <Row gutter={16} align="middle" style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Title level={3} style={{ margin: 0 }}>
            {t('equipment.dashboard', 'Equipment Dashboard')}
          </Title>
        </Col>
        <Col>
          <Tooltip title={t('equipment.aiSearch', 'AI-Powered Natural Language Search')}>
            <Button
              icon={<RobotOutlined />}
              type={showAISearch ? 'primary' : 'default'}
              onClick={() => setShowAISearch(!showAISearch)}
            >
              {t('equipment.aiSearch', 'AI Search')}
            </Button>
          </Tooltip>
        </Col>
        <Col flex="400px">
          <Input
            placeholder={t('equipment.searchPlaceholder', 'Search by name, serial, type, location...')}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            suffix={
              searchInput ? (
                <CloseCircleOutlined
                  style={{ color: '#bfbfbf', cursor: 'pointer' }}
                  onClick={() => setSearchInput('')}
                />
              ) : null
            }
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            allowClear={false}
            size="large"
          />
        </Col>
      </Row>

      {/* AI Natural Language Search Panel */}
      {showAISearch && (
        <div style={{ marginBottom: 24 }}>
          <NaturalLanguageSearch
            onSelect={(equipment) => {
              handleCardClick(equipment.id);
              setShowAISearch(false);
            }}
            showResults
          />
        </div>
      )}

      {/* KPI Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <EquipmentKPICard
            title={t('equipment.uptime', 'Uptime')}
            value={kpis?.uptime_percentage?.toFixed(1) || '0'}
            suffix="%"
            icon="uptime"
            color="green"
            trend={kpis?.uptime_trend ? `${kpis.uptime_trend > 0 ? '+' : ''}${kpis.uptime_trend.toFixed(1)}%` : undefined}
            trendDirection={kpis?.uptime_trend && kpis.uptime_trend > 0 ? 'up' : kpis?.uptime_trend && kpis.uptime_trend < 0 ? 'down' : undefined}
            loading={kpisLoading}
            tooltip={t('equipment.uptimeTooltip', 'Percentage of equipment currently active')}
          />
        </Col>
        <Col xs={12} sm={6}>
          <EquipmentKPICard
            title={t('equipment.avgDowntime', 'Avg Downtime')}
            value={kpis?.avg_downtime_hours?.toFixed(1) || '0'}
            suffix="h"
            icon="downtime"
            color="blue"
            loading={kpisLoading}
            tooltip={t('equipment.downtimeTooltip', 'Average downtime hours for stopped equipment')}
          />
        </Col>
        <Col xs={12} sm={6}>
          <EquipmentKPICard
            title={t('equipment.atRisk', 'At Risk')}
            value={kpis?.at_risk_count || 0}
            icon="risk"
            color="orange"
            loading={kpisLoading}
            tooltip={t('equipment.atRiskTooltip', 'Equipment with high risk scores')}
          />
        </Col>
        <Col xs={12} sm={6}>
          <EquipmentKPICard
            title={t('equipment.alerts', 'Alerts')}
            value={kpis?.active_alerts_count || 0}
            icon="alerts"
            color="red"
            loading={kpisLoading}
            onClick={() => setAlertsDrawerOpen(true)}
            tooltip={t('equipment.alertsTooltip', 'Click to view active alerts')}
          />
        </Col>
      </Row>

      {/* Status Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={8}>
          <Card
            hoverable
            onClick={() => setFilters((prev) => ({ ...prev, status_color: prev.status_color === 'green' ? undefined : 'green' }))}
            style={{
              background: filters.status_color === 'green' ? '#52c41a' : '#f6ffed',
              cursor: 'pointer',
            }}
          >
            <Statistic
              title={<span style={{ color: filters.status_color === 'green' ? '#fff' : '#52c41a' }}>{t('equipment.active', 'Active')}</span>}
              value={summary.green}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: filters.status_color === 'green' ? '#fff' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card
            hoverable
            onClick={() => setFilters((prev) => ({ ...prev, status_color: prev.status_color === 'yellow' ? undefined : 'yellow' }))}
            style={{
              background: filters.status_color === 'yellow' ? '#faad14' : '#fffbe6',
              cursor: 'pointer',
            }}
          >
            <Statistic
              title={<span style={{ color: filters.status_color === 'yellow' ? '#fff' : '#faad14' }}>{t('equipment.maintenance', 'Maintenance')}</span>}
              value={summary.yellow}
              prefix={<ToolOutlined />}
              valueStyle={{ color: filters.status_color === 'yellow' ? '#fff' : '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card
            hoverable
            onClick={() => setFilters((prev) => ({ ...prev, status_color: prev.status_color === 'red' ? undefined : 'red' }))}
            style={{
              background: filters.status_color === 'red' ? '#ff4d4f' : '#fff2f0',
              cursor: 'pointer',
            }}
          >
            <Statistic
              title={<span style={{ color: filters.status_color === 'red' ? '#fff' : '#ff4d4f' }}>{t('equipment.stopped', 'Stopped')}</span>}
              value={summary.red}
              prefix={<StopOutlined />}
              valueStyle={{ color: filters.status_color === 'red' ? '#fff' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Trend Chart */}
      <EquipmentTrendChart defaultPeriod="7d" collapsible defaultCollapsed={false} />

      {/* AI Anomaly Detection Panel */}
      <EquipmentAnomaliesPanel
        collapsible
        defaultCollapsed={false}
        onViewEquipment={(equipmentId) => handleCardClick(equipmentId)}
      />

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select
              placeholder={t('equipment.filterByBerth', 'Filter by Berth')}
              allowClear
              style={{ width: 150 }}
              value={filters.berth}
              onChange={(v) => setFilters((prev) => ({ ...prev, berth: v }))}
            >
              <Select.Option value="east">{t('equipment.east', 'East')}</Select.Option>
              <Select.Option value="west">{t('equipment.west', 'West')}</Select.Option>
              <Select.Option value="both">{t('equipment.both', 'Both')}</Select.Option>
            </Select>
          </Col>
          <Col>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              type={showAdvancedFilters ? 'primary' : 'default'}
            >
              {t('equipment.advancedFilters', 'Advanced Filters')}
            </Button>
          </Col>
          {hasActiveFilters && (
            <Col>
              <Button icon={<ReloadOutlined />} onClick={clearAllFilters}>
                {t('common.clearFilters', 'Clear Filters')}
              </Button>
            </Col>
          )}
          <Col flex="auto" />
          <Col>
            <Space>
              {filterPresets.length > 0 && (
                <Select
                  placeholder={t('equipment.loadPreset', 'Load Preset')}
                  style={{ width: 150 }}
                  allowClear
                  onSelect={(value) => {
                    const preset = filterPresets.find((p) => p.id === value);
                    if (preset) handleLoadPreset(preset);
                  }}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      {filterPresets.map((preset) => (
                        <div key={preset.id} style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between' }}>
                          <Text ellipsis style={{ maxWidth: 100 }}>{preset.name}</Text>
                          <Button
                            type="text"
                            danger
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(preset.id);
                            }}
                          >
                            {t('common.delete', 'Delete')}
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                >
                  {filterPresets.map((preset) => (
                    <Select.Option key={preset.id} value={preset.id}>
                      {preset.name}
                    </Select.Option>
                  ))}
                </Select>
              )}
              {hasActiveFilters && (
                <Button icon={<SaveOutlined />} onClick={() => setSavePresetModalOpen(true)}>
                  {t('equipment.savePreset', 'Save Preset')}
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Row gutter={24}>
              <Col xs={24} sm={8}>
                <Text type="secondary">{t('equipment.riskLevel', 'Risk Level')}</Text>
                <Select
                  placeholder={t('equipment.selectRiskLevel', 'Select Risk Level')}
                  allowClear
                  style={{ width: '100%', marginTop: 8 }}
                  value={filters.risk_level}
                  onChange={(v) => setFilters((prev) => ({ ...prev, risk_level: v }))}
                >
                  <Select.Option value="low">
                    <Tag color="green">{t('equipment.low', 'Low')}</Tag>
                  </Select.Option>
                  <Select.Option value="medium">
                    <Tag color="gold">{t('equipment.medium', 'Medium')}</Tag>
                  </Select.Option>
                  <Select.Option value="high">
                    <Tag color="orange">{t('equipment.high', 'High')}</Tag>
                  </Select.Option>
                  <Select.Option value="critical">
                    <Tag color="red">{t('equipment.critical', 'Critical')}</Tag>
                  </Select.Option>
                </Select>
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary">{t('equipment.daysStopped', 'Days Stopped Range')}</Text>
                <Slider
                  range
                  min={0}
                  max={90}
                  defaultValue={[0, 90]}
                  value={[filters.days_stopped_min ?? 0, filters.days_stopped_max ?? 90]}
                  onChange={([min, max]) =>
                    setFilters((prev) => ({
                      ...prev,
                      days_stopped_min: min === 0 ? undefined : min,
                      days_stopped_max: max === 90 ? undefined : max,
                    }))
                  }
                  marks={{ 0: '0', 30: '30', 60: '60', 90: '90+' }}
                  style={{ marginTop: 8 }}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary">{t('equipment.lastInspection', 'Last Inspection')}</Text>
                <Select
                  placeholder={t('equipment.selectPeriod', 'Select Period')}
                  allowClear
                  style={{ width: '100%', marginTop: 8 }}
                  value={filters.last_inspection}
                  onChange={(v) => setFilters((prev) => ({ ...prev, last_inspection: v }))}
                >
                  <Select.Option value="today">{t('equipment.inspectedToday', 'Inspected Today')}</Select.Option>
                  <Select.Option value="week">{t('equipment.thisWeek', 'This Week')}</Select.Option>
                  <Select.Option value="month">{t('equipment.thisMonth', 'This Month')}</Select.Option>
                  <Select.Option value="overdue">
                    <Text type="danger">{t('equipment.overdueInspection', 'Overdue (>30 days)')}</Text>
                  </Select.Option>
                </Select>
              </Col>
            </Row>
          </div>
        )}
      </Card>

      {/* Equipment Groups */}
      {filteredGroups.length === 0 ? (
        <Empty description={t('equipment.noEquipment', 'No equipment found')} />
      ) : (
        filteredGroups.map((group, idx) => (
          <Card
            key={idx}
            title={`${group.equipment_type} - ${group.berth ? group.berth.charAt(0).toUpperCase() + group.berth.slice(1) : 'Unassigned'}`}
            style={{ marginBottom: 16 }}
            size="small"
          >
            <Row gutter={[12, 12]}>
              {group.equipment.map((eq) => {
                const isSelected = selectedEquipmentIds.includes(eq.id);
                return (
                  <Col key={eq.id} xs={12} sm={8} md={6} lg={4}>
                    <Card
                      hoverable
                      size="small"
                      style={{
                        ...getCardStyle(eq.status_color, eq.has_anomaly),
                        textAlign: 'center',
                        border: isSelected ? '2px solid #1890ff' : undefined,
                      }}
                      onClick={() => handleCardClick(eq.id)}
                    >
                      {/* Selection checkbox */}
                      <div
                        style={{ position: 'absolute', top: 4, left: 4 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => handleCardSelect(eq.id, e.target.checked)}
                        />
                      </div>

                      {/* Anomaly indicator */}
                      {eq.has_anomaly && (
                        <Tooltip title={t('equipment.anomalyDetected', 'Anomaly Detected')}>
                          <WarningOutlined
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              color: '#ff4d4f',
                              fontSize: 16,
                            }}
                          />
                        </Tooltip>
                      )}

                      {/* Status icon */}
                      {getStatusIcon(eq.status_color)}

                      {/* Equipment name */}
                      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 13 }}>{eq.name}</div>

                      {/* Health score badge */}
                      {eq.health_score !== undefined && (
                        <div style={{ marginTop: 4 }}>
                          <HealthScoreTag score={eq.health_score} />
                        </div>
                      )}

                      {/* Risk level */}
                      {eq.risk_level && (
                        <Tag
                          color={riskLevelColors[eq.risk_level]}
                          style={{ marginTop: 4, fontSize: 10 }}
                        >
                          {eq.risk_level.toUpperCase()}
                        </Tag>
                      )}

                      {/* Days stopped */}
                      {eq.days_stopped !== null && eq.days_stopped > 0 && (
                        <Tag color="red" style={{ marginTop: 4 }}>
                          <ClockCircleOutlined /> {eq.days_stopped} {t('equipment.days', 'days')}
                        </Tag>
                      )}

                      {/* Last inspection */}
                      {eq.last_inspection_date && (
                        <div style={{ marginTop: 4, fontSize: 10, color: '#8c8c8c' }}>
                          <CalendarOutlined /> {formatDaysSince(eq.last_inspection_date)}
                        </div>
                      )}

                      {/* Next maintenance */}
                      {eq.next_maintenance_date && (
                        <div style={{ marginTop: 2, fontSize: 10, color: '#8c8c8c' }}>
                          <ToolOutlined /> {formatDaysUntil(eq.next_maintenance_date)}
                        </div>
                      )}

                      {/* Quick actions */}
                      <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                        <EquipmentQuickActions
                          equipmentId={eq.id}
                          equipmentName={eq.name}
                          currentStatus={eq.status}
                          compact
                          onViewDetails={() => handleCardClick(eq.id)}
                          onInspect={() => {
                            message.info(t('equipment.startInspection', 'Starting inspection...'));
                            // Navigate to inspection page
                          }}
                        />
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </Card>
        ))
      )}

      {/* Bulk Actions Bar */}
      <EquipmentBulkActionsBar
        selectedIds={selectedEquipmentIds}
        onClear={() => setSelectedEquipmentIds([])}
      />

      {/* Alerts Drawer */}
      <EquipmentAlertsDrawer
        open={alertsDrawerOpen}
        onClose={() => setAlertsDrawerOpen(false)}
        onViewEquipment={(equipmentId) => {
          setAlertsDrawerOpen(false);
          handleCardClick(equipmentId);
        }}
      />

      {/* Save Preset Modal */}
      <Modal
        title={t('equipment.saveFilterPreset', 'Save Filter Preset')}
        open={savePresetModalOpen}
        onCancel={() => {
          setSavePresetModalOpen(false);
          setPresetName('');
        }}
        onOk={handleSavePreset}
        okText={t('common.save', 'Save')}
      >
        <Input
          placeholder={t('equipment.presetNamePlaceholder', 'Enter preset name...')}
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          style={{ marginTop: 16 }}
        />
      </Modal>

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

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 2px #ff4d4f40; }
          50% { box-shadow: 0 0 0 4px #ff4d4f20; }
          100% { box-shadow: 0 0 0 2px #ff4d4f40; }
        }
      `}</style>
    </div>
  );
}
