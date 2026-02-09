import { useState } from 'react';
import { Card, List, Typography, Tag, Space, Input, Button, Spin, Empty, Alert, Avatar } from 'antd';
import {
  RobotOutlined,
  BulbOutlined,
  RiseOutlined,
  WarningOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, MaterialInsight, Material } from '@inspection/shared';

const { Text, Title, Paragraph } = Typography;

interface MaterialInsightsPanelProps {
  materialId?: number;
  compact?: boolean;
}

const insightTypeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  trend: { icon: <RiseOutlined />, color: '#1890ff' },
  pattern: { icon: <LineChartOutlined />, color: '#722ed1' },
  anomaly: { icon: <AlertOutlined />, color: '#ff4d4f' },
  recommendation: { icon: <BulbOutlined />, color: '#52c41a' },
};

export function MaterialInsightsPanel({
  materialId,
  compact = false,
}: MaterialInsightsPanelProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Material[] | null>(null);
  const [searchInterpretation, setSearchInterpretation] = useState<string | null>(null);

  // Fetch insights
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['material-insights', materialId],
    queryFn: () => materialsApi.getInsights(materialId),
  });

  // Natural language search mutation
  const searchMutation = useMutation({
    mutationFn: (query: string) => materialsApi.searchNaturalLanguage(query),
    onSuccess: (response) => {
      setSearchResults(response.data?.materials || []);
      setSearchInterpretation(response.data?.interpretation || null);
    },
  });

  const insights = insightsData?.data?.insights || [];

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchInterpretation(null);
  };

  const renderInsightIcon = (type: string) => {
    const config = insightTypeConfig[type] || { icon: <BulbOutlined />, color: '#8c8c8c' };
    return (
      <Avatar
        icon={config.icon}
        style={{ backgroundColor: config.color }}
        size={compact ? 'small' : 'default'}
      />
    );
  };

  const renderInsightTag = (type: string) => {
    const config = insightTypeConfig[type] || { color: 'default' };
    return (
      <Tag color={config.color === '#1890ff' ? 'blue' : config.color === '#722ed1' ? 'purple' : config.color === '#ff4d4f' ? 'red' : 'green'}>
        {t(`materials.insight_${type}`, type.charAt(0).toUpperCase() + type.slice(1))}
      </Tag>
    );
  };

  if (compact) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('materials.ai_insights', 'AI Insights')}
          </Space>
        }
        style={{ borderLeft: '4px solid #722ed1' }}
      >
        {insightsLoading ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin size="small" />
          </div>
        ) : insights.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('materials.no_insights', 'No insights available')}
          />
        ) : (
          <List
            dataSource={insights.slice(0, 3)}
            renderItem={(insight) => (
              <List.Item style={{ padding: '8px 0' }}>
                <Space align="start">
                  {renderInsightIcon(insight.type)}
                  <Text style={{ fontSize: 12 }}>{insight.insight}</Text>
                </Space>
              </List.Item>
            )}
            size="small"
          />
        )}
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#722ed1' }} />
          {t('materials.ai_insights', 'AI Insights')}
        </Space>
      }
      style={{ borderLeft: '4px solid #722ed1' }}
    >
      {/* Natural Language Search */}
      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          <ThunderboltOutlined /> {t('materials.natural_language_search', 'Natural Language Search')}
        </Text>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder={t('materials.search_example', 'e.g., "Show filters running low" or "Materials expiring soon"')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={searchMutation.isPending}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
          >
            {t('common.search', 'Search')}
          </Button>
        </Space.Compact>

        {/* Search Results */}
        {searchResults !== null && (
          <div style={{ marginTop: 16 }}>
            {searchInterpretation && (
              <Alert
                message={t('materials.ai_understood', 'AI understood your query as')}
                description={searchInterpretation}
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
            )}
            {searchResults.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('materials.no_matching_materials', 'No matching materials found')}
              />
            ) : (
              <div>
                <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
                  <Text type="secondary">
                    {t('materials.found_results', 'Found {{count}} results', { count: searchResults.length })}
                  </Text>
                  <Button type="link" size="small" onClick={handleClearSearch}>
                    {t('common.clear', 'Clear')}
                  </Button>
                </Space>
                <List
                  dataSource={searchResults.slice(0, 5)}
                  renderItem={(material) => (
                    <List.Item>
                      <List.Item.Meta
                        title={material.name}
                        description={`${material.code} - ${material.category}`}
                      />
                      <Text>
                        {material.current_stock} {material.unit}
                        {material.is_low_stock && (
                          <Tag color="error" style={{ marginLeft: 8 }}>
                            <WarningOutlined /> {t('materials.low_stock', 'Low Stock')}
                          </Tag>
                        )}
                      </Text>
                    </List.Item>
                  )}
                  size="small"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Insights List */}
      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          <BulbOutlined /> {t('materials.latest_insights', 'Latest Insights')}
        </Text>
        {insightsLoading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>
            <Spin />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{t('materials.analyzing', 'Analyzing data...')}</Text>
            </div>
          </div>
        ) : insights.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('materials.no_insights', 'No insights available at this time')}
          />
        ) : (
          <List
            dataSource={insights}
            renderItem={(insight) => (
              <List.Item>
                <List.Item.Meta
                  avatar={renderInsightIcon(insight.type)}
                  title={
                    <Space>
                      {renderInsightTag(insight.type)}
                      {insight.material_name && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {insight.material_name}
                        </Text>
                      )}
                    </Space>
                  }
                  description={<Paragraph style={{ margin: 0 }}>{insight.insight}</Paragraph>}
                />
              </List.Item>
            )}
            size="small"
          />
        )}
      </div>
    </Card>
  );
}

export default MaterialInsightsPanel;
