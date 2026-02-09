import { useState } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Input,
  Table,
  Typography,
  message,
  Tag,
  Space,
  Button,
  Steps,
  Alert,
} from 'antd';
import {
  AuditOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { materialsApi, Material, InventoryCountItem } from '@inspection/shared';

const { Text } = Typography;

interface InventoryCountModalProps {
  open: boolean;
  onClose: () => void;
  countId?: number; // If provided, continue existing count
}

interface CountItem {
  material_id: number;
  material_code: string;
  material_name: string;
  system_quantity: number;
  counted_quantity?: number;
  variance?: number;
  notes?: string;
}

export function InventoryCountModal({
  open,
  onClose,
  countId,
}: InventoryCountModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  const [activeCountId, setActiveCountId] = useState<number | undefined>(countId);

  // Fetch materials
  const { data: materialsData, isLoading: materialsLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list({ active_only: true }),
    enabled: !countId,
  });

  // Fetch existing count items if countId provided
  const { data: existingItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory-count-items', countId],
    queryFn: () => materialsApi.getCountItems(countId!),
    enabled: !!countId,
  });

  const materials = materialsData?.data?.materials || [];

  // Create count mutation
  const createCountMutation = useMutation({
    mutationFn: (notes?: string) => materialsApi.createCount({ notes }),
    onSuccess: (response) => {
      const newCountId = response.data?.data?.id;
      if (newCountId) {
        setActiveCountId(newCountId);
        message.success(t('materials.count_started', 'Inventory count started'));
        setCurrentStep(1);
      }
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'An error occurred'));
    },
  });

  // Add count item mutation
  const addItemMutation = useMutation({
    mutationFn: (data: { countId: number; material_id: number; counted_quantity: number; notes?: string }) =>
      materialsApi.addCountItem(data.countId, {
        material_id: data.material_id,
        counted_quantity: data.counted_quantity,
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-count-items'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'An error occurred'));
    },
  });

  // Submit for approval mutation
  const submitMutation = useMutation({
    mutationFn: (countId: number) => materialsApi.approveCount(countId), // This should be a submit endpoint
    onSuccess: () => {
      message.success(t('materials.count_submitted', 'Inventory count submitted for approval'));
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      onClose();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'An error occurred'));
    },
  });

  const handleStartCount = () => {
    const notes = form.getFieldValue('notes');
    createCountMutation.mutate(notes);
  };

  const handleCountedQuantityChange = (materialId: number, countedQty: number) => {
    setCountItems((prev) => {
      const existing = prev.find((item) => item.material_id === materialId);
      const material = materials.find((m) => m.id === materialId);

      if (!material) return prev;

      const newItem: CountItem = {
        material_id: materialId,
        material_code: material.code,
        material_name: material.name,
        system_quantity: material.current_stock,
        counted_quantity: countedQty,
        variance: countedQty - material.current_stock,
      };

      if (existing) {
        return prev.map((item) =>
          item.material_id === materialId ? newItem : item
        );
      } else {
        return [...prev, newItem];
      }
    });

    // Save to backend
    if (activeCountId) {
      addItemMutation.mutate({
        countId: activeCountId,
        material_id: materialId,
        counted_quantity: countedQty,
      });
    }
  };

  const handleSubmitCount = () => {
    if (!activeCountId) return;

    const itemsWithVariance = countItems.filter((item) => item.variance !== 0);
    if (itemsWithVariance.length > 0) {
      Modal.confirm({
        title: t('materials.confirm_variance', 'Confirm Variance'),
        content: (
          <div>
            <p>{t('materials.variance_warning', 'The following items have variances:')}</p>
            <ul>
              {itemsWithVariance.map((item) => (
                <li key={item.material_id}>
                  {item.material_name}: {item.variance! > 0 ? '+' : ''}{item.variance}
                </li>
              ))}
            </ul>
          </div>
        ),
        onOk: () => submitMutation.mutate(activeCountId),
      });
    } else {
      submitMutation.mutate(activeCountId);
    }
  };

  const columns: ColumnsType<Material> = [
    {
      title: t('materials.code', 'Code'),
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('materials.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('materials.system_qty', 'System Qty'),
      dataIndex: 'current_stock',
      key: 'current_stock',
      width: 100,
      align: 'center',
    },
    {
      title: t('materials.counted_qty', 'Counted Qty'),
      key: 'counted_qty',
      width: 130,
      render: (_: any, record: Material) => {
        const countItem = countItems.find((item) => item.material_id === record.id);
        return (
          <InputNumber
            min={0}
            value={countItem?.counted_quantity}
            onChange={(value) => handleCountedQuantityChange(record.id, value || 0)}
            style={{ width: '100%' }}
          />
        );
      },
    },
    {
      title: t('materials.variance', 'Variance'),
      key: 'variance',
      width: 100,
      align: 'center',
      render: (_: any, record: Material) => {
        const countItem = countItems.find((item) => item.material_id === record.id);
        if (!countItem || countItem.counted_quantity === undefined) {
          return <Text type="secondary">-</Text>;
        }

        const variance = countItem.variance || 0;
        if (variance === 0) {
          return (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              0
            </Tag>
          );
        }

        return (
          <Tag color={variance > 0 ? 'blue' : 'error'} icon={<WarningOutlined />}>
            {variance > 0 ? '+' : ''}{variance}
          </Tag>
        );
      },
    },
  ];

  const steps = [
    {
      title: t('materials.start_count', 'Start Count'),
      description: t('materials.initialize_count', 'Initialize count session'),
    },
    {
      title: t('materials.count_items', 'Count Items'),
      description: t('materials.record_quantities', 'Record physical quantities'),
    },
    {
      title: t('materials.submit', 'Submit'),
      description: t('materials.review_submit', 'Review and submit'),
    },
  ];

  const varianceCount = countItems.filter((item) => item.variance !== 0).length;

  return (
    <Modal
      title={
        <Space>
          <AuditOutlined style={{ color: '#1890ff' }} />
          {t('materials.inventory_count', 'Inventory Count')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      <Steps current={currentStep} items={steps} style={{ marginBottom: 24 }} />

      {/* Step 0: Start Count */}
      {currentStep === 0 && (
        <div>
          <Alert
            message={t('materials.count_instructions', 'Start an inventory count to reconcile physical stock with system records.')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form form={form} layout="vertical">
            <Form.Item
              name="notes"
              label={t('materials.count_notes', 'Notes (Optional)')}
            >
              <Input.TextArea
                rows={3}
                placeholder={t('materials.count_notes_placeholder', 'e.g., Monthly inventory count, cycle count for Category A')}
              />
            </Form.Item>
          </Form>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleStartCount}
            loading={createCountMutation.isPending}
          >
            {t('materials.start_counting', 'Start Counting')}
          </Button>
        </div>
      )}

      {/* Step 1: Count Items */}
      {currentStep === 1 && (
        <div>
          {varianceCount > 0 && (
            <Alert
              message={`${varianceCount} ${t('materials.items_with_variance', 'items have variance')}`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Table
            dataSource={materials}
            columns={columns}
            rowKey="id"
            loading={materialsLoading}
            pagination={{ pageSize: 10 }}
            size="small"
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCurrentStep(0)}>
                {t('common.back', 'Back')}
              </Button>
              <Button type="primary" onClick={() => setCurrentStep(2)}>
                {t('materials.review', 'Review')}
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* Step 2: Review and Submit */}
      {currentStep === 2 && (
        <div>
          <Alert
            message={t('materials.review_count', 'Review your count before submitting')}
            description={
              <div>
                <p>{t('materials.total_counted', 'Total items counted')}: {countItems.length}</p>
                <p>{t('materials.items_with_variance', 'Items with variance')}: {varianceCount}</p>
              </div>
            }
            type={varianceCount > 0 ? 'warning' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
          />

          {varianceCount > 0 && (
            <Table
              dataSource={countItems.filter((item) => item.variance !== 0)}
              columns={[
                { title: 'Code', dataIndex: 'material_code', key: 'code' },
                { title: 'Name', dataIndex: 'material_name', key: 'name' },
                { title: 'System', dataIndex: 'system_quantity', key: 'system', align: 'center' as const },
                { title: 'Counted', dataIndex: 'counted_quantity', key: 'counted', align: 'center' as const },
                {
                  title: 'Variance',
                  dataIndex: 'variance',
                  key: 'variance',
                  align: 'center' as const,
                  render: (v: number) => (
                    <Tag color={v > 0 ? 'blue' : 'error'}>
                      {v > 0 ? '+' : ''}{v}
                    </Tag>
                  ),
                },
              ]}
              rowKey="material_id"
              pagination={false}
              size="small"
              style={{ marginBottom: 16 }}
            />
          )}

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCurrentStep(1)}>
                {t('common.back', 'Back')}
              </Button>
              <Button
                type="primary"
                onClick={handleSubmitCount}
                loading={submitMutation.isPending}
              >
                {t('materials.submit_for_approval', 'Submit for Approval')}
              </Button>
            </Space>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default InventoryCountModal;
