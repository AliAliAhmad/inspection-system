import { Card, Progress, Space, Typography, Tooltip, Tag } from 'antd';
import { TeamOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface CoverageGap {
  role: string;
  required: number;
  available: number;
  shortage: number;
}

export interface CoverageScoreCardProps {
  score: number; // 0-100
  onLeaveCount?: number;
  understaffedDays?: number;
  gaps?: CoverageGap[];
  compact?: boolean;
  onClick?: () => void;
}

export function CoverageScoreCard({
  score,
  onLeaveCount = 0,
  understaffedDays = 0,
  gaps = [],
  compact = false,
  onClick,
}: CoverageScoreCardProps) {
  const { t } = useTranslation();

  const getScoreColor = () => {
    if (score >= 90) return '#52c41a';
    if (score >= 70) return '#faad14';
    return '#ff4d4f';
  };

  const getScoreStatus = (): 'success' | 'normal' | 'exception' => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'normal';
    return 'exception';
  };

  if (compact) {
    return (
      <Tooltip
        title={
          <Space direction="vertical" size={4}>
            <Text style={{ color: 'white' }}>{t('roster.coverageScore', 'Coverage Score')}: {score}%</Text>
            <Text style={{ color: 'white' }}>{t('roster.onLeave', 'On Leave')}: {onLeaveCount}</Text>
            {understaffedDays > 0 && (
              <Text style={{ color: '#ff7875' }}>
                {understaffedDays} {t('roster.understaffedDays', 'understaffed days')}
              </Text>
            )}
          </Space>
        }
      >
        <Space
          style={{ cursor: onClick ? 'pointer' : 'default' }}
          onClick={onClick}
        >
          <Progress
            type="circle"
            percent={score}
            size={40}
            status={getScoreStatus()}
            strokeColor={getScoreColor()}
            format={(percent) => <span style={{ fontSize: 12 }}>{percent}%</span>}
          />
          {understaffedDays > 0 && (
            <Tag color="red" icon={<WarningOutlined />}>
              {understaffedDays}
            </Tag>
          )}
        </Space>
      </Tooltip>
    );
  }

  return (
    <Card
      size="small"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <TeamOutlined style={{ color: getScoreColor() }} />
            <Text strong>{t('roster.coverageScore', 'Coverage Score')}</Text>
          </Space>
          <Progress
            type="circle"
            percent={score}
            size={50}
            status={getScoreStatus()}
            strokeColor={getScoreColor()}
          />
        </Space>

        <Space split={<Text type="secondary">|</Text>}>
          <Space size={4}>
            <Text type="secondary">{t('roster.onLeave', 'On Leave')}:</Text>
            <Text>{onLeaveCount}</Text>
          </Space>
          {understaffedDays > 0 ? (
            <Space size={4}>
              <WarningOutlined style={{ color: '#ff4d4f' }} />
              <Text type="danger">
                {understaffedDays} {t('roster.understaffedDays', 'understaffed')}
              </Text>
            </Space>
          ) : (
            <Space size={4}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text type="success">{t('roster.allSkillsCovered', 'All covered')}</Text>
            </Space>
          )}
        </Space>

        {gaps.length > 0 && (
          <Space wrap size={4}>
            {gaps.slice(0, 3).map((gap, idx) => (
              <Tag key={idx} color="red">
                {gap.role}: -{gap.shortage}
              </Tag>
            ))}
          </Space>
        )}
      </Space>
    </Card>
  );
}
