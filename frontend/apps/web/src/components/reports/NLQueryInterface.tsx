import { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Input,
  Button,
  Spin,
  Empty,
  Tag,
  Alert,
  List,
  Divider,
  Collapse,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  SearchOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  SendOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsAIApi, type NLQueryResult } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

export interface NLQueryInterfaceProps {
  compact?: boolean;
}

interface QueryHistoryItem {
  query: string;
  result: NLQueryResult;
  timestamp: Date;
}

const EXAMPLE_QUERIES = [
  'How many inspections were completed last week?',
  'What is the current defect resolution rate?',
  'Show me the top 5 engineers by jobs completed',
  'Which equipment has the most open defects?',
  'What is the average time to resolve critical defects?',
  'How many SLA breaches occurred this month?',
];

export function NLQueryInterface({ compact = false }: NLQueryInterfaceProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [currentResult, setCurrentResult] = useState<NLQueryResult | null>(null);

  const queryMutation = useMutation({
    mutationFn: (question: string) => reportsAIApi.queryReports(question),
    onSuccess: (data) => {
      setCurrentResult(data);
      setQueryHistory((prev) => [
        { query, result: data, timestamp: new Date() },
        ...prev.slice(0, 9), // Keep last 10 queries
      ]);
      setQuery('');
    },
  });

  const handleSubmit = () => {
    if (!query.trim()) return;
    queryMutation.mutate(query.trim());
  };

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    queryMutation.mutate(suggestion);
  };

  const handleClearHistory = () => {
    setQueryHistory([]);
    setCurrentResult(null);
  };

  if (compact) {
    return (
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder={t('reports.ai.askQuestion', 'Ask a question about your data...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={handleSubmit}
              prefix={<SearchOutlined />}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmit}
              loading={queryMutation.isPending}
            />
          </Space.Compact>
          {currentResult && (
            <Alert
              type={currentResult.understood ? 'success' : 'warning'}
              message={currentResult.summary}
              showIcon
              icon={currentResult.understood ? <CheckCircleOutlined /> : <QuestionCircleOutlined />}
            />
          )}
        </Space>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <QuestionCircleOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('reports.ai.nlQuery', 'Natural Language Query')}
          </Title>
        </Space>
      }
      extra={
        queryHistory.length > 0 && (
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleClearHistory}
          >
            {t('reports.ai.clearHistory', 'Clear History')}
          </Button>
        )
      }
    >
      {/* Query Input */}
      <div style={{ marginBottom: 24 }}>
        <TextArea
          placeholder={t(
            'reports.ai.askQuestionPlaceholder',
            'Ask a question about your inspection data in plain English...'
          )}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          autoSize={{ minRows: 2, maxRows: 4 }}
          style={{ fontSize: 15 }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('reports.ai.pressEnter', 'Press Enter to submit, Shift+Enter for new line')}
          </Text>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSubmit}
            loading={queryMutation.isPending}
            disabled={!query.trim()}
          >
            {t('reports.ai.submit', 'Submit Query')}
          </Button>
        </div>
      </div>

      {/* Example Queries */}
      {!currentResult && queryHistory.length === 0 && (
        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            <BulbOutlined style={{ marginRight: 8, color: '#faad14' }} />
            {t('reports.ai.exampleQueries', 'Example Queries')}
          </Text>
          <Space wrap>
            {EXAMPLE_QUERIES.map((example, i) => (
              <Tag
                key={i}
                style={{ cursor: 'pointer', padding: '4px 12px' }}
                onClick={() => handleExampleClick(example)}
              >
                {example}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* Loading State */}
      {queryMutation.isPending && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>
            {t('reports.ai.analyzing', 'Analyzing your question...')}
          </Paragraph>
        </div>
      )}

      {/* Error State */}
      {queryMutation.isError && (
        <Alert
          type="error"
          message={t('reports.ai.queryError', 'Failed to process query')}
          description={t('reports.ai.queryErrorDescription', 'Please try rephrasing your question or try again later.')}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Current Result */}
      {currentResult && !queryMutation.isPending && (
        <div style={{ marginBottom: 24 }}>
          <Card
            size="small"
            style={{
              backgroundColor: currentResult.understood ? '#f6ffed' : '#fffbe6',
              borderColor: currentResult.understood ? '#b7eb8f' : '#ffe58f',
            }}
          >
            {/* Query Understanding Status */}
            <div style={{ marginBottom: 16 }}>
              <Space>
                {currentResult.understood ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#faad14', fontSize: 20 }} />
                )}
                <Text strong>
                  {currentResult.understood
                    ? t('reports.ai.queryUnderstood', 'Query Understood')
                    : t('reports.ai.queryPartial', 'Partial Understanding')}
                </Text>
                <Tag color="blue">{currentResult.intent}</Tag>
              </Space>
            </div>

            {/* Summary */}
            <div
              style={{
                padding: 16,
                backgroundColor: 'rgba(255,255,255,0.8)',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('reports.ai.summary', 'Summary')}
              </Text>
              <Paragraph style={{ margin: 0, fontSize: 15 }}>{currentResult.summary}</Paragraph>
            </div>

            {/* Data Results */}
            {currentResult.data && Object.keys(currentResult.data).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 12 }}>
                  {t('reports.ai.results', 'Results')}
                </Text>
                <Row gutter={[16, 16]}>
                  {Object.entries(currentResult.data).map(([key, value]) => (
                    <Col key={key} xs={24} sm={12} md={8}>
                      <Card size="small" style={{ backgroundColor: '#fff' }}>
                        <Statistic
                          title={key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          value={typeof value === 'number' ? value : String(value)}
                        />
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
            )}

            {/* SQL Equivalent */}
            {currentResult.sql_equivalent && (
              <Collapse ghost style={{ backgroundColor: 'transparent' }}>
                <Panel
                  header={
                    <Space>
                      <CodeOutlined />
                      <Text type="secondary">{t('reports.ai.sqlEquivalent', 'SQL Equivalent')}</Text>
                    </Space>
                  }
                  key="sql"
                >
                  <pre
                    style={{
                      backgroundColor: '#1e1e1e',
                      color: '#d4d4d4',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: 12,
                      overflow: 'auto',
                    }}
                  >
                    {currentResult.sql_equivalent}
                  </pre>
                </Panel>
              </Collapse>
            )}

            {/* Suggestions */}
            {currentResult.suggestions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  <BulbOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                  {t('reports.ai.followUpQueries', 'Follow-up Queries')}
                </Text>
                <Space wrap>
                  {currentResult.suggestions.map((suggestion, i) => (
                    <Tag
                      key={i}
                      color="blue"
                      style={{ cursor: 'pointer', padding: '4px 12px' }}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Query History */}
      {queryHistory.length > 1 && (
        <div>
          <Divider />
          <Collapse ghost>
            <Panel
              header={
                <Space>
                  <HistoryOutlined />
                  <Text strong>{t('reports.ai.queryHistory', 'Query History')}</Text>
                  <Tag>{queryHistory.length}</Tag>
                </Space>
              }
              key="history"
            >
              <List
                size="small"
                dataSource={queryHistory.slice(1)}
                renderItem={(item) => (
                  <List.Item
                    style={{
                      padding: '12px',
                      backgroundColor: '#fafafa',
                      borderRadius: 8,
                      marginBottom: 8,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setCurrentResult(item.result);
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text strong style={{ fontSize: 13 }}>
                          {item.query}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.timestamp.toLocaleTimeString()}
                        </Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.result.summary.substring(0, 100)}
                        {item.result.summary.length > 100 ? '...' : ''}
                      </Text>
                    </div>
                  </List.Item>
                )}
              />
            </Panel>
          </Collapse>
        </div>
      )}
    </Card>
  );
}

export default NLQueryInterface;
