import { Card, Typography, Space, Tag, List, Empty, Spin, Tooltip } from 'antd';
import {
  RadarChartOutlined,
  WarningOutlined,
  RiseOutlined,
  StarOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@inspection/shared';

const { Text, Title } = Typography;

export interface SkillLevel {
  skill_name: string;
  skill_id: number;
  current_level: number;
  target_level: number;
  max_level: number;
  gap: number;
  priority: 'high' | 'medium' | 'low';
  recommended_training?: string;
}

export interface SkillGapsData {
  skills: SkillLevel[];
  overall_score: number;
  recommendations: string[];
}

export interface SkillGapsChartProps {
  userId?: number;
  compact?: boolean;
}

const performanceApi = {
  getSkillGaps: (userId?: number) =>
    apiClient.get('/api/performance/skill-gaps', { params: { user_id: userId } }),
};

const PRIORITY_CONFIG = {
  high: { color: '#ff4d4f', label: 'High Priority' },
  medium: { color: '#faad14', label: 'Medium Priority' },
  low: { color: '#52c41a', label: 'Low Priority' },
};

export function SkillGapsChart({ userId, compact = false }: SkillGapsChartProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'skill-gaps', userId],
    queryFn: () => performanceApi.getSkillGaps(userId).then((r) => r.data),
  });

  const skillData: SkillGapsData = data?.data || {
    skills: [],
    overall_score: 0,
    recommendations: [],
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (skillData.skills.length === 0) {
    return (
      <Card
        title={
          <Space>
            <RadarChartOutlined style={{ color: '#1677ff' }} />
            {t('performance.skill_gaps', 'Skill Gaps Analysis')}
          </Space>
        }
      >
        <Empty description={t('performance.no_skill_data', 'No skill data available')} />
      </Card>
    );
  }

  // SVG Radar Chart calculations
  const centerX = 150;
  const centerY = 150;
  const maxRadius = 100;
  const skills = skillData.skills;
  const angleStep = (2 * Math.PI) / skills.length;

  const getPoint = (value: number, maxValue: number, index: number) => {
    const normalizedValue = (value / maxValue) * maxRadius;
    const angle = index * angleStep - Math.PI / 2;
    return {
      x: centerX + normalizedValue * Math.cos(angle),
      y: centerY + normalizedValue * Math.sin(angle),
    };
  };

  const currentPath = skills
    .map((skill, i) => {
      const point = getPoint(skill.current_level, skill.max_level, i);
      return `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
    })
    .join(' ') + ' Z';

  const targetPath = skills
    .map((skill, i) => {
      const point = getPoint(skill.target_level, skill.max_level, i);
      return `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
    })
    .join(' ') + ' Z';

  // Grid circles
  const gridLevels = [0.25, 0.5, 0.75, 1];

  const highPriorityGaps = skills.filter((s) => s.priority === 'high');

  if (compact) {
    return (
      <Card
        title={
          <Space>
            <RadarChartOutlined style={{ color: '#1677ff' }} />
            {t('performance.skill_gaps', 'Skill Gaps')}
          </Space>
        }
        size="small"
        extra={
          <Tag color={skillData.overall_score >= 80 ? 'success' : skillData.overall_score >= 60 ? 'warning' : 'error'}>
            {Math.round(skillData.overall_score)}%
          </Tag>
        }
      >
        {highPriorityGaps.length > 0 ? (
          <List
            size="small"
            dataSource={highPriorityGaps.slice(0, 3)}
            renderItem={(skill) => (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Space>
                  <WarningOutlined style={{ color: PRIORITY_CONFIG[skill.priority].color }} />
                  <Text>{skill.skill_name}</Text>
                  <Tag color="error" style={{ fontSize: 10 }}>
                    Gap: {skill.gap}
                  </Tag>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Text type="secondary">{t('performance.no_critical_gaps', 'No critical skill gaps')}</Text>
        )}
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RadarChartOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('performance.skill_gaps_analysis', 'Skill Gaps Analysis')}
          </Title>
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary">{t('performance.overall_score', 'Overall Score')}:</Text>
          <Tag
            color={skillData.overall_score >= 80 ? 'success' : skillData.overall_score >= 60 ? 'warning' : 'error'}
            style={{ fontSize: 14, padding: '4px 12px' }}
          >
            {Math.round(skillData.overall_score)}%
          </Tag>
        </Space>
      }
    >
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Radar Chart */}
        <div style={{ flex: '1 1 300px', minWidth: 300 }}>
          <svg viewBox="0 0 300 300" style={{ width: '100%', maxWidth: 350 }}>
            {/* Background grid circles */}
            {gridLevels.map((level, i) => (
              <circle
                key={i}
                cx={centerX}
                cy={centerY}
                r={maxRadius * level}
                fill="none"
                stroke="#f0f0f0"
                strokeWidth="1"
              />
            ))}

            {/* Grid lines from center to each point */}
            {skills.map((_, i) => {
              const point = getPoint(1, 1, i);
              return (
                <line
                  key={i}
                  x1={centerX}
                  y1={centerY}
                  x2={centerX + (point.x - centerX) * 1.1}
                  y2={centerY + (point.y - centerY) * 1.1}
                  stroke="#f0f0f0"
                  strokeWidth="1"
                />
              );
            })}

            {/* Target area (background) */}
            <path
              d={targetPath}
              fill="rgba(22, 119, 255, 0.1)"
              stroke="#1677ff"
              strokeWidth="2"
              strokeDasharray="5,5"
            />

            {/* Current area */}
            <path
              d={currentPath}
              fill="rgba(82, 196, 26, 0.3)"
              stroke="#52c41a"
              strokeWidth="2"
            />

            {/* Data points */}
            {skills.map((skill, i) => {
              const currentPoint = getPoint(skill.current_level, skill.max_level, i);
              const labelPoint = getPoint(skill.max_level * 1.25, skill.max_level, i);
              const hasGap = skill.gap > 0;

              return (
                <g key={i}>
                  {/* Current level point */}
                  <circle
                    cx={currentPoint.x}
                    cy={currentPoint.y}
                    r="5"
                    fill={hasGap ? PRIORITY_CONFIG[skill.priority].color : '#52c41a'}
                    stroke="#fff"
                    strokeWidth="2"
                  />

                  {/* Skill label */}
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#595959"
                  >
                    {skill.skill_name.length > 12
                      ? skill.skill_name.substring(0, 10) + '...'
                      : skill.skill_name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
            <Space size={4}>
              <div style={{ width: 16, height: 3, backgroundColor: '#52c41a' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('performance.current_level', 'Current')}
              </Text>
            </Space>
            <Space size={4}>
              <div
                style={{
                  width: 16,
                  height: 3,
                  backgroundColor: '#1677ff',
                  backgroundImage: 'linear-gradient(90deg, #1677ff 50%, transparent 50%)',
                  backgroundSize: '6px 3px',
                }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('performance.target_level', 'Target')}
              </Text>
            </Space>
          </div>
        </div>

        {/* Skill Details & Recommendations */}
        <div style={{ flex: '1 1 300px', minWidth: 280 }}>
          {/* Priority Gaps */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              <WarningOutlined style={{ marginRight: 4, color: '#faad14' }} />
              {t('performance.priority_gaps', 'Priority Skill Gaps')}
            </Text>
            <List
              size="small"
              dataSource={skills.filter((s) => s.gap > 0).sort((a, b) => b.gap - a.gap)}
              renderItem={(skill) => (
                <List.Item
                  style={{
                    padding: '8px 12px',
                    backgroundColor: `${PRIORITY_CONFIG[skill.priority].color}08`,
                    borderRadius: 8,
                    marginBottom: 4,
                    border: `1px solid ${PRIORITY_CONFIG[skill.priority].color}20`,
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space>
                        <Text strong>{skill.skill_name}</Text>
                        <Tag
                          color={PRIORITY_CONFIG[skill.priority].color}
                          style={{ fontSize: 10 }}
                        >
                          {skill.priority.toUpperCase()}
                        </Tag>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {skill.current_level} / {skill.target_level}
                      </Text>
                    </div>
                    {skill.recommended_training && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <BulbOutlined style={{ marginRight: 4 }} />
                          {skill.recommended_training}
                        </Text>
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: t('performance.no_gaps', 'All skills at target level!') }}
            />
          </div>

          {/* Recommendations */}
          {skillData.recommendations.length > 0 && (
            <div
              style={{
                padding: 12,
                backgroundColor: '#f6ffed',
                borderRadius: 8,
                border: '1px solid #b7eb8f',
              }}
            >
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                <RiseOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                {t('performance.recommendations', 'Recommendations')}
              </Text>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {skillData.recommendations.map((rec, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 12 }}>{rec}</Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default SkillGapsChart;
