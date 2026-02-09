import { Button, Space, Tooltip, Popconfirm } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  StarOutlined,
  UserAddOutlined,
  EditOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Notification } from '@inspection/shared';

export interface NotificationQuickActionsProps {
  notification: Notification;
  onApprove?: () => void;
  onReject?: () => void;
  onView?: () => void;
  onRate?: () => void;
  onAssign?: () => void;
  onEdit?: () => void;
  onSubmit?: () => void;
  loading?: {
    approve?: boolean;
    reject?: boolean;
    view?: boolean;
    rate?: boolean;
    assign?: boolean;
    edit?: boolean;
    submit?: boolean;
  };
  size?: 'small' | 'middle' | 'large';
  showLabels?: boolean;
}

interface ActionConfig {
  key: string;
  icon: React.ReactNode;
  label: string;
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  danger?: boolean;
  confirmTitle?: string;
  handler?: () => void;
}

const NOTIFICATION_TYPE_ACTIONS: Record<string, string[]> = {
  leave_requested: ['approve', 'reject', 'view'],
  leave_approved: ['view'],
  leave_rejected: ['view'],
  inspection_submitted: ['view', 'rate'],
  inspection_assigned: ['view'],
  defect_created: ['assign', 'view'],
  defect_assigned: ['view'],
  specialist_job_assigned: ['view'],
  specialist_job_completed: ['view', 'rate'],
  engineer_job_created: ['view'],
  engineer_job_completed: ['view'],
  quality_review_pending: ['view', 'approve', 'reject'],
  assessment_submitted: ['view'],
  bonus_star_requested: ['approve', 'reject', 'view'],
  work_plan_published: ['view'],
  equipment_alert: ['view', 'assign'],
  mention: ['view'],
  system: ['view'],
};

export function NotificationQuickActions({
  notification,
  onApprove,
  onReject,
  onView,
  onRate,
  onAssign,
  onEdit,
  onSubmit,
  loading = {},
  size = 'small',
  showLabels = false,
}: NotificationQuickActionsProps) {
  const { t } = useTranslation();

  const allActions: Record<string, ActionConfig> = {
    approve: {
      key: 'approve',
      icon: <CheckOutlined />,
      label: t('common.approve', 'Approve'),
      type: 'primary',
      confirmTitle: t('notifications.confirmApprove', 'Are you sure you want to approve?'),
      handler: onApprove,
    },
    reject: {
      key: 'reject',
      icon: <CloseOutlined />,
      label: t('common.reject', 'Reject'),
      danger: true,
      confirmTitle: t('notifications.confirmReject', 'Are you sure you want to reject?'),
      handler: onReject,
    },
    view: {
      key: 'view',
      icon: <EyeOutlined />,
      label: t('common.view', 'View'),
      handler: onView,
    },
    rate: {
      key: 'rate',
      icon: <StarOutlined />,
      label: t('common.rate', 'Rate'),
      handler: onRate,
    },
    assign: {
      key: 'assign',
      icon: <UserAddOutlined />,
      label: t('common.assign', 'Assign'),
      handler: onAssign,
    },
    edit: {
      key: 'edit',
      icon: <EditOutlined />,
      label: t('common.edit', 'Edit'),
      handler: onEdit,
    },
    submit: {
      key: 'submit',
      icon: <SendOutlined />,
      label: t('common.submit', 'Submit'),
      type: 'primary',
      handler: onSubmit,
    },
  };

  const actionKeys = NOTIFICATION_TYPE_ACTIONS[notification.type] || ['view'];
  const actions = actionKeys
    .map((key) => allActions[key])
    .filter((action) => action && action.handler);

  if (actions.length === 0) {
    return null;
  }

  return (
    <Space size="small" wrap>
      {actions.map((action) => {
        const button = (
          <Button
            key={action.key}
            type={action.type || 'default'}
            danger={action.danger}
            icon={action.icon}
            size={size}
            loading={loading[action.key as keyof typeof loading]}
            onClick={action.confirmTitle ? undefined : action.handler}
          >
            {showLabels && action.label}
          </Button>
        );

        if (action.confirmTitle) {
          return (
            <Popconfirm
              key={action.key}
              title={action.confirmTitle}
              onConfirm={action.handler}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
            >
              {showLabels ? (
                button
              ) : (
                <Tooltip title={action.label}>{button}</Tooltip>
              )}
            </Popconfirm>
          );
        }

        return showLabels ? (
          button
        ) : (
          <Tooltip key={action.key} title={action.label}>
            {button}
          </Tooltip>
        );
      })}
    </Space>
  );
}

export default NotificationQuickActions;
