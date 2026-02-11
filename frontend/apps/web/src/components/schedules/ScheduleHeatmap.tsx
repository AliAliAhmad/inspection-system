import { Card, Calendar, Badge, Typography, Space } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

// Mock data for inspection density
// In a real implementation, this would be fetched from the API
const getMockInspectionCount = (date: Dayjs): number => {
  // Generate consistent pseudo-random count based on date
  const seed = date.date() + date.month() * 31;
  return Math.floor((Math.sin(seed) * 10000) % 12);
};

const getColorByCount = (count: number): string => {
  if (count === 0) return '#f5f5f5';
  if (count <= 2) return '#d9f7be';
  if (count <= 5) return '#95de64';
  if (count <= 8) return '#52c41a';
  return '#237804';
};

export function ScheduleHeatmap() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const dateCellRender = (value: Dayjs) => {
    const count = getMockInspectionCount(value);

    return (
      <div
        style={{
          backgroundColor: getColorByCount(count),
          borderRadius: 4,
          padding: '4px 0',
          minHeight: 60,
          cursor: 'pointer',
          transition: 'all 0.3s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {count > 0 && (
          <div style={{ textAlign: 'center' }}>
            <Badge
              count={count}
              style={{
                backgroundColor: count > 5 ? '#ff4d4f' : '#1677ff',
                fontSize: 10,
              }}
            />
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              {t('schedules.ai.inspections', 'inspections')}
            </div>
          </div>
        )}
      </div>
    );
  };

  const onSelect = (date: Dayjs) => {
    // Navigate to work plan day page
    const formattedDate = date.format('YYYY-MM-DD');
    navigate(`/admin/work-plan/${formattedDate}`);
  };

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('schedules.ai.inspectionHeatmap', 'Inspection Schedule Heatmap')}
          </Title>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('schedules.ai.density', 'Inspection Density')}:
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor: '#f5f5f5',
                border: '1px solid #d9d9d9',
                borderRadius: 4,
              }}
            />
            <Text style={{ fontSize: 11 }}>0</Text>
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor: '#d9f7be',
                borderRadius: 4,
              }}
            />
            <Text style={{ fontSize: 11 }}>1-2</Text>
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor: '#95de64',
                borderRadius: 4,
              }}
            />
            <Text style={{ fontSize: 11 }}>3-5</Text>
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor: '#52c41a',
                borderRadius: 4,
              }}
            />
            <Text style={{ fontSize: 11 }}>6-8</Text>
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor: '#237804',
                borderRadius: 4,
              }}
            />
            <Text style={{ fontSize: 11 }}>9+</Text>
          </div>
        </Space>
      </div>

      <Calendar
        fullscreen={true}
        cellRender={dateCellRender}
        onSelect={onSelect}
        headerRender={({ value, onChange }) => {
          const month = value.month();
          const year = value.year();

          return (
            <div style={{ padding: '10px 20px' }}>
              <Space size="large">
                <select
                  value={month}
                  onChange={(e) => {
                    const newValue = value.clone().month(parseInt(e.target.value));
                    onChange(newValue);
                  }}
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9' }}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {dayjs().month(i).format('MMMM')}
                    </option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => {
                    const newValue = value.clone().year(parseInt(e.target.value));
                    onChange(newValue);
                  }}
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9' }}
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const y = dayjs().year() - 2 + i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </Space>
            </div>
          );
        }}
      />
    </Card>
  );
}

export default ScheduleHeatmap;
