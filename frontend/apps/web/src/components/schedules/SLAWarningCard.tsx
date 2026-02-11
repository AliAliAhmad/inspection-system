import { Card, Typography, Space, Tag, Button, Statistic } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  UserOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { SLAWarning } from '@inspection/shared';
import { RiskIndicator } from './RiskIndicator';

const { Text } = Typography;

export interface SLAWarningCardProps {
  warning: SLAWarning;
  onSchedule?: (equipmentId: number) => void;
  onReassign?: (equipmentId: number) => void;
  onEscalate?: (equipmentId: number) => void;
}

export function SLAWarningCard({
  warning,
  onSchedule,
  onReassign,
  onEscalate,
}: SLAWarningCardProps) {
  const { t } = useTranslation();

  const isUrgent = warning.days_until_due <= 2;
  const isCritical = warning.risk_level === 'critical' || warning.days_until_due <= 0;

  const cardStyle = {
    backgroundColor: isCritical ? '#fff2f0' : isUrgent ? '#fff7e6' : '#fafafa',
    borderColor: isCritical ? '#ffccc7' : isUrgent ? '#ffd591' : '#f0f0f0',
    borderWidth: 2,
    marginBottom: 16,
  };

  return (
    <Card
      size="small"
      style={cardStyle}
      title={
        <Space>
          {isCritical ? (
            <ThunderboltOutlined style={{ color: '#ff4d4f' }} />
          ) : (
            <WarningOutlined style={{ color: isUrgent ? '#fa8c16' : '#faad14' }} />
          )}
          <Text strong>{warning.equipment_name}</Text>
          <RiskIndicator level={warning.risk_level} size="small" />
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Space size="large">
          {/* Days Until Due */}
          <Statistic
            title={t('schedules.ai.daysUntilDue', 'Days Until Due')}
            value={warning.days_until_due}
            valueStyle={{
              fontSize: 24,
              color: warning.days_until_due <= 0 ? '#ff4d4f' : isUrgent ? '#fa8c16' : '#faad14',
            }}
            suffix={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {warning.days_until_due === 1 ? 'day' : 'days'}
              </Text>
            }
          />

          {/* Due Date */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              {t('schedules.ai.dueDate', 'Due Date')}
            </Text>
            <Space>
              <ClockCircleOutlined style={{ color: '#1677ff' }} />
              <Text strong>{new Date(warning.sla_due_date).toLocaleDateString()}</Text>
            </Space>
          </div>

          {/* Assigned Inspector */}
          {warning.assigned_inspector && (
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                {t('schedules.ai.assignedTo', 'Assigned To')}
              </Text>
              <Space>
                <UserOutlined style={{ color: '#722ed1' }} />
                <Text strong>{warning.assigned_inspector}</Text>
              </Space>
            </div>
          )}
        </Space>
      </div>

      {/* Recommendation */}
      {warning.recommended_action && (
        <div
          style={{
            padding: 12,
            backgroundColor: 'rgba(255,255,255,0.8)',
            borderRadius: 8,
            marginBottom: 12,
            border: '1px solid #f0f0f0',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            {t('schedules.ai.recommendedAction', 'Recommended Action')}:
          </Text>
          <Text style={{ fontSize: 13 }}>{warning.recommended_action}</Text>
        </div>
      )}

      {/* Action Buttons */}
      <Space>
        {onSchedule && (
          <Button
            type="primary"
            size="small"
            onClick={() => onSchedule(warning.equipment_id)}
            danger={isCritical}
          >
            {t('schedules.ai.schedule', 'Schedule')}
          </Button>
        )}
        {onReassign && (
          <Button size="small" onClick={() => onReassign(warning.equipment_id)}>
            {t('schedules.ai.reassign', 'Reassign')}
          </Button>
        )}
        {onEscalate && isCritical && (
          <Button
            size="small"
            danger
            onClick={() => onEscalate(warning.equipment_id)}
          >
            {t('schedules.ai.escalate', 'Escalate')}
          </Button>
        )}
      </Space>
    </Card>
  );
}

export default SLAWarningCard;
