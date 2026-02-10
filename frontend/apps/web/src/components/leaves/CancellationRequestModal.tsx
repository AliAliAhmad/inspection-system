import { useMemo } from 'react';
import {
  Modal,
  Form,
  Input,
  Space,
  Typography,
  Alert,
  Tag,
  Divider,
  message,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  CloseCircleOutlined,
  CalendarOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { leavesApi, Leave, LeaveCancellationPayload } from '@inspection/shared';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface CancellationRequestModalProps {
  open: boolean;
  onClose: () => void;
  leave?: Leave | null;
  leaveId?: number;
  onSuccess?: () => void;
}

export function CancellationRequestModal({
  open,
  onClose,
  leave: leaveProp,
  leaveId,
  onSuccess,
}: CancellationRequestModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  // Fetch leave data if leaveId is provided
  const { data: fetchedLeaveData, isLoading } = useQuery({
    queryKey: ['leaves', 'detail', leaveId],
    queryFn: () => leavesApi.get(leaveId!).then(r => r.data),
    enabled: !leaveProp && !!leaveId && open,
  });

  const leave = leaveProp || fetchedLeaveData?.data || null;

  // Calculate if the leave has started
  const leaveStatus = useMemo(() => {
    if (!leave) return null;

    const today = dayjs();
    const startDate = dayjs(leave.date_from);
    const endDate = dayjs(leave.date_to);

    if (today.isBefore(startDate)) {
      return {
        status: 'future',
        label: t('leaves.leaveNotStarted', 'Not Started'),
        color: 'blue',
        canCancel: true,
        daysUntil: startDate.diff(today, 'day'),
      };
    } else if (today.isAfter(endDate)) {
      return {
        status: 'past',
        label: t('leaves.leaveEnded', 'Ended'),
        color: 'default',
        canCancel: false,
        daysPast: today.diff(endDate, 'day'),
      };
    } else {
      return {
        status: 'ongoing',
        label: t('leaves.leaveOngoing', 'In Progress'),
        color: 'orange',
        canCancel: true,
        daysRemaining: endDate.diff(today, 'day') + 1,
      };
    }
  }, [leave, t]);

  // Calculate balance restoration
  const balanceRestoration = useMemo(() => {
    if (!leave || !leaveStatus) return null;

    if (leaveStatus.status === 'past') {
      return {
        daysToRestore: 0,
        message: t('leaves.noRestorationPast', 'No days can be restored for past leaves.'),
      };
    }

    if (leaveStatus.status === 'future') {
      return {
        daysToRestore: leave.total_days,
        message: t('leaves.fullRestoration', 'All {{days}} days will be restored to your balance.', {
          days: leave.total_days,
        }),
      };
    }

    // Ongoing leave - only restore remaining days
    const daysUsed = dayjs().diff(dayjs(leave.date_from), 'day');
    const daysToRestore = Math.max(0, leave.total_days - daysUsed);

    return {
      daysToRestore,
      daysUsed,
      message: t(
        'leaves.partialRestoration',
        '{{restore}} days will be restored. {{used}} days already used.',
        { restore: daysToRestore, used: daysUsed }
      ),
    };
  }, [leave, leaveStatus, t]);

  const cancelMutation = useMutation({
    mutationFn: (payload: LeaveCancellationPayload) =>
      leavesApi.requestCancellation(leave!.id, payload),
    onSuccess: () => {
      message.success(t('leaves.cancellationRequested', 'Cancellation request submitted'));
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      form.resetFields();
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      cancelMutation.mutate({ reason: values.reason });
    } catch {
      // Validation failed
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  if (!leaveProp && leaveId && isLoading) {
    return (
      <Modal open={open} onCancel={onClose} footer={null}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Modal>
    );
  }

  if (!leave) return null;

  return (
    <Modal
      title={
        <Space>
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          {t('leaves.requestCancellation', 'Request Leave Cancellation')}
        </Space>
      }
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={cancelMutation.isPending}
      okText={t('leaves.submitCancellation', 'Submit Cancellation Request')}
      okButtonProps={{
        danger: true,
        disabled: !leaveStatus?.canCancel,
      }}
      width={550}
    >
      {/* Leave Details */}
      <div
        style={{
          padding: 16,
          backgroundColor: '#f5f5f5',
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Space direction="vertical" size={4}>
              <Text type="secondary">{t('leaves.leaveType', 'Leave Type')}</Text>
              <Tag color="blue">{t(`leaves.type.${leave.leave_type}`, leave.leave_type)}</Tag>
            </Space>
          </Col>
          <Col span={12}>
            <Space direction="vertical" size={4}>
              <Text type="secondary">{t('leaves.status', 'Status')}</Text>
              <Tag color={leaveStatus?.color}>{leaveStatus?.label}</Tag>
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        <Row gutter={16}>
          <Col span={12}>
            <Space direction="vertical" size={4}>
              <Text type="secondary">{t('leaves.period', 'Period')}</Text>
              <Space>
                <CalendarOutlined />
                <Text>
                  {dayjs(leave.date_from).format('MMM D')} - {dayjs(leave.date_to).format('MMM D, YYYY')}
                </Text>
              </Space>
            </Space>
          </Col>
          <Col span={12}>
            <Space direction="vertical" size={4}>
              <Text type="secondary">{t('leaves.duration', 'Duration')}</Text>
              <Text strong>
                {leave.total_days} {t('leaves.days', 'days')}
              </Text>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Cannot Cancel Warning */}
      {!leaveStatus?.canCancel && (
        <Alert
          type="error"
          message={t('leaves.cannotCancel', 'Cannot Cancel This Leave')}
          description={t(
            'leaves.cannotCancelDescription',
            'This leave has already ended and cannot be cancelled. Contact HR for any adjustments.'
          )}
          showIcon
          icon={<CloseCircleOutlined />}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Policy Warning */}
      {leaveStatus?.canCancel && (
        <Alert
          type="warning"
          message={t('leaves.cancellationPolicy', 'Cancellation Policy')}
          description={
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li>
                {t('leaves.policyNote1', 'Cancellation requests require manager approval')}
              </li>
              <li>
                {t(
                  'leaves.policyNote2',
                  'Last-minute cancellations (within 24 hours) may be subject to review'
                )}
              </li>
              <li>
                {t('leaves.policyNote3', 'Repeated cancellations may affect future leave approvals')}
              </li>
            </ul>
          }
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Balance Restoration Info */}
      {balanceRestoration && leaveStatus?.canCancel && (
        <div
          style={{
            padding: 12,
            backgroundColor: '#f6ffed',
            borderRadius: 8,
            marginBottom: 24,
            border: '1px solid #b7eb8f',
          }}
        >
          <Space>
            <SwapOutlined style={{ color: '#52c41a' }} />
            <div>
              <Text strong style={{ color: '#52c41a' }}>
                {t('leaves.balanceRestoration', 'Balance Restoration')}
              </Text>
              <Paragraph style={{ margin: 0, fontSize: 13 }}>
                {balanceRestoration.message}
              </Paragraph>
            </div>
          </Space>
          {balanceRestoration.daysToRestore > 0 && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <Title level={3} style={{ margin: 0, color: '#52c41a' }}>
                +{balanceRestoration.daysToRestore} {t('leaves.days', 'days')}
              </Title>
            </div>
          )}
        </div>
      )}

      {/* Cancellation Reason Form */}
      {leaveStatus?.canCancel && (
        <Form form={form} layout="vertical">
          <Form.Item
            name="reason"
            label={t('leaves.cancellationReason', 'Reason for Cancellation')}
            rules={[
              {
                required: true,
                message: t('leaves.enterCancellationReason', 'Please provide a reason for cancellation'),
              },
              {
                min: 10,
                message: t('leaves.reasonMinLength', 'Reason must be at least 10 characters'),
              },
            ]}
          >
            <TextArea
              rows={3}
              placeholder={t(
                'leaves.cancellationReasonPlaceholder',
                'e.g., Plans changed due to personal circumstances...'
              )}
            />
          </Form.Item>
        </Form>
      )}

      {/* Additional Info */}
      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
        <Space>
          <InfoCircleOutlined />
          <Text type="secondary">
            {leave.coverage_user && (
              <>
                {t('leaves.coverageAssigned', 'Coverage assigned to')}: {leave.coverage_user.full_name}.{' '}
                {t('leaves.coverageNotified', 'They will be notified of the cancellation.')}
              </>
            )}
          </Text>
        </Space>
      </div>
    </Modal>
  );
}

export default CancellationRequestModal;
