import { useState, useEffect, useCallback } from 'react';
import { Card, Typography, Tag, Space, Spin, Alert, Progress, Tooltip, Button, Collapse } from 'antd';
import {
  RobotOutlined,
  ToolOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export type PredictionEntityType = 'specialist_job' | 'engineer_job' | 'defect' | string;

export interface PartPrediction {
  part_name: string;
  part_code?: string;
  frequency_percent: number;
  confidence: 'high' | 'medium' | 'low';
  used_in_jobs: number;
  quantity_avg?: number;
}

export interface PredictionBasedOn {
  sample_size: number;
  category?: string;
  equipment_type?: string;
}

export interface PartsPredictionResponse {
  predictions: PartPrediction[];
  based_on: PredictionBasedOn;
  note: string;
}

export interface PartsPredictionProps {
  entityId?: number;
  entityType?: PredictionEntityType;
  defectId?: number;
  compact?: boolean;
  fetchPredictions?: (entityId?: number, defectId?: number) => Promise<PartsPredictionResponse | null>;
  onPartSelect?: (part: PartPrediction) => void;
}

const CONFIDENCE_COLORS = {
  high: '#52c41a',
  medium: '#faad14',
  low: '#d9d9d9',
};

export function PartsPrediction({
  entityId,
  entityType = 'specialist_job',
  defectId,
  compact = false,
  fetchPredictions,
  onPartSelect,
}: PartsPredictionProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PartsPredictionResponse | null>(null);

  const loadPredictions = useCallback(async () => {
    if (!entityId && !defectId) return;
    if (!fetchPredictions) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchPredictions(entityId, defectId);
      if (result) {
        setData(result);
      }
    } catch {
      setError(t('common.error', 'Failed to load predictions'));
    } finally {
      setLoading(false);
    }
  }, [entityId, defectId, fetchPredictions, t]);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {t('jobs.analyzing_parts', 'Analyzing required parts...')}
          </Text>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        type="warning"
        message={error}
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={loadPredictions}>
            {t('common.retry', 'Retry')}
          </Button>
        }
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (!data || data.predictions.length === 0) {
    return null;
  }

  const renderPartItem = (part: PartPrediction) => (
    <div
      key={part.part_name}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid #f0f0f0',
        cursor: onPartSelect ? 'pointer' : 'default',
      }}
      onClick={() => onPartSelect?.(part)}
    >
      <ToolOutlined style={{ marginRight: 8, color: '#1890ff' }} />
      <div style={{ flex: 1 }}>
        <Text strong>{part.part_name}</Text>
        {part.part_code && (
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            ({part.part_code})
          </Text>
        )}
        {part.used_in_jobs > 0 && (
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            (used in {part.used_in_jobs} jobs)
          </Text>
        )}
      </div>
      <Space>
        <Progress
          type="circle"
          percent={part.frequency_percent}
          width={32}
          strokeColor={CONFIDENCE_COLORS[part.confidence]}
          format={(p) => `${p}%`}
        />
        <Tag color={
          part.confidence === 'high' ? 'green' :
          part.confidence === 'medium' ? 'orange' : 'default'
        }>
          {part.confidence}
        </Tag>
      </Space>
    </div>
  );

  if (compact) {
    return (
      <Collapse
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: '1',
            label: (
              <Space>
                <RobotOutlined />
                <Text>{t('jobs.suggested_parts', 'AI Suggested Parts')}</Text>
                <Tag>{data.predictions.length}</Tag>
              </Space>
            ),
            children: (
              <div>
                {data.predictions.map(renderPartItem)}
                <Alert
                  type="info"
                  message={data.note}
                  style={{ marginTop: 8 }}
                  showIcon
                  icon={<InfoCircleOutlined />}
                />
              </div>
            ),
          },
        ]}
      />
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <RobotOutlined />
          {t('jobs.suggested_parts', 'AI Suggested Parts')}
          <Tooltip title={t('jobs.parts_prediction_info', 'Based on analysis of similar past jobs')}>
            <InfoCircleOutlined style={{ color: '#999' }} />
          </Tooltip>
        </Space>
      }
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={loadPredictions}>
          {t('common.refresh', 'Refresh')}
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      {data.predictions.map(renderPartItem)}

      {data.based_on.sample_size > 0 && (
        <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('jobs.based_on', 'Based on')} {data.based_on.sample_size} {t('jobs.similar_jobs', 'similar jobs')}
            {data.based_on.category && ` • ${data.based_on.category}`}
            {data.based_on.equipment_type && ` • ${data.based_on.equipment_type}`}
          </Text>
        </div>
      )}

      <Alert
        type="info"
        message={data.note}
        style={{ marginTop: 12 }}
        showIcon
        icon={<InfoCircleOutlined />}
      />
    </Card>
  );
}

export default PartsPrediction;
