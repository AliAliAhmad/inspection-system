import React from 'react';
import {
  Card,
  Checkbox,
  Radio,
  Space,
  Typography,
  Row,
  Col,
  Tag,
  Divider,
  Tooltip,
} from 'antd';
import {
  SunOutlined,
  CloudOutlined,
  MoonOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { RoutineShiftType, RoutineDayOfWeek, RoutineFrequencyType } from '@inspection/shared';

const { Text } = Typography;

interface ShiftDaySelectorProps {
  shift: RoutineShiftType | null;
  daysOfWeek: RoutineDayOfWeek[];
  frequency: RoutineFrequencyType;
  onShiftChange: (shift: RoutineShiftType | null) => void;
  onDaysChange: (days: RoutineDayOfWeek[]) => void;
  onFrequencyChange: (frequency: RoutineFrequencyType) => void;
  disabled?: boolean;
}

const DAYS: { key: RoutineDayOfWeek; label: string; short: string }[] = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
];

const SHIFTS: { key: RoutineShiftType; label: string; icon: React.ReactNode; color: string; time: string }[] = [
  { key: 'morning', label: 'Morning', icon: <SunOutlined />, color: '#faad14', time: '6:00 AM - 2:00 PM' },
  { key: 'afternoon', label: 'Afternoon', icon: <CloudOutlined />, color: '#1890ff', time: '2:00 PM - 10:00 PM' },
  { key: 'night', label: 'Night', icon: <MoonOutlined />, color: '#722ed1', time: '10:00 PM - 6:00 AM' },
];

export const ShiftDaySelector: React.FC<ShiftDaySelectorProps> = ({
  shift,
  daysOfWeek,
  frequency,
  onShiftChange,
  onDaysChange,
  onFrequencyChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const handleDayToggle = (day: RoutineDayOfWeek) => {
    if (disabled) return;
    if (daysOfWeek.includes(day)) {
      onDaysChange(daysOfWeek.filter((d) => d !== day));
    } else {
      onDaysChange([...daysOfWeek, day]);
    }
  };

  const selectAllWeekdays = () => {
    if (disabled) return;
    onDaysChange(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  };

  const selectAllDays = () => {
    if (disabled) return;
    onDaysChange(DAYS.map((d) => d.key));
  };

  const clearDays = () => {
    if (disabled) return;
    onDaysChange([]);
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      {/* Frequency Selection */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          <CalendarOutlined style={{ marginRight: 8 }} />
          {t('routines.frequency', 'Frequency')}
        </Text>
        <Radio.Group
          value={frequency}
          onChange={(e) => onFrequencyChange(e.target.value)}
          disabled={disabled}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="daily">
            {t('routines.daily', 'Daily')}
          </Radio.Button>
          <Radio.Button value="weekly">
            {t('routines.weekly', 'Weekly')}
          </Radio.Button>
          <Radio.Button value="monthly">
            {t('routines.monthly', 'Monthly')}
          </Radio.Button>
        </Radio.Group>
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {frequency === 'daily' && t('routines.dailyDesc', 'Runs every day on selected shift')}
          {frequency === 'weekly' && t('routines.weeklyDesc', 'Runs on selected days each week')}
          {frequency === 'monthly' && t('routines.monthlyDesc', 'Runs once per month on first occurrence')}
        </Text>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Shift Selection */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('routines.shift', 'Shift')}
        </Text>
        <Row gutter={[12, 12]}>
          {SHIFTS.map((s) => (
            <Col key={s.key} xs={24} sm={8}>
              <Card
                size="small"
                hoverable={!disabled}
                onClick={() => !disabled && onShiftChange(shift === s.key ? null : s.key)}
                style={{
                  borderColor: shift === s.key ? s.color : undefined,
                  backgroundColor: shift === s.key ? `${s.color}10` : undefined,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 24,
                      color: shift === s.key ? s.color : '#8c8c8c',
                      marginBottom: 4,
                    }}
                  >
                    {s.icon}
                  </div>
                  <Text strong style={{ color: shift === s.key ? s.color : undefined }}>
                    {t(`routines.${s.key}`, s.label)}
                  </Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {s.time}
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
        {!shift && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {t('routines.noShiftSelected', 'No shift selected - routine will run at any time')}
          </Text>
        )}
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Days of Week Selection (visible for weekly frequency) */}
      {frequency === 'weekly' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>
              {t('routines.daysOfWeek', 'Days of Week')}
            </Text>
            <Space size="small">
              <Tag
                style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                onClick={selectAllWeekdays}
              >
                {t('routines.weekdays', 'Weekdays')}
              </Tag>
              <Tag
                style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                onClick={selectAllDays}
              >
                {t('routines.allDays', 'All')}
              </Tag>
              <Tag
                style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                onClick={clearDays}
              >
                {t('routines.clear', 'Clear')}
              </Tag>
            </Space>
          </div>
          <Row gutter={[8, 8]}>
            {DAYS.map((day) => {
              const isSelected = daysOfWeek.includes(day.key);
              const isWeekend = day.key === 'saturday' || day.key === 'sunday';
              return (
                <Col key={day.key} xs={12} sm={6} md={24 / 7}>
                  <Tooltip title={t(`days.${day.key}`, day.label)}>
                    <Card
                      size="small"
                      hoverable={!disabled}
                      onClick={() => handleDayToggle(day.key)}
                      style={{
                        textAlign: 'center',
                        borderColor: isSelected ? '#1890ff' : isWeekend ? '#ff4d4f20' : undefined,
                        backgroundColor: isSelected ? '#e6f7ff' : isWeekend ? '#fff1f0' : undefined,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.6 : 1,
                      }}
                      bodyStyle={{ padding: '8px 4px' }}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={disabled}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        strong={isSelected}
                        type={isWeekend && !isSelected ? 'secondary' : undefined}
                      >
                        {day.short}
                      </Text>
                    </Card>
                  </Tooltip>
                </Col>
              );
            })}
          </Row>
          {daysOfWeek.length === 0 && (
            <Text type="warning" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              {t('routines.noDaysSelected', 'Please select at least one day for weekly routines')}
            </Text>
          )}
        </div>
      )}

      {/* Summary */}
      <Divider style={{ margin: '12px 0' }} />
      <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: 4 }}>
        <Text strong>{t('routines.scheduleSummary', 'Schedule Summary')}: </Text>
        <Text>
          {frequency === 'daily' && (
            <>
              {t('routines.runsEveryDay', 'Runs every day')}
              {shift && ` ${t('routines.during', 'during')} ${t(`routines.${shift}`, shift)} ${t('routines.shift', 'shift')}`}
            </>
          )}
          {frequency === 'weekly' && (
            <>
              {daysOfWeek.length > 0
                ? `${t('routines.runsOn', 'Runs on')} ${daysOfWeek.map((d) => t(`days.${d}`, d)).join(', ')}`
                : t('routines.noDaysConfigured', 'No days configured')}
              {shift && ` ${t('routines.during', 'during')} ${t(`routines.${shift}`, shift)} ${t('routines.shift', 'shift')}`}
            </>
          )}
          {frequency === 'monthly' && (
            <>
              {t('routines.runsMonthly', 'Runs once per month')}
              {shift && ` ${t('routines.during', 'during')} ${t(`routines.${shift}`, shift)} ${t('routines.shift', 'shift')}`}
            </>
          )}
        </Text>
      </div>
    </Card>
  );
};

export default ShiftDaySelector;
