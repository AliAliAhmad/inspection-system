/**
 * IncompleteJobsWarning.tsx
 * Shows jobs at risk of not being completed with probability and risk factors.
 */
import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Space,
  Progress,
  Tooltip,
  Badge,
  Button,
  Alert,
  Row,
  Col,
  Empty,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ToolOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface RiskFactor {
  type: 'time' | 'worker' | 'equipment' | 'history' | 'complexity';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

interface PredictedIncompleteJob {
  id: number;
  equipmentName: string;
  equipmentSerial?: string;
  jobType: 'pm' | 'defect' | 'inspection';
  assignedWorker?: string;
  workerId?: number;
  estimatedHours: number;
  completionProbability: number;
  riskFactors: RiskFactor[];
  recommendedAction: string;
  scheduledDate?: string;
}

interface IncompleteJobsWarningProps {
  jobs: PredictedIncompleteJob[];
  onTakeAction?: (jobId: number, action: string) => void;
  compact?: boolean;
  maxItems?: number;
}

// Mock data generator for demo purposes - in production this comes from AI API
export const generateMockPredictions = (
  jobs: Array<{
    id: number;
    equipment?: { name?: string; serial_number?: string };
    job_type: string;
    assignments?: Array<{ user?: { full_name: string; id: number } }>;
    estimated_hours: number;
    tracking?: { status?: string };
  }>
): PredictedIncompleteJob[] => {
  return jobs
    .filter(j => j.tracking?.status !== 'completed')
    .map(job => {
      // Simulate AI prediction based on job characteristics
      const baseProb = 75 + Math.random() * 20;
      const riskFactors: RiskFactor[] = [];
      let probability = baseProb;

      // Time risk
      if (job.estimated_hours > 6) {
        probability -= 15;
        riskFactors.push({
          type: 'time',
          description: `Long duration job (${job.estimated_hours}h estimated)`,
          severity: 'medium',
        });
      }

      // No assignment risk
      if (!job.assignments?.length) {
        probability -= 25;
        riskFactors.push({
          type: 'worker',
          description: 'No worker assigned',
          severity: 'high',
        });
      }

      // Random complexity risk
      if (Math.random() > 0.6) {
        probability -= 10;
        riskFactors.push({
          type: 'complexity',
          description: 'Complex job type requires specialized skills',
          severity: 'medium',
        });
      }

      // Clamp probability
      probability = Math.max(10, Math.min(95, probability));

      // Determine recommended action
      let recommendedAction = 'Monitor progress';
      if (probability < 50) {
        recommendedAction = 'Consider reassignment or splitting job';
      } else if (probability < 70) {
        recommendedAction = 'Assign additional support worker';
      } else if (!job.assignments?.length) {
        recommendedAction = 'Assign worker immediately';
      }

      return {
        id: job.id,
        equipmentName: job.equipment?.name || 'Unknown Equipment',
        equipmentSerial: job.equipment?.serial_number,
        jobType: job.job_type as 'pm' | 'defect' | 'inspection',
        assignedWorker: job.assignments?.[0]?.user?.full_name,
        workerId: job.assignments?.[0]?.user?.id,
        estimatedHours: job.estimated_hours,
        completionProbability: Math.round(probability),
        riskFactors,
        recommendedAction,
      };
    })
    .filter(p => p.completionProbability < 85)
    .sort((a, b) => a.completionProbability - b.completionProbability);
};

const getRiskSeverityColor = (severity: RiskFactor['severity']) => {
  switch (severity) {
    case 'high': return '#ff4d4f';
    case 'medium': return '#faad14';
    case 'low': return '#52c41a';
    default: return '#8c8c8c';
  }
};

const getRiskTypeIcon = (type: RiskFactor['type']) => {
  switch (type) {
    case 'time': return <ClockCircleOutlined />;
    case 'worker': return <UserOutlined />;
    case 'equipment': return <ToolOutlined />;
    default: return <InfoCircleOutlined />;
  }
};

const getJobTypeColor = (type: string) => {
  switch (type) {
    case 'pm': return 'blue';
    case 'defect': return 'red';
    case 'inspection': return 'green';
    default: return 'default';
  }
};

export const IncompleteJobsWarning: React.FC<IncompleteJobsWarningProps> = ({
  jobs,
  onTakeAction,
  compact = false,
  maxItems,
}) => {
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const sortedJobs = useMemo(() => {
    const sorted = [...jobs].sort((a, b) => {
      return sortOrder === 'asc'
        ? a.completionProbability - b.completionProbability
        : b.completionProbability - a.completionProbability;
    });
    return maxItems ? sorted.slice(0, maxItems) : sorted;
  }, [jobs, sortOrder, maxItems]);

  const criticalCount = jobs.filter(j => j.completionProbability < 50).length;
  const warningCount = jobs.filter(j => j.completionProbability >= 50 && j.completionProbability < 70).length;

  if (jobs.length === 0) {
    return compact ? null : (
      <Card size="small">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No jobs at risk of incompletion"
        />
      </Card>
    );
  }

  // Compact view for embedding in other components
  if (compact) {
    return (
      <Alert
        type={criticalCount > 0 ? 'error' : 'warning'}
        message={
          <Space>
            <WarningOutlined />
            <Text strong>
              {jobs.length} job{jobs.length > 1 ? 's' : ''} at risk
            </Text>
            {criticalCount > 0 && (
              <Tag color="red">{criticalCount} critical</Tag>
            )}
            {warningCount > 0 && (
              <Tag color="orange">{warningCount} warning</Tag>
            )}
          </Space>
        }
        description={
          <div style={{ marginTop: 8 }}>
            {sortedJobs.slice(0, 3).map(job => (
              <div
                key={job.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <Space size="small">
                  <Tag color={getJobTypeColor(job.jobType)} style={{ margin: 0 }}>
                    {job.jobType.toUpperCase()}
                  </Tag>
                  <Text style={{ fontSize: 13 }}>
                    {job.equipmentSerial || job.equipmentName}
                  </Text>
                </Space>
                <Progress
                  percent={job.completionProbability}
                  size="small"
                  style={{ width: 80 }}
                  strokeColor={
                    job.completionProbability < 50
                      ? '#ff4d4f'
                      : job.completionProbability < 70
                      ? '#faad14'
                      : '#52c41a'
                  }
                  format={(p) => `${p}%`}
                />
              </div>
            ))}
            {jobs.length > 3 && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                +{jobs.length - 3} more jobs at risk
              </Text>
            )}
          </div>
        }
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }

  // Full table view
  const columns: ColumnsType<PredictedIncompleteJob> = [
    {
      title: 'Job',
      key: 'job',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <Tag color={getJobTypeColor(record.jobType)}>
              {record.jobType.toUpperCase()}
            </Tag>
            <Text strong style={{ fontSize: 13 }}>
              {record.equipmentSerial || record.equipmentName}
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Est. {record.estimatedHours}h
          </Text>
        </Space>
      ),
    },
    {
      title: 'Assigned To',
      key: 'worker',
      width: 140,
      render: (_, record) => (
        record.assignedWorker ? (
          <Space>
            <UserOutlined />
            <Text>{record.assignedWorker}</Text>
          </Space>
        ) : (
          <Tag color="orange" icon={<WarningOutlined />}>
            Unassigned
          </Tag>
        )
      ),
    },
    {
      title: (
        <Space>
          Completion Probability
          <Button
            type="text"
            size="small"
            icon={sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
            onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
          />
        </Space>
      ),
      key: 'probability',
      width: 180,
      sorter: (a, b) => a.completionProbability - b.completionProbability,
      sortOrder: sortOrder === 'asc' ? 'ascend' : 'descend',
      render: (_, record) => (
        <Progress
          percent={record.completionProbability}
          strokeColor={
            record.completionProbability < 50
              ? '#ff4d4f'
              : record.completionProbability < 70
              ? '#faad14'
              : '#52c41a'
          }
          format={(p) => (
            <Text
              strong
              style={{
                color: record.completionProbability < 50 ? '#ff4d4f' : undefined,
              }}
            >
              {p}%
            </Text>
          )}
        />
      ),
    },
    {
      title: 'Risk Factors',
      key: 'risks',
      width: 220,
      render: (_, record) => (
        <Space wrap size={[4, 4]}>
          {record.riskFactors.map((factor, idx) => (
            <Tooltip key={idx} title={factor.description}>
              <Tag
                icon={getRiskTypeIcon(factor.type)}
                color={factor.severity === 'high' ? 'error' : factor.severity === 'medium' ? 'warning' : 'default'}
                style={{ fontSize: 11 }}
              >
                {factor.type}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: 'Recommended Action',
      key: 'action',
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Text style={{ fontSize: 12 }}>{record.recommendedAction}</Text>
          {onTakeAction && (
            <Button
              size="small"
              type="link"
              icon={<ThunderboltOutlined />}
              onClick={() => onTakeAction(record.id, record.recommendedAction)}
              style={{ padding: 0, height: 'auto' }}
            >
              Take Action
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>Predicted Incomplete Jobs</span>
          <Badge count={jobs.length} style={{ backgroundColor: '#faad14' }} />
        </Space>
      }
      extra={
        <Space>
          {criticalCount > 0 && (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>
              {criticalCount} Critical
            </Tag>
          )}
          {warningCount > 0 && (
            <Tag color="orange" icon={<WarningOutlined />}>
              {warningCount} Warning
            </Tag>
          )}
        </Space>
      }
      bodyStyle={{ padding: 0 }}
    >
      {/* Summary Alert */}
      <div style={{ padding: '12px 16px', backgroundColor: '#fffbe6', borderBottom: '1px solid #ffe58f' }}>
        <Row align="middle" gutter={16}>
          <Col>
            <ExclamationCircleOutlined style={{ fontSize: 24, color: '#faad14' }} />
          </Col>
          <Col flex="auto">
            <Text>
              AI analysis indicates <Text strong>{jobs.length} job{jobs.length > 1 ? 's' : ''}</Text> may
              not be completed on time. Jobs are sorted by risk level - address critical items first.
            </Text>
          </Col>
        </Row>
      </div>

      <Table
        columns={columns}
        dataSource={sortedJobs}
        rowKey="id"
        size="small"
        pagination={jobs.length > 10 ? { pageSize: 10 } : false}
        rowClassName={(record) =>
          record.completionProbability < 50 ? 'ant-table-row-danger' : ''
        }
      />

      <style>{`
        .ant-table-row-danger {
          background-color: #fff2f0 !important;
        }
        .ant-table-row-danger:hover > td {
          background-color: #ffebe6 !important;
        }
      `}</style>
    </Card>
  );
};

export default IncompleteJobsWarning;
