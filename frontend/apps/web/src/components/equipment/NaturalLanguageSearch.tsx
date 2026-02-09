import { useState, useCallback } from 'react';
import {
  Input,
  Card,
  List,
  Typography,
  Tag,
  Space,
  Spin,
  Empty,
  Alert,
  Tooltip,
  Button,
  Collapse,
} from 'antd';
import {
  SearchOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { equipmentApi, Equipment } from '@inspection/shared';

// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

const { Text, Title, Paragraph } = Typography;
const { Search } = Input;
const { Panel } = Collapse;

interface NaturalLanguageSearchProps {
  onSelect?: (equipment: Equipment) => void;
  showResults?: boolean;
}

interface ParsedQuery {
  original_query: string;
  filters: Record<string, any>;
  sort: { field?: string; order?: string };
  understood: boolean;
  parsed_at: string;
}

interface SearchResult {
  parsed_query: ParsedQuery;
  results: Equipment[];
  count: number;
}

const exampleQueries = [
  'cranes that stopped last week',
  'equipment with high risk',
  'pumps needing maintenance',
  'active equipment in east berth',
  'oldest equipment',
  'equipment under maintenance',
];

export default function NaturalLanguageSearch({
  onSelect,
  showResults = true,
}: NaturalLanguageSearchProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isArabic = i18n.language === 'ar';

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await equipmentApi.searchNatural(searchQuery);
      if (response.data?.data) {
        setResult(response.data.data);
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search for typing
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      if (value.length >= 3) {
        performSearch(value);
      }
    }, 500),
    []
  );

  const handleSearch = (value: string) => {
    performSearch(value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    performSearch(example);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'green';
      case 'under_maintenance':
        return 'orange';
      case 'paused':
        return 'gold';
      case 'stopped':
        return 'red';
      case 'out_of_service':
        return 'volcano';
      default:
        return 'default';
    }
  };

  const renderFiltersDisplay = (filters: Record<string, any>) => {
    if (Object.keys(filters).length === 0) return null;

    return (
      <Space wrap size={4}>
        {Object.entries(filters).map(([key, value]) => (
          <Tag key={key} icon={<FilterOutlined />} color="blue">
            {key.replace(/_/g, ' ')}: {String(value)}
          </Tag>
        ))}
      </Space>
    );
  };

  const renderSortDisplay = (sort: { field?: string; order?: string }) => {
    if (!sort.field) return null;

    return (
      <Tag icon={<SortAscendingOutlined />} color="purple">
        Sort: {sort.field} ({sort.order || 'asc'})
      </Tag>
    );
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Search Input */}
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space align="center">
            <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
            <Text strong>Natural Language Search</Text>
            <Tooltip title="Search equipment using natural language. For example: 'cranes that stopped last week' or 'high risk equipment in east berth'">
              <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          </Space>

          <Search
            value={query}
            onChange={handleChange}
            onSearch={handleSearch}
            placeholder={
              isArabic
                ? 'ابحث بلغة طبيعية... مثال: الرافعات التي توقفت الاسبوع الماضي'
                : 'Search in natural language... e.g., "cranes that stopped last week"'
            }
            enterButton={<><SearchOutlined /> Search</>}
            size="large"
            loading={loading}
            allowClear
          />

          {/* Example queries */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              Try:
            </Text>
            {exampleQueries.slice(0, 4).map((example, i) => (
              <Button
                key={i}
                size="small"
                type="link"
                onClick={() => handleExampleClick(example)}
                style={{ padding: '0 8px' }}
              >
                {example}
              </Button>
            ))}
          </div>
        </Space>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin size="large" />
            <br />
            <Text type="secondary">Searching equipment...</Text>
          </div>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Alert message="Search Failed" description={error} type="error" showIcon closable />
      )}

      {/* Results */}
      {!loading && result && showResults && (
        <Card>
          {/* Query interpretation */}
          <Collapse
            defaultActiveKey={result.parsed_query.understood ? [] : ['interpretation']}
            ghost
            style={{ marginBottom: 16 }}
          >
            <Panel
              header={
                <Space>
                  {result.parsed_query.understood ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#faad14' }} />
                  )}
                  <Text>
                    Query Interpretation
                    {result.parsed_query.understood ? ' (Understood)' : ' (Partial understanding)'}
                  </Text>
                </Space>
              }
              key="interpretation"
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">Original query: </Text>
                  <Text code>{result.parsed_query.original_query}</Text>
                </div>
                <div>
                  <Text type="secondary">Detected filters: </Text>
                  {Object.keys(result.parsed_query.filters).length > 0 ? (
                    renderFiltersDisplay(result.parsed_query.filters)
                  ) : (
                    <Text type="secondary" italic>
                      None detected
                    </Text>
                  )}
                </div>
                <div>
                  <Text type="secondary">Sorting: </Text>
                  {result.parsed_query.sort.field ? (
                    renderSortDisplay(result.parsed_query.sort)
                  ) : (
                    <Text type="secondary" italic>
                      Default (by name)
                    </Text>
                  )}
                </div>
              </Space>
            </Panel>
          </Collapse>

          {/* Results count */}
          <div style={{ marginBottom: 16 }}>
            <Text strong>
              Found {result.count} equipment
              {result.count !== 1 ? 's' : ''}
            </Text>
          </div>

          {/* Results list */}
          {result.results.length > 0 ? (
            <List
              dataSource={result.results}
              renderItem={(equipment) => (
                <List.Item
                  key={equipment.id}
                  onClick={() => onSelect?.(equipment)}
                  style={{
                    cursor: onSelect ? 'pointer' : 'default',
                    padding: '12px 16px',
                    borderRadius: 8,
                    marginBottom: 8,
                    background: '#fafafa',
                  }}
                  extra={
                    <Space direction="vertical" align="end">
                      <Tag color={getStatusColor(equipment.status)}>{equipment.status}</Tag>
                      {equipment.berth && <Tag>{equipment.berth} berth</Tag>}
                    </Space>
                  }
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{equipment.name}</Text>
                        <Tag color="blue">{equipment.equipment_type}</Tag>
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">Serial: {equipment.serial_number}</Text>
                        {equipment.location && (
                          <Text type="secondary">Location: {equipment.location}</Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty
              description={
                <span>
                  No equipment found matching your query.
                  <br />
                  Try a different search term.
                </span>
              }
            />
          )}
        </Card>
      )}

      {/* Empty state when no search yet */}
      {!loading && !result && !error && (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical">
                <Text>Enter a natural language query to search equipment</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Examples:
                </Text>
                <Space direction="vertical" size={0}>
                  {exampleQueries.map((example, i) => (
                    <Button
                      key={i}
                      type="link"
                      size="small"
                      onClick={() => handleExampleClick(example)}
                    >
                      "{example}"
                    </Button>
                  ))}
                </Space>
              </Space>
            }
          />
        </Card>
      )}
    </Space>
  );
}
