import { useState, useMemo } from 'react';
import {
  Card,
  Typography,
  Tag,
  Space,
  Button,
  Alert,
  Spin,
  List,
  Badge,
  Collapse,
  Tooltip,
  Progress,
  message,
} from 'antd';
import {
  ClusterOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  inspectionAssignmentsApi,
  SmartBatch,
  SmartBatchResponse,
  InspectionAssignment,
} from '@inspection/shared';

const { Text, Title } = Typography;

interface SmartBatchViewProps {
  selectedAssignments: InspectionAssignment[];
  onBatchApplied?: () => void;
}

export function SmartBatchView({ selectedAssignments, onBatchApplied }: SmartBatchViewProps) {
  const { t } = useTranslation();
  const [batchResult, setBatchResult] = useState<SmartBatchResponse | null>(null);

  const batchMutation = useMutation({
    mutationFn: (ids: number[]) => inspectionAssignmentsApi.smartBatch(ids),
    onSuccess: (res) => {
      if (res.data?.data) {
        setBatchResult(res.data.data);
      }
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const handleAnalyze = () => {
    const ids = selectedAssignments.map((a) => a.id);
    batchMutation.mutate(ids);
  };

  const getEfficiencyColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  if (selectedAssignments.length === 0) {
    return (
      <Alert
        type="info"
        message={t('assignments.select_to_batch', 'Select Assignments')}
        description={t('assignments.batch_description', 'Select multiple assignments to analyze and group them by location for efficient inspections.')}
        showIcon
        icon={<ClusterOutlined />}
      />
    );
  }

  return (
    <Card
      title={
        <Space>
          <ClusterOutlined />
          {t('assignments.smart_batching', 'Smart Batching')}
          <Tag color="blue">{selectedAssignments.length} selected</Tag>
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={handleAnalyze}
          loading={batchMutation.isPending}
        >
          {t('assignments.analyze_batches', 'Analyze Batches')}
        </Button>
      }
    >
      {batchMutation.isPending && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
            {t('assignments.analyzing', 'Analyzing locations...')}
          </Text>
        </div>
      )}

      {batchResult && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Summary */}
          <Alert
            type="success"
            message={batchResult.recommendation}
            icon={<CheckOutlined />}
            showIcon
          />

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Card size="small">
              <Statistic
                title={t('assignments.total_batches', 'Batches')}
                value={batchResult.total_batches}
                prefix={<ClusterOutlined />}
              />
            </Card>
            <Card size="small">
              <Statistic
                title={t('assignments.time_saved', 'Time Saved')}
                value={batchResult.total_time_savings_min}
                suffix="min"
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </div>

          {/* Batch List */}
          <Collapse
            items={batchResult.batches.map((batch) => ({
              key: batch.batch_id,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <EnvironmentOutlined />
                    <Text strong>{batch.location}</Text>
                    {batch.berth && <Tag>{batch.berth}</Tag>}
                  </Space>
                  <Space>
                    <Badge count={batch.count} style={{ backgroundColor: '#1890ff' }} />
                    <Tooltip title={`Efficiency: ${batch.efficiency_score}%`}>
                      <Progress
                        type="circle"
                        percent={batch.efficiency_score}
                        width={32}
                        strokeColor={getEfficiencyColor(batch.efficiency_score)}
                        format={(p) => `${p}`}
                      />
                    </Tooltip>
                    {batch.estimated_time_savings_min > 0 && (
                      <Tag color="green">-{batch.estimated_time_savings_min}min</Tag>
                    )}
                  </Space>
                </div>
              ),
              children: (
                <List
                  size="small"
                  dataSource={batch.assignments}
                  renderItem={(assignment: InspectionAssignment, index: number) => (
                    <List.Item>
                      <Space>
                        <Tag color="blue">{index + 1}</Tag>
                        <Text>{assignment.equipment?.name || `#${assignment.equipment_id}`}</Text>
                        {assignment.equipment?.equipment_type && (
                          <Text type="secondary">({assignment.equipment.equipment_type})</Text>
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
              ),
            }))}
          />
        </Space>
      )}
    </Card>
  );
}

// Helper component for statistics
function Statistic({ title, value, prefix, suffix }: {
  title: string;
  value: number | string;
  prefix?: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      <div style={{ fontSize: 24, fontWeight: 600 }}>
        {prefix && <span style={{ marginRight: 4 }}>{prefix}</span>}
        {value}
        {suffix && <span style={{ fontSize: 14, marginLeft: 4 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default SmartBatchView;
