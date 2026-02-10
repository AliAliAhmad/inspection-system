import { useState, useMemo } from 'react';
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Space,
  Typography,
  Alert,
  Divider,
  Tag,
  message,
  Spin,
} from 'antd';
import {
  DollarOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { leavesApi, RequestEncashmentPayload, LeaveType, LeaveBalance } from '@inspection/shared';

const { Text, Title } = Typography;

interface EncashmentRequestModalProps {
  open: boolean;
  onClose: () => void;
  userId: number;
  onSuccess?: () => void;
}

export function EncashmentRequestModal({
  open,
  onClose,
  userId,
  onSuccess,
}: EncashmentRequestModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [selectedTypeId, setSelectedTypeId] = useState<number | undefined>();
  const [daysToEncash, setDaysToEncash] = useState<number>(0);

  // Fetch leave types
  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ['leave-types', 'encashable'],
    queryFn: () => leavesApi.listLeaveTypes({ is_active: true }).then((r) => r.data),
    enabled: open,
  });

  const leaveTypes: LeaveType[] = (typesData?.data?.types || []).filter(
    (type) => type.code === 'ANNUAL' || type.is_paid
  );

  // Fetch user's leave balance
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['leaves', 'balance', userId],
    queryFn: () => leavesApi.getLeaveBalance(userId).then((r) => r.data),
    enabled: open,
  });

  const balance: LeaveBalance | null = balanceData?.data?.balance || null;

  // Get available balance for selected type
  const selectedTypeBalance = useMemo(() => {
    if (!selectedTypeId || !balance) return 0;
    const type = leaveTypes.find((t) => t.id === selectedTypeId);
    if (!type) return 0;

    const typeKey = type.code.toLowerCase();
    return balance[typeKey]?.remaining || 0;
  }, [selectedTypeId, balance, leaveTypes]);

  // Check encashment policy
  const encashmentPolicy = useMemo(() => {
    const minBalance = 5; // Minimum balance that must be maintained
    const maxEncashable = Math.max(0, selectedTypeBalance - minBalance);
    const isEligible = selectedTypeBalance > minBalance;

    return {
      minBalance,
      maxEncashable,
      isEligible,
    };
  }, [selectedTypeBalance]);

  const requestMutation = useMutation({
    mutationFn: (payload: RequestEncashmentPayload) => leavesApi.requestEncashment(userId, payload),
    onSuccess: () => {
      message.success(t('leaves.encashmentRequested', 'Encashment request submitted successfully'));
      queryClient.invalidateQueries({ queryKey: ['encashments'] });
      queryClient.invalidateQueries({ queryKey: ['leaves', 'balance'] });
      form.resetFields();
      setSelectedTypeId(undefined);
      setDaysToEncash(0);
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

      if (values.days > encashmentPolicy.maxEncashable) {
        message.error(
          t('leaves.exceedsEncashableLimit', 'Amount exceeds maximum encashable days')
        );
        return;
      }

      const payload: RequestEncashmentPayload = {
        leave_type_id: values.leave_type_id,
        days: values.days,
      };

      requestMutation.mutate(payload);
    } catch {
      // Validation failed
    }
  };

  const handleClose = () => {
    form.resetFields();
    setSelectedTypeId(undefined);
    setDaysToEncash(0);
    onClose();
  };

  const handleTypeChange = (typeId: number) => {
    setSelectedTypeId(typeId);
    form.setFieldValue('days', undefined);
    setDaysToEncash(0);
  };

  const isLoading = typesLoading || balanceLoading;

  return (
    <Modal
      title={
        <Space>
          <DollarOutlined style={{ color: '#52c41a' }} />
          {t('leaves.requestEncashment', 'Request Leave Encashment')}
        </Space>
      }
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={requestMutation.isPending}
      okText={t('common.submit', 'Submit Request')}
      okButtonProps={{
        disabled: !encashmentPolicy.isEligible || daysToEncash <= 0,
      }}
      width={500}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Alert
            message={t('leaves.encashmentInfo', 'Leave Encashment')}
            description={t(
              'leaves.encashmentDescription',
              'Convert your unused leave balance into monetary compensation. A minimum balance of {{min}} days must be maintained.',
              { min: encashmentPolicy.minBalance }
            )}
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 24 }}
          />

          <Form form={form} layout="vertical">
            <Form.Item
              name="leave_type_id"
              label={t('leaves.leaveType', 'Leave Type')}
              rules={[{ required: true, message: t('leaves.selectType', 'Please select a leave type') }]}
            >
              <Select
                placeholder={t('leaves.selectType', 'Select leave type')}
                onChange={handleTypeChange}
              >
                {leaveTypes.map((type) => {
                  const typeKey = type.code.toLowerCase();
                  const typeBalance = balance?.[typeKey]?.remaining || 0;
                  const isEncashable = typeBalance > encashmentPolicy.minBalance;

                  return (
                    <Select.Option
                      key={type.id}
                      value={type.id}
                      disabled={!isEncashable}
                    >
                      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Space>
                          <Tag color={type.color || 'default'}>{type.name}</Tag>
                        </Space>
                        <Space>
                          <Text type="secondary">
                            {t('leaves.available', 'Available')}: {typeBalance} {t('leaves.days', 'days')}
                          </Text>
                          {!isEncashable && (
                            <Tag color="error" style={{ fontSize: 10 }}>
                              {t('leaves.insufficientBalance', 'Insufficient')}
                            </Tag>
                          )}
                        </Space>
                      </Space>
                    </Select.Option>
                  );
                })}
              </Select>
            </Form.Item>

            {selectedTypeId && (
              <>
                {/* Balance Info */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: '#f6ffed',
                    borderRadius: 8,
                    marginBottom: 16,
                    border: '1px solid #b7eb8f',
                  }}
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Text>{t('leaves.currentBalance', 'Current Balance')}:</Text>
                      <Text strong>{selectedTypeBalance} {t('leaves.days', 'days')}</Text>
                    </Space>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Text>{t('leaves.minMaintain', 'Minimum to Maintain')}:</Text>
                      <Text>{encashmentPolicy.minBalance} {t('leaves.days', 'days')}</Text>
                    </Space>
                    <Divider style={{ margin: '8px 0' }} />
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Text strong style={{ color: '#52c41a' }}>
                        {t('leaves.maxEncashable', 'Maximum Encashable')}:
                      </Text>
                      <Text strong style={{ color: '#52c41a' }}>
                        {encashmentPolicy.maxEncashable} {t('leaves.days', 'days')}
                      </Text>
                    </Space>
                  </Space>
                </div>

                <Form.Item
                  name="days"
                  label={t('leaves.daysToEncash', 'Days to Encash')}
                  rules={[
                    { required: true, message: t('leaves.enterDays', 'Please enter number of days') },
                    {
                      validator: (_, value) => {
                        if (value && value > encashmentPolicy.maxEncashable) {
                          return Promise.reject(
                            t('leaves.exceedsMax', 'Cannot exceed maximum encashable days')
                          );
                        }
                        if (value && value < 1) {
                          return Promise.reject(t('leaves.minOneDays', 'Minimum 1 day required'));
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <InputNumber
                    min={1}
                    max={encashmentPolicy.maxEncashable}
                    style={{ width: '100%' }}
                    placeholder={`Max: ${encashmentPolicy.maxEncashable}`}
                    onChange={(value) => setDaysToEncash(value || 0)}
                  />
                </Form.Item>

                {/* Balance after encashment */}
                {daysToEncash > 0 && (
                  <div
                    style={{
                      padding: 12,
                      backgroundColor: '#f5f5f5',
                      borderRadius: 8,
                      marginBottom: 16,
                    }}
                  >
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <Text>
                        {t('leaves.balanceAfter', 'Balance after encashment')}:{' '}
                        <Text strong>{selectedTypeBalance - daysToEncash} {t('leaves.days', 'days')}</Text>
                      </Text>
                    </Space>
                  </div>
                )}
              </>
            )}
          </Form>

          {!encashmentPolicy.isEligible && selectedTypeId && (
            <Alert
              message={t('leaves.notEligible', 'Not Eligible for Encashment')}
              description={t(
                'leaves.notEligibleDescription',
                'Your current balance does not meet the minimum requirement for encashment. You need at least {{required}} days to request encashment.',
                { required: encashmentPolicy.minBalance + 1 }
              )}
              type="warning"
              showIcon
              icon={<WarningOutlined />}
            />
          )}

          <Divider style={{ margin: '16px 0' }} />

          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            <Text type="secondary">
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              {t('leaves.encashmentNote', 'Notes:')}
            </Text>
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              <li>
                {t('leaves.encashmentNote1', 'Encashment requests require HR/Admin approval')}
              </li>
              <li>
                {t('leaves.encashmentNote2', 'Payment is processed after approval')}
              </li>
              <li>
                {t('leaves.encashmentNote3', 'Encashed days will be deducted from your balance')}
              </li>
            </ul>
          </div>
        </>
      )}
    </Modal>
  );
}

export default EncashmentRequestModal;
