import { useState } from 'react';
import {
  Button,
  Space,
  Dropdown,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  SearchOutlined,
  ToolOutlined,
  BarChartOutlined,
  MoreOutlined,
  EditOutlined,
  ExportOutlined,
  SyncOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi } from '@inspection/shared';

const { TextArea } = Input;

interface QuickActionsProps {
  equipmentId: number;
  equipmentName: string;
  currentStatus: string;
  onInspect?: () => void;
  onViewDetails?: () => void;
  onReportIssue?: () => void;
  compact?: boolean;
}

export function EquipmentQuickActions({
  equipmentId,
  equipmentName,
  currentStatus,
  onInspect,
  onViewDetails,
  onReportIssue,
  compact = false,
}: QuickActionsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [form] = Form.useForm();

  const reportIssueMutation = useMutation({
    mutationFn: (values: { status: string; reason: string; next_action: string }) =>
      equipmentApi.updateStatus(equipmentId, values),
    onSuccess: () => {
      message.success(t('equipment.issueReported', 'Issue reported successfully'));
      queryClient.invalidateQueries({ queryKey: ['equipment-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-details', equipmentId] });
      setIssueModalOpen(false);
      form.resetFields();
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const handleReportIssue = () => {
    if (onReportIssue) {
      onReportIssue();
    } else {
      setIssueModalOpen(true);
    }
  };

  const handleSubmitIssue = () => {
    form.validateFields().then((values) => {
      reportIssueMutation.mutate(values);
    });
  };

  const menuItems = [
    {
      key: 'inspect',
      icon: <FileSearchOutlined />,
      label: t('equipment.inspect', 'Start Inspection'),
      onClick: onInspect,
    },
    {
      key: 'issue',
      icon: <ToolOutlined />,
      label: t('equipment.reportIssue', 'Report Issue'),
      onClick: handleReportIssue,
    },
    {
      key: 'details',
      icon: <BarChartOutlined />,
      label: t('equipment.viewDetails', 'View Details'),
      onClick: onViewDetails,
    },
  ];

  if (compact) {
    return (
      <>
        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button type="text" icon={<MoreOutlined />} size="small" />
        </Dropdown>

        <Modal
          title={
            <Space>
              <ToolOutlined />
              {t('equipment.reportIssueFor', 'Report Issue for')} {equipmentName}
            </Space>
          }
          open={issueModalOpen}
          onCancel={() => {
            setIssueModalOpen(false);
            form.resetFields();
          }}
          onOk={handleSubmitIssue}
          confirmLoading={reportIssueMutation.isPending}
          okText={t('common.submit', 'Submit')}
        >
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item
              name="status"
              label={t('equipment.newStatus', 'New Status')}
              rules={[{ required: true }]}
              initialValue={currentStatus === 'active' ? 'under_maintenance' : currentStatus}
            >
              <Select>
                <Select.Option value="under_maintenance">
                  {t('equipment.underMaintenance', 'Under Maintenance')}
                </Select.Option>
                <Select.Option value="paused">{t('equipment.paused', 'Paused')}</Select.Option>
                <Select.Option value="stopped">{t('equipment.stoppedStatus', 'Stopped')}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="reason"
              label={t('equipment.issueDescription', 'Issue Description')}
              rules={[{ required: true, message: t('equipment.issueRequired', 'Please describe the issue') }]}
            >
              <TextArea rows={3} placeholder={t('equipment.describeIssue', 'Describe the issue...')} />
            </Form.Item>
            <Form.Item
              name="next_action"
              label={t('equipment.nextAction', 'Recommended Action')}
              rules={[{ required: true, message: t('equipment.actionRequired', 'Please specify next action') }]}
            >
              <TextArea rows={2} placeholder={t('equipment.nextActionPlaceholder', 'What should be done next...')} />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  return (
    <>
      <Space size={4} wrap>
        <Tooltip title={t('equipment.inspect', 'Start Inspection')}>
          <Button
            type="text"
            size="small"
            icon={<SearchOutlined />}
            onClick={onInspect}
            style={{ fontSize: 11 }}
          >
            Inspect
          </Button>
        </Tooltip>
        <Tooltip title={t('equipment.reportIssue', 'Report Issue')}>
          <Button
            type="text"
            size="small"
            icon={<ToolOutlined />}
            onClick={handleReportIssue}
            style={{ fontSize: 11 }}
          >
            Issue
          </Button>
        </Tooltip>
        <Tooltip title={t('equipment.viewDetails', 'View Details')}>
          <Button
            type="text"
            size="small"
            icon={<BarChartOutlined />}
            onClick={onViewDetails}
            style={{ fontSize: 11 }}
          >
            Details
          </Button>
        </Tooltip>
      </Space>

      <Modal
        title={
          <Space>
            <ToolOutlined />
            {t('equipment.reportIssueFor', 'Report Issue for')} {equipmentName}
          </Space>
        }
        open={issueModalOpen}
        onCancel={() => {
          setIssueModalOpen(false);
          form.resetFields();
        }}
        onOk={handleSubmitIssue}
        confirmLoading={reportIssueMutation.isPending}
        okText={t('common.submit', 'Submit')}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="status"
            label={t('equipment.newStatus', 'New Status')}
            rules={[{ required: true }]}
            initialValue={currentStatus === 'active' ? 'under_maintenance' : currentStatus}
          >
            <Select>
              <Select.Option value="under_maintenance">
                {t('equipment.underMaintenance', 'Under Maintenance')}
              </Select.Option>
              <Select.Option value="paused">{t('equipment.paused', 'Paused')}</Select.Option>
              <Select.Option value="stopped">{t('equipment.stoppedStatus', 'Stopped')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="reason"
            label={t('equipment.issueDescription', 'Issue Description')}
            rules={[{ required: true, message: t('equipment.issueRequired', 'Please describe the issue') }]}
          >
            <TextArea rows={3} placeholder={t('equipment.describeIssue', 'Describe the issue...')} />
          </Form.Item>
          <Form.Item
            name="next_action"
            label={t('equipment.nextAction', 'Recommended Action')}
            rules={[{ required: true, message: t('equipment.actionRequired', 'Please specify next action') }]}
          >
            <TextArea rows={2} placeholder={t('equipment.nextActionPlaceholder', 'What should be done next...')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// Floating Quick Actions Bar for bulk operations
interface BulkActionsBarProps {
  selectedIds: number[];
  onClear: () => void;
  onBulkStatusChange?: () => void;
  onExport?: () => void;
  onCompare?: () => void;
}

export function EquipmentBulkActionsBar({
  selectedIds,
  onClear,
  onBulkStatusChange,
  onExport,
  onCompare,
}: BulkActionsBarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [form] = Form.useForm();

  const bulkUpdateMutation = useMutation({
    mutationFn: (values: { status: string; reason: string; next_action?: string }) =>
      equipmentApi.bulkUpdateStatus(selectedIds, values.status, values.reason, values.next_action),
    onSuccess: () => {
      message.success(t('equipment.bulkUpdateSuccess', 'Equipment status updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['equipment-dashboard'] });
      setStatusModalOpen(false);
      form.resetFields();
      onClear();
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const handleExport = async () => {
    try {
      const res = await equipmentApi.exportEquipment(selectedIds, 'csv');
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `equipment_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success(t('equipment.exportSuccess', 'Export successful'));
      if (onExport) onExport();
    } catch {
      message.error(t('common.error', 'Export failed'));
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#001529',
          padding: '12px 24px',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span style={{ color: '#fff', marginRight: 8 }}>
          {selectedIds.length} {t('equipment.selected', 'selected')}
        </span>
        <Space>
          <Tooltip title={t('equipment.bulkStatusChange', 'Change Status')}>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={onBulkStatusChange || (() => setStatusModalOpen(true))}
            >
              {t('equipment.changeStatus', 'Change Status')}
            </Button>
          </Tooltip>
          <Tooltip title={t('equipment.export', 'Export')}>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              {t('common.export', 'Export')}
            </Button>
          </Tooltip>
          {selectedIds.length >= 2 && (
            <Tooltip title={t('equipment.compare', 'Compare')}>
              <Button icon={<BarChartOutlined />} onClick={onCompare}>
                {t('equipment.compare', 'Compare')}
              </Button>
            </Tooltip>
          )}
          <Button type="text" style={{ color: '#fff' }} onClick={onClear}>
            {t('common.clearSelection', 'Clear')}
          </Button>
        </Space>
      </div>

      <Modal
        title={t('equipment.bulkStatusChange', 'Bulk Status Change')}
        open={statusModalOpen}
        onCancel={() => {
          setStatusModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.validateFields().then((values) => bulkUpdateMutation.mutate(values))}
        confirmLoading={bulkUpdateMutation.isPending}
        okText={t('common.update', 'Update')}
      >
        <p>
          {t('equipment.bulkUpdateDescription', 'Update status for')} <strong>{selectedIds.length}</strong>{' '}
          {t('equipment.equipmentItems', 'equipment items')}
        </p>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="status" label={t('equipment.newStatus', 'New Status')} rules={[{ required: true }]}>
            <Select>
              <Select.Option value="active">{t('equipment.active', 'Active')}</Select.Option>
              <Select.Option value="under_maintenance">
                {t('equipment.underMaintenance', 'Under Maintenance')}
              </Select.Option>
              <Select.Option value="paused">{t('equipment.paused', 'Paused')}</Select.Option>
              <Select.Option value="stopped">{t('equipment.stoppedStatus', 'Stopped')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="reason"
            label={t('equipment.reason', 'Reason')}
            rules={[{ required: true, message: t('equipment.reasonRequired', 'Reason is required') }]}
          >
            <TextArea rows={2} placeholder={t('equipment.reasonPlaceholder', 'Enter reason...')} />
          </Form.Item>
          <Form.Item name="next_action" label={t('equipment.nextAction', 'Next Action (optional)')}>
            <TextArea rows={2} placeholder={t('equipment.nextActionPlaceholder', 'What should be done next...')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default EquipmentQuickActions;
