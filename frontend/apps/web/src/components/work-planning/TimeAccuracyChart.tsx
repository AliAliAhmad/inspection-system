/**
 * TimeAccuracyChart.tsx
 * Shows time estimation accuracy with pie chart and breakdown by job type.
 */
import React, { useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Progress,
  Typography,
  Statistic,
  Space,
  Tag,
  List,
  Tooltip,
  Empty,
  Divider,
} from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  BulbOutlined,
  BarChartOutlined,
  PieChartOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface JobTypeBreakdown {
  type: string;
  label: string;
  totalJobs: number;
  avgEstimated: number;
  avgActual: number;
  accuracyPercent: number;
  trend: 'under' | 'over' | 'accurate';
}

interface TimeAccuracyChartProps {
  overallAccuracy: number;
  underEstimatedCount: number;
  overEstimatedCount: number;
  accurateCount: number;
  byJobType?: JobTypeBreakdown[];
  recommendations?: string[];
  periodLabel?: string;
}

// Helper to calculate accuracy from jobs data
export const calculateTimeAccuracy = (
  jobs: Array<{
    job_type: string;
    estimated_hours: number;
    tracking?: { actual_hours?: number | null };
  }>
): Omit<TimeAccuracyChartProps, 'recommendations' | 'periodLabel'> => {
  const completedJobs = jobs.filter(j => j.tracking?.actual_hours != null);

  if (completedJobs.length === 0) {
    return {
      overallAccuracy: 0,
      underEstimatedCount: 0,
      overEstimatedCount: 0,
      accurateCount: 0,
      byJobType: [],
    };
  }

  let underCount = 0;
  let overCount = 0;
  let accurateCount = 0;
  let totalAccuracy = 0;

  // Group by job type
  const typeMap = new Map<string, {
    jobs: number;
    totalEstimated: number;
    totalActual: number;
  }>();

  completedJobs.forEach(job => {
    const estimated = job.estimated_hours;
    const actual = job.tracking!.actual_hours!;
    const diff = actual - estimated;
    const accuracy = Math.max(0, 100 - Math.abs(diff / estimated) * 100);
    totalAccuracy += accuracy;

    // Threshold: within 15% is "accurate"
    if (diff > estimated * 0.15) {
      underCount++; // Took longer than estimated = underestimated
    } else if (diff < -estimated * 0.15) {
      overCount++; // Took less than estimated = overestimated
    } else {
      accurateCount++;
    }

    // Track by type
    const type = job.job_type;
    const existing = typeMap.get(type) || { jobs: 0, totalEstimated: 0, totalActual: 0 };
    existing.jobs++;
    existing.totalEstimated += estimated;
    existing.totalActual += actual;
    typeMap.set(type, existing);
  });

  const byJobType: JobTypeBreakdown[] = Array.from(typeMap.entries()).map(([type, data]) => {
    const avgEst = data.totalEstimated / data.jobs;
    const avgAct = data.totalActual / data.jobs;
    const accuracy = Math.max(0, 100 - Math.abs(avgAct - avgEst) / avgEst * 100);
    const diff = avgAct - avgEst;

    return {
      type,
      label: type === 'pm' ? 'Preventive Maintenance' : type === 'defect' ? 'Defect Repairs' : 'Inspections',
      totalJobs: data.jobs,
      avgEstimated: Math.round(avgEst * 10) / 10,
      avgActual: Math.round(avgAct * 10) / 10,
      accuracyPercent: Math.round(accuracy),
      trend: diff > avgEst * 0.1 ? 'under' : diff < -avgEst * 0.1 ? 'over' : 'accurate',
    };
  });

  return {
    overallAccuracy: Math.round(totalAccuracy / completedJobs.length),
    underEstimatedCount: underCount,
    overEstimatedCount: overCount,
    accurateCount: accurateCount,
    byJobType,
  };
};

// Generate recommendations based on data
const generateRecommendations = (
  underCount: number,
  overCount: number,
  byJobType: JobTypeBreakdown[] = []
): string[] => {
  const recs: string[] = [];

  if (underCount > overCount * 2) {
    recs.push('Consider increasing time estimates by 15-20% overall');
  }
  if (overCount > underCount * 2) {
    recs.push('Time estimates may be too conservative - consider reducing by 10-15%');
  }

  byJobType.forEach(jt => {
    if (jt.accuracyPercent < 70 && jt.trend === 'under') {
      recs.push(`Increase ${jt.label} estimates - avg ${jt.avgActual}h vs ${jt.avgEstimated}h estimated`);
    }
    if (jt.accuracyPercent < 70 && jt.trend === 'over') {
      recs.push(`Decrease ${jt.label} estimates - jobs complete faster than expected`);
    }
  });

  if (recs.length === 0) {
    recs.push('Time estimation accuracy is good - maintain current practices');
  }

  return recs.slice(0, 4);
};

export const TimeAccuracyChart: React.FC<TimeAccuracyChartProps> = ({
  overallAccuracy,
  underEstimatedCount,
  overEstimatedCount,
  accurateCount,
  byJobType = [],
  recommendations: providedRecs,
  periodLabel,
}) => {
  const totalJobs = underEstimatedCount + overEstimatedCount + accurateCount;

  const recommendations = useMemo(
    () => providedRecs || generateRecommendations(underEstimatedCount, overEstimatedCount, byJobType),
    [providedRecs, underEstimatedCount, overEstimatedCount, byJobType]
  );

  // Calculate percentages for pie chart
  const underPercent = totalJobs > 0 ? Math.round((underEstimatedCount / totalJobs) * 100) : 0;
  const overPercent = totalJobs > 0 ? Math.round((overEstimatedCount / totalJobs) * 100) : 0;
  const accuratePercent = totalJobs > 0 ? Math.round((accurateCount / totalJobs) * 100) : 0;

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 85) return '#52c41a';
    if (accuracy >= 70) return '#1890ff';
    if (accuracy >= 55) return '#faad14';
    return '#ff4d4f';
  };

  if (totalJobs === 0) {
    return (
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>Time Estimation Accuracy</span>
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No completed jobs with time data available"
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined style={{ color: '#1890ff' }} />
          <span>Time Estimation Accuracy</span>
          {periodLabel && (
            <Tag color="blue">{periodLabel}</Tag>
          )}
        </Space>
      }
    >
      <Row gutter={24}>
        {/* Overall Accuracy Circle */}
        <Col span={8}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <Progress
              type="circle"
              percent={overallAccuracy}
              width={120}
              strokeColor={getAccuracyColor(overallAccuracy)}
              format={(p) => (
                <div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: getAccuracyColor(overallAccuracy) }}>
                    {p}%
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>Accuracy</div>
                </div>
              )}
            />
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">{totalJobs} jobs analyzed</Text>
            </div>
          </div>
        </Col>

        {/* Pie Chart Visualization */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Space>
              <PieChartOutlined />
              <Text strong>Estimation Distribution</Text>
            </Space>
          </div>

          {/* CSS Pie Chart */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: `conic-gradient(
                  #ff4d4f 0% ${underPercent}%,
                  #faad14 ${underPercent}% ${underPercent + overPercent}%,
                  #52c41a ${underPercent + overPercent}% 100%
                )`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            />
          </div>

          {/* Legend */}
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <MinusCircleOutlined style={{ color: '#ff4d4f' }} />
                <Text>Under-estimated</Text>
              </Space>
              <Text strong>{underEstimatedCount} ({underPercent}%)</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <PlusCircleOutlined style={{ color: '#faad14' }} />
                <Text>Over-estimated</Text>
              </Space>
              <Text strong>{overEstimatedCount} ({overPercent}%)</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text>Accurate</Text>
              </Space>
              <Text strong>{accurateCount} ({accuratePercent}%)</Text>
            </div>
          </Space>
        </Col>

        {/* By Job Type Breakdown */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Space>
              <BarChartOutlined />
              <Text strong>By Job Type</Text>
            </Space>
          </div>

          {byJobType.length > 0 ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {byJobType.map((jt) => (
                <div key={jt.type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                      <Tag
                        color={jt.type === 'pm' ? 'blue' : jt.type === 'defect' ? 'red' : 'green'}
                        style={{ margin: 0 }}
                      >
                        {jt.type.toUpperCase()}
                      </Tag>
                      <Text style={{ fontSize: 12 }}>{jt.totalJobs} jobs</Text>
                    </Space>
                    <Tooltip title={`${jt.avgEstimated}h est vs ${jt.avgActual}h actual`}>
                      <Space size={4}>
                        {jt.trend === 'under' && (
                          <MinusCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                        )}
                        {jt.trend === 'over' && (
                          <PlusCircleOutlined style={{ color: '#faad14', fontSize: 12 }} />
                        )}
                        {jt.trend === 'accurate' && (
                          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                        )}
                        <Text strong style={{ fontSize: 12 }}>{jt.accuracyPercent}%</Text>
                      </Space>
                    </Tooltip>
                  </div>
                  <Progress
                    percent={jt.accuracyPercent}
                    size="small"
                    strokeColor={getAccuracyColor(jt.accuracyPercent)}
                    showInfo={false}
                  />
                </div>
              ))}
            </Space>
          ) : (
            <Text type="secondary">No job type data available</Text>
          )}
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      {/* Recommendations */}
      <div>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <BulbOutlined style={{ color: '#faad14' }} />
            <Text strong>Recommendations for Better Estimation</Text>
          </Space>
        </div>
        <List
          size="small"
          dataSource={recommendations}
          renderItem={(rec, index) => (
            <List.Item style={{ padding: '6px 0', borderBottom: 'none' }}>
              <Space>
                <Tag color="blue" style={{ minWidth: 24, textAlign: 'center' }}>
                  {index + 1}
                </Tag>
                <Text style={{ fontSize: 13 }}>{rec}</Text>
              </Space>
            </List.Item>
          )}
        />
      </div>
    </Card>
  );
};

export default TimeAccuracyChart;
