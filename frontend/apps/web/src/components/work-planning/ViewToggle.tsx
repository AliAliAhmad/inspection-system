import React from 'react';
import { Segmented } from 'antd';
import { BarChartOutlined, CalendarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export type ViewMode = 'timeline' | 'calendar';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <Segmented
      value={value}
      onChange={(val) => onChange(val as ViewMode)}
      options={[
        {
          label: (
            <span>
              <BarChartOutlined /> Timeline
            </span>
          ),
          value: 'timeline',
        },
        {
          label: (
            <span>
              <CalendarOutlined /> Calendar
            </span>
          ),
          value: 'calendar',
        },
      ]}
    />
  );
};

export default ViewToggle;
