/**
 * Overdue Management Page (Web)
 * Manages overdue inspections, defects, and reviews.
 * Features AI-detected patterns, calendar view, and bulk rescheduling.
 */
import { useState } from 'react';
import {
  Card,
  Tabs,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Drawer,
  FloatButton,
  Badge,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  FileSearchOutlined,
  BugOutlined,
  AuditOutlined,
  RobotOutlined,
  CalendarOutlined,
  ReloadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  OverdueDashboard,
  AgingBuckets,
  OverdueTable,
  BulkRescheduleModal,
  OverduePatternCard,
  OverdueCalendar,
} from '../../components/overdue';
import type { OverdueItem, OverdueItemType, AgingBucket } from '../../components/overdue';

const { Title } = Typography;

export default function OverduePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedBucket, setSelectedBucket] = useState<AgingBucket | null>(null);
  const [selectedItems, setSelectedItems] = useState<OverdueItem[]>([]);
  const [bulkRescheduleOpen, setBulkRescheduleOpen] = useState(false);
  const [patternsDrawerOpen, setPatternsDrawerOpen] = useState(false);
  const [calendarDrawerOpen, setCalendarDrawerOpen] = useState(false);

  // Fetch overdue summary data
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['overdue', 'summary'],
    queryFn: async () => {
      // This would call the overdue API endpoint
      return {
        inspections: { count: 12, oldest_days: 15 },
        defects: { count: 8, oldest_days: 22 },
        reviews: { count: 5, oldest_days: 7 },
        total: 25,
      };
    },
  });

  // Fetch aging buckets
  const { data: bucketsData } = useQuery({
    queryKey: ['overdue', 'aging-buckets'],
    queryFn: async () => {
      return [
        { label: '1-7 days', key: '1-7', min_days: 1, max_days: 7, count: 8, color: '#52c41a' },
        { label: '8-14 days', key: '8-14', min_days: 8, max_days: 14, count: 5, color: '#fadb14' },
        { label: '15-30 days', key: '15-30', min_days: 15, max_days: 30, count: 4, color: '#faad14' },
        { label: '31-60 days', key: '31-60', min_days: 31, max_days: 60, count: 2, color: '#fa8c16' },
        { label: '60+ days', key: '60+', min_days: 60, max_days: null, count: 1, color: '#ff4d4f' },
      ] as AgingBucket[];
    },
  });

  // Fetch pattern count for badge
  const { data: patternsData } = useQuery({
    queryKey: ['overdue', 'patterns-count'],
    queryFn: async () => {
      return { count: 3 };
    },
  });

  // Get type filter based on active tab
  const getTypeFilter = (): OverdueItemType | undefined => {
    switch (activeTab) {
      case 'inspections':
        return 'inspection';
      case 'defects':
        return 'defect';
      case 'reviews':
        return 'review';
      default:
        return undefined;
    }
  };

  // Get bucket filter
  const getBucketFilter = () => {
    if (!selectedBucket) return undefined;
    return {
      min_days: selectedBucket.min_days,
      max_days: selectedBucket.max_days,
    };
  };

  const handleBucketClick = (bucket: AgingBucket | null) => {
    setSelectedBucket(bucket === selectedBucket ? null : bucket);
  };

  const handleViewItem = (item: OverdueItem) => {
    // Navigate to item detail page based on type
    message.info(`${t('common.view', 'View')} ${item.type}: ${item.title}`);
  };

  const handleRescheduleItem = (item: OverdueItem) => {
    setSelectedItems([item]);
    setBulkRescheduleOpen(true);
  };

  const handleBulkReschedule = (items: OverdueItem[]) => {
    setSelectedItems(items);
    setBulkRescheduleOpen(true);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['overdue'] });
  };

  const handleExport = () => {
    message.info(t('overdue.export_started', 'Export started...'));
    // Would trigger export API call
  };

  // Tab items
  const tabItems = [
    {
      key: 'all',
      label: (
        <Space>
          <ClockCircleOutlined />
          {t('overdue.all', 'All')}
          <Badge count={summaryData?.total || 0} style={{ marginLeft: 4 }} />
        </Space>
      ),
    },
    {
      key: 'inspections',
      label: (
        <Space>
          <FileSearchOutlined />
          {t('overdue.inspections', 'Inspections')}
          <Badge count={summaryData?.inspections.count || 0} style={{ marginLeft: 4 }} />
        </Space>
      ),
    },
    {
      key: 'defects',
      label: (
        <Space>
          <BugOutlined />
          {t('overdue.defects', 'Defects')}
          <Badge count={summaryData?.defects.count || 0} style={{ marginLeft: 4 }} />
        </Space>
      ),
    },
    {
      key: 'reviews',
      label: (
        <Space>
          <AuditOutlined />
          {t('overdue.reviews', 'Reviews')}
          <Badge count={summaryData?.reviews.count || 0} style={{ marginLeft: 4 }} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        {/* Header */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <ClockCircleOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />
              {t('overdue.title', 'Overdue Management')}
            </Title>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
              >
                {t('common.refresh', 'Refresh')}
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
              >
                {t('common.export', 'Export')}
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Dashboard */}
        <OverdueDashboard
          summary={summaryData}
          isLoading={summaryLoading}
          onViewCalendar={() => setCalendarDrawerOpen(true)}
          onViewPatterns={() => setPatternsDrawerOpen(true)}
          onBulkReschedule={() => {
            if (selectedItems.length > 0) {
              setBulkRescheduleOpen(true);
            } else {
              message.info(t('overdue.select_items_first', 'Please select items from the table first'));
            }
          }}
        />

        {/* Aging Buckets Chart */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24}>
            <AgingBuckets
              buckets={bucketsData}
              selectedBucket={selectedBucket?.key}
              onBucketClick={handleBucketClick}
            />
          </Col>
        </Row>

        {/* Tabs and Table */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />

        <OverdueTable
          typeFilter={getTypeFilter()}
          bucketFilter={getBucketFilter()}
          onView={handleViewItem}
          onReschedule={handleRescheduleItem}
          onBulkReschedule={handleBulkReschedule}
          selectedItems={selectedItems}
          onSelectionChange={setSelectedItems}
        />
      </Card>

      {/* Floating Action Buttons */}
      <FloatButton.Group shape="circle" style={{ right: 24 }}>
        <FloatButton
          icon={<RobotOutlined />}
          tooltip={t('overdue.ai_patterns', 'AI Patterns')}
          onClick={() => setPatternsDrawerOpen(true)}
          badge={{ count: patternsData?.count || 0, color: '#722ed1' }}
        />
        <FloatButton
          icon={<CalendarOutlined />}
          tooltip={t('overdue.calendar_view', 'Calendar View')}
          onClick={() => setCalendarDrawerOpen(true)}
        />
      </FloatButton.Group>

      {/* Bulk Reschedule Modal */}
      <BulkRescheduleModal
        open={bulkRescheduleOpen}
        onClose={() => {
          setBulkRescheduleOpen(false);
          setSelectedItems([]);
        }}
        items={selectedItems}
        onSuccess={() => {
          setSelectedItems([]);
          queryClient.invalidateQueries({ queryKey: ['overdue'] });
        }}
      />

      {/* AI Patterns Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('overdue.ai_patterns', 'AI-Detected Patterns')}
          </Space>
        }
        placement="right"
        width={500}
        onClose={() => setPatternsDrawerOpen(false)}
        open={patternsDrawerOpen}
      >
        <OverduePatternCard
          onPatternClick={(pattern) => {
            message.info(`${t('overdue.pattern', 'Pattern')}: ${pattern.title}`);
          }}
        />
      </Drawer>

      {/* Calendar Drawer */}
      <Drawer
        title={
          <Space>
            <CalendarOutlined style={{ color: '#1890ff' }} />
            {t('overdue.calendar_view', 'Calendar View')}
          </Space>
        }
        placement="right"
        width={900}
        onClose={() => setCalendarDrawerOpen(false)}
        open={calendarDrawerOpen}
      >
        <OverdueCalendar
          onItemClick={handleViewItem}
          onDateClick={(date, items) => {
            message.info(
              t('overdue.items_on_date', '{{count}} items on {{date}}', {
                count: items.length,
                date,
              })
            );
          }}
        />
      </Drawer>
    </div>
  );
}
