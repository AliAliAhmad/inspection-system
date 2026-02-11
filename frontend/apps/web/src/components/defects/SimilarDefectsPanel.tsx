import React from 'react';
import { Card, List, Typography, Tag, Space, Progress, Empty, Skeleton, Tooltip, Button } from 'antd';
import {
  LinkOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '@inspection/shared';

const { Text, Paragraph } = Typography;

export interface SimilarDefect {
  defect_id: number;
  similarity_score: number;
  title: string;
  description: string;
  resolution?: string;
  equipment_serial?: string;
  equipment_name?: string;
  status?: string;
  resolved_at?: string;
  severity?: string;
}

export interface SimilarDefectsPanelProps {
  defectId: number;
  defectDescription?: string;
  similarDefects?: SimilarDefect[];
  onDefectClick?: (defectId: number) => void;
  loading?: boolean;
  maxItems?: number;
}

const severityColors: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'green',
};

const statusColors: Record<string, string> = {
  open: 'red',
  in_progress: 'blue',
  resolved: 'green',
  closed: 'default',
};

export function SimilarDefectsPanel({
  defectId,
  defectDescription,
  similarDefects: providedDefects,
  onDefectClick,
  loading: externalLoading,
  maxItems = 5,
}: SimilarDefectsPanelProps) {
  const { t } = useTranslation();

  // Fetch similar defects if not provided
  const { data: fetchedDefects, isLoading: isFetching } = useQuery({
    queryKey: ['similar-defects', defectId, defectDescription],
    queryFn: async () => {
      const query = defectDescription || `defect-${defectId}`;
      const response = await aiApi.searchSimilarDefects(query, maxItems);
      const results = (response.data as any)?.data?.results || [];
      return results.map((r: any) => ({
        defect_id: r.id,
        similarity_score: r.similarity || 0,
        title: r.description?.substring(0, 50) || `Defect #${r.id}`,
        description: r.description || '',
        resolution: r.resolution,
        equipment_serial: r.equipment?.serial_number,
        equipment_name: r.equipment?.name,
        status: r.status,
        severity: r.severity,
      }));
    },
    enabled: !providedDefects && !!defectId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = externalLoading || isFetching;
  const defects = providedDefects || fetchedDefects || [];

  const getSimilarityColor = (score: number): string => {
    if (score >= 0.9) return '#52c41a';
    if (score >= 0.7) return '#faad14';
    if (score >= 0.5) return '#fa8c16';
    return '#ff4d4f';
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'resolved':
      case 'closed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'in_progress':
        return <ToolOutlined style={{ color: '#1677ff' }} />;
      default:
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
    }
  };

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <LinkOutlined />
            {t('defects.similarDefects', 'Similar Defects')}
          </Space>
        }
        size="small"
      >
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  if (defects.length === 0) {
    return (
      <Card
        title={
          <Space>
            <LinkOutlined />
            {t('defects.similarDefects', 'Similar Defects')}
          </Space>
        }
        size="small"
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('defects.noSimilarFound', 'No similar defects found')}
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <LinkOutlined />
          {t('defects.similarDefects', 'Similar Defects')}
          <Tag>{defects.length}</Tag>
        </Space>
      }
      size="small"
      extra={
        <Tooltip title={t('defects.similarityInfo', 'Based on AI analysis of defect descriptions and equipment patterns')}>
          <InfoCircleOutlined style={{ color: '#999' }} />
        </Tooltip>
      }
    >
      <List
        dataSource={defects}
        renderItem={(item: SimilarDefect) => (
          <List.Item
            style={{
              padding: '8px 0',
              cursor: onDefectClick ? 'pointer' : 'default',
            }}
            onClick={() => onDefectClick?.(item.defect_id)}
          >
            <div style={{ width: '100%' }}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-1">
                <Space size={4}>
                  {getStatusIcon(item.status)}
                  <Text strong style={{ fontSize: 13 }}>
                    #{item.defect_id}
                  </Text>
                  {item.severity && (
                    <Tag color={severityColors[item.severity]} style={{ margin: 0, fontSize: 10 }}>
                      {item.severity.toUpperCase()}
                    </Tag>
                  )}
                </Space>

                {/* Similarity score */}
                <Tooltip title={t('defects.similarityScore', 'Similarity Score')}>
                  <div className="flex items-center gap-1">
                    <Progress
                      percent={Math.round(item.similarity_score * 100)}
                      size="small"
                      showInfo={false}
                      style={{ width: 40, margin: 0 }}
                      strokeColor={getSimilarityColor(item.similarity_score)}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        color: getSimilarityColor(item.similarity_score),
                        fontWeight: 600,
                      }}
                    >
                      {Math.round(item.similarity_score * 100)}%
                    </Text>
                  </div>
                </Tooltip>
              </div>

              {/* Title/Description */}
              <Paragraph
                ellipsis={{ rows: 2 }}
                style={{ marginBottom: 4, fontSize: 12, color: '#595959' }}
              >
                {item.title || item.description}
              </Paragraph>

              {/* Equipment info */}
              {(item.equipment_name || item.equipment_serial) && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {item.equipment_name}
                  {item.equipment_serial && ` (${item.equipment_serial})`}
                </Text>
              )}

              {/* Resolution info (if resolved) */}
              {item.resolution && (
                <div
                  style={{
                    marginTop: 6,
                    padding: '4px 8px',
                    backgroundColor: '#f6ffed',
                    borderRadius: 4,
                    border: '1px solid #b7eb8f',
                  }}
                >
                  <Space size={4}>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 11 }} />
                    <Text style={{ fontSize: 11, color: '#52c41a' }}>
                      {t('defects.resolvedWith', 'Resolved:')}
                    </Text>
                  </Space>
                  <Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ margin: 0, fontSize: 11, color: '#389e0d' }}
                  >
                    {item.resolution}
                  </Paragraph>
                </div>
              )}
            </div>
          </List.Item>
        )}
      />

      {onDefectClick && defects.length > 0 && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Button type="link" size="small">
            {t('defects.viewAllSimilar', 'View All Similar Defects')}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default SimilarDefectsPanel;
