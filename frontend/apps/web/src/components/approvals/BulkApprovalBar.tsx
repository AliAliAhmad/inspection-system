import { Button, Space, Typography, Popconfirm, Card } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ClearOutlined,
  SelectOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApprovalItem } from './ApprovalCard';

const { Text } = Typography;

export interface BulkApprovalBarProps {
  selectedItems: ApprovalItem[];
  totalItems: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkApprove: (items: ApprovalItem[]) => void;
  onBulkReject: (items: ApprovalItem[]) => void;
  approving?: boolean;
  rejecting?: boolean;
}

export function BulkApprovalBar({
  selectedItems,
  totalItems,
  onSelectAll,
  onDeselectAll,
  onBulkApprove,
  onBulkReject,
  approving,
  rejecting,
}: BulkApprovalBarProps) {
  const { t } = useTranslation();

  if (selectedItems.length === 0) {
    return null;
  }

  const pendingSelected = selectedItems.filter((item) => item.status === 'pending');
  const hasActionableItems = pendingSelected.length > 0;

  return (
    <Card
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        borderRadius: 8,
        minWidth: 400,
      }}
      bodyStyle={{ padding: '12px 24px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <Space>
          <Text strong>
            {selectedItems.length} {t('approvals.itemsSelected', 'items selected')}
          </Text>
          {pendingSelected.length < selectedItems.length && (
            <Text type="secondary">
              ({pendingSelected.length} {t('approvals.pending', 'pending')})
            </Text>
          )}
        </Space>

        <Space>
          {selectedItems.length < totalItems ? (
            <Button
              type="text"
              size="small"
              icon={<SelectOutlined />}
              onClick={onSelectAll}
            >
              {t('approvals.selectAll', 'Select All')}
            </Button>
          ) : (
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={onDeselectAll}
            >
              {t('approvals.deselectAll', 'Deselect All')}
            </Button>
          )}

          <Popconfirm
            title={t('approvals.bulkApproveConfirm', 'Approve {{count}} items?', { count: pendingSelected.length })}
            onConfirm={() => onBulkApprove(pendingSelected)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
            disabled={!hasActionableItems}
          >
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={approving}
              disabled={!hasActionableItems}
            >
              {t('approvals.approveSelected', 'Approve')} ({pendingSelected.length})
            </Button>
          </Popconfirm>

          <Popconfirm
            title={t('approvals.bulkRejectConfirm', 'Reject {{count}} items?', { count: pendingSelected.length })}
            onConfirm={() => onBulkReject(pendingSelected)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
            disabled={!hasActionableItems}
          >
            <Button
              danger
              icon={<CloseOutlined />}
              loading={rejecting}
              disabled={!hasActionableItems}
            >
              {t('approvals.rejectSelected', 'Reject')} ({pendingSelected.length})
            </Button>
          </Popconfirm>

          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={onDeselectAll}
          >
            {t('approvals.cancel', 'Cancel')}
          </Button>
        </Space>
      </div>
    </Card>
  );
}

export default BulkApprovalBar;
