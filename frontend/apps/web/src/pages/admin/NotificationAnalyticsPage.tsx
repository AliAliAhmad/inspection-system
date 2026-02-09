import { useState } from 'react';
import { Breadcrumb, Space, Typography, Button, Dropdown, message } from 'antd';
import { HomeOutlined, BarChartOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { NotificationAnalyticsDashboard } from '../../components/notifications/NotificationAnalyticsDashboard';
import type { MenuProps } from 'antd';

const { Title } = Typography;

export default function NotificationAnalyticsPage() {
  const { t } = useTranslation();
  const [dateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const handleExport = (format: 'csv' | 'pdf') => {
    // Placeholder for export functionality
    message.info(t('notifications.exportStarted', `Exporting analytics as ${format.toUpperCase()}...`));
    // In a real implementation, this would call the API to generate the export
  };

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'csv',
      label: t('common.exportCSV', 'Export as CSV'),
      icon: <FileExcelOutlined />,
      onClick: () => handleExport('csv'),
    },
    {
      key: 'pdf',
      label: t('common.exportPDF', 'Export as PDF'),
      icon: <FilePdfOutlined />,
      onClick: () => handleExport('pdf'),
    },
  ];

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: (
              <Link to="/">
                <HomeOutlined />
              </Link>
            ),
          },
          {
            title: (
              <Space>
                <BarChartOutlined />
                {t('nav.analytics', 'Analytics')}
              </Space>
            ),
          },
          {
            title: t('notifications.analytics', 'Notification Analytics'),
          },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <Space>
            <BarChartOutlined />
            {t('notifications.analyticsTitle', 'Notification Analytics Dashboard')}
          </Space>
        </Title>

        <Dropdown menu={{ items: exportMenuItems }} trigger={['click']}>
          <Button icon={<DownloadOutlined />}>
            {t('common.export', 'Export')}
          </Button>
        </Dropdown>
      </div>

      <NotificationAnalyticsDashboard defaultDateRange={dateRange} />
    </div>
  );
}
