import { useState } from 'react';
import {
  Card,
  Typography,
  Tag,
  Space,
  Button,
  Alert,
  Spin,
  List,
  Progress,
  message,
  Modal,
  Tooltip,
  Row,
  Col,
  Switch,
} from 'antd';
import {
  SwapOutlined,
  UserOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  CheckOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  inspectionAssignmentsApi,
  WorkloadPreviewResult,
  WorkloadBalanceResult,
  WorkloadDistribution,
} from '@inspection/shared';

const { Text, Title } = Typography;

interface WorkloadBalancerProps {
  listId?: number;
  onBalanceApplied?: () => void;
}

export function WorkloadBalancer({ listId, onBalanceApplied }: WorkloadBalancerProps) {
  const { t } = useTranslation();
  const [previewData, setPreviewData] = useState<WorkloadPreviewResult | null>(null);
  const [balanceResult, setBalanceResult] = useState<WorkloadBalanceResult | null>(null);
  const [includeRoster, setIncludeRoster] = useState(true);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (id: number) => inspectionAssignmentsApi.previewWorkloadBalance(id),
    onSuccess: (res) => {
      if (res.data?.data) {
        setPreviewData(res.data.data);
        setBalanceResult(null);
      }
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Balance mutation
  const balanceMutation = useMutation({
    mutationFn: (id: number) => inspectionAssignmentsApi.balanceWorkload(id, includeRoster),
    onSuccess: (res) => {
      if (res.data?.data) {
        setBalanceResult(res.data.data);
        setPreviewData(null);
        setConfirmModalOpen(false);
        message.success(
          t('workload.balance_success', `Balanced ${res.data.data.assigned_count} assignments`)
        );
        onBalanceApplied?.();
      }
    },
    onError: () => {
      message.error(t('common.error'));
      setConfirmModalOpen(false);
    },
  });

  const handlePreview = () => {
    if (listId) {
      previewMutation.mutate(listId);
    }
  };

  const handleBalance = () => {
    if (listId) {
      setConfirmModalOpen(true);
    }
  };

  const confirmBalance = () => {
    if (listId) {
      balanceMutation.mutate(listId);
    }
  };

  const getWorkloadColor = (count: number, max: number) => {
    const ratio = count / max;
    if (ratio < 0.5) return '#52c41a';
    if (ratio < 0.8) return '#faad14';
    return '#ff4d4f';
  };

  const getBalanceScore = (distribution: WorkloadDistribution[]) => {
    if (distribution.length < 2) return 100;
    const counts = distribution.map((d) => d.assigned_count || d.current_assignments || 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === 0) return 100;
    return Math.round((1 - (max - min) / max) * 100);
  };

  if (!listId) {
    return (
      <Alert
        type="info"
        message={t('workload.select_list', 'Select a List')}
        description={t('workload.select_list_desc', 'Select an inspection list to balance workload across inspectors.')}
        showIcon
        icon={<SwapOutlined />}
      />
    );
  }

  return (
    <Card
      title={
        <Space>
          <SwapOutlined />
          {t('workload.title', 'Workload Balancer')}
        </Space>
      }
      extra={
        <Space>
          <Tooltip title={t('workload.include_roster_tip', 'Consider roster availability when balancing')}>
            <Switch
              checked={includeRoster}
              onChange={setIncludeRoster}
              checkedChildren="Roster"
              unCheckedChildren="All"
            />
          </Tooltip>
          <Button icon={<EyeOutlined />} onClick={handlePreview} loading={previewMutation.isPending}>
            {t('workload.preview', 'Preview')}
          </Button>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleBalance}
            loading={balanceMutation.isPending}
          >
            {t('workload.balance_now', 'Balance Now')}
          </Button>
        </Space>
      }
    >
      {(previewMutation.isPending || balanceMutation.isPending) && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
            {previewMutation.isPending
              ? t('workload.calculating', 'Calculating optimal distribution...')
              : t('workload.applying', 'Applying workload balance...')}
          </Text>
        </div>
      )}

      {/* Preview Results */}
      {previewData && !previewMutation.isPending && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            type="info"
            message={t('workload.preview_summary', 'Preview: Distribution Analysis')}
            description={
              <Space>
                <Tag color="orange">{previewData.unassigned_count} unassigned</Tag>
                <Tag color="blue">{previewData.available_inspectors} inspectors available</Tag>
              </Space>
            }
            showIcon
            icon={<EyeOutlined />}
          />

          <Row gutter={16}>
            <Col span={12}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary">{t('workload.balance_score', 'Balance Score')}</Text>
                  <Progress
                    type="circle"
                    percent={getBalanceScore(previewData.preview)}
                    size={80}
                    strokeColor={{
                      '0%': '#ff4d4f',
                      '50%': '#faad14',
                      '100%': '#52c41a',
                    }}
                    format={(p) => `${p}%`}
                  />
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary">{t('workload.avg_per_inspector', 'Avg per Inspector')}</Text>
                  <Title level={2} style={{ margin: '8px 0' }}>
                    {previewData.available_inspectors > 0
                      ? Math.round(previewData.unassigned_count / previewData.available_inspectors)
                      : 0}
                  </Title>
                </div>
              </Card>
            </Col>
          </Row>

          <List
            header={<Text strong>{t('workload.distribution_preview', 'Projected Distribution')}</Text>}
            dataSource={previewData.preview}
            renderItem={(item: WorkloadDistribution) => {
              const maxAssignments = Math.max(
                ...previewData.preview.map((d) => d.estimated_after_balance || 0)
              );
              return (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: '#f0f5ff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <UserOutlined style={{ fontSize: 18, color: '#1890ff' }} />
                      </div>
                    }
                    title={item.name}
                    description={
                      <Space>
                        {item.specialization && <Tag>{item.specialization}</Tag>}
                        <Text type="secondary">
                          Current: {item.current_assignments || 0}
                        </Text>
                      </Space>
                    }
                  />
                  <Space direction="vertical" align="end" size={0}>
                    <Text strong style={{ color: '#1890ff' }}>
                      +{(item.estimated_after_balance || 0) - (item.current_assignments || 0)} new
                    </Text>
                    <Progress
                      percent={Math.round(
                        ((item.estimated_after_balance || 0) / maxAssignments) * 100
                      )}
                      size="small"
                      style={{ width: 100 }}
                      strokeColor={getWorkloadColor(
                        item.estimated_after_balance || 0,
                        maxAssignments
                      )}
                      showInfo={false}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      After: {item.estimated_after_balance || 0} total
                    </Text>
                  </Space>
                </List.Item>
              );
            }}
          />
        </Space>
      )}

      {/* Balance Results */}
      {balanceResult && !balanceMutation.isPending && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            type="success"
            message={t('workload.balance_complete', 'Workload Balanced Successfully')}
            description={`${balanceResult.assigned_count} assignments have been distributed across inspectors.`}
            showIcon
            icon={<CheckOutlined />}
          />

          <List
            header={<Text strong>{t('workload.final_distribution', 'Final Distribution')}</Text>}
            dataSource={balanceResult.distribution}
            renderItem={(item: WorkloadDistribution) => {
              const maxAssignments = Math.max(
                ...balanceResult.distribution.map((d) => d.assigned_count || 0)
              );
              return (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: '#f6ffed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CheckOutlined style={{ fontSize: 18, color: '#52c41a' }} />
                      </div>
                    }
                    title={item.name}
                    description={item.specialization && <Tag>{item.specialization}</Tag>}
                  />
                  <Space direction="vertical" align="end" size={0}>
                    <Text strong>{item.assigned_count || 0} assigned</Text>
                    <Progress
                      percent={Math.round(((item.assigned_count || 0) / maxAssignments) * 100)}
                      size="small"
                      style={{ width: 100 }}
                      strokeColor="#52c41a"
                      showInfo={false}
                    />
                  </Space>
                </List.Item>
              );
            }}
          />
        </Space>
      )}

      {/* Empty State */}
      {!previewData && !balanceResult && !previewMutation.isPending && !balanceMutation.isPending && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <SwapOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
          <Title level={5} type="secondary">
            {t('workload.ready', 'Ready to Balance')}
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('workload.ready_desc', 'Click Preview to see the distribution or Balance Now to auto-assign.')}
          </Text>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            {t('workload.confirm_title', 'Confirm Workload Balance')}
          </Space>
        }
        open={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        onOk={confirmBalance}
        confirmLoading={balanceMutation.isPending}
        okText={t('workload.apply_balance', 'Apply Balance')}
      >
        <Alert
          type="warning"
          message={t('workload.confirm_message', 'This will automatically assign unassigned inspections to available inspectors.')}
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical">
          <Text>
            <CheckOutlined style={{ color: '#52c41a', marginRight: 8 }} />
            {t('workload.will_balance', 'Assignments will be distributed evenly')}
          </Text>
          <Text>
            <CheckOutlined style={{ color: '#52c41a', marginRight: 8 }} />
            {includeRoster
              ? t('workload.will_check_roster', 'Roster availability will be considered')
              : t('workload.all_inspectors', 'All inspectors will be included')}
          </Text>
          <Text>
            <CheckOutlined style={{ color: '#52c41a', marginRight: 8 }} />
            {t('workload.current_assignments', 'Current workload will be factored in')}
          </Text>
        </Space>
      </Modal>
    </Card>
  );
}

export default WorkloadBalancer;
