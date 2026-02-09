import { useState } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Select,
  Input,
  Space,
  Typography,
  message,
  Alert,
  Divider,
} from 'antd';
import { MinusCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, Material, MaterialBatch } from '@inspection/shared';
import { StockLevelGauge } from './StockLevelGauge';

const { Text } = Typography;

interface QuickConsumeModalProps {
  open: boolean;
  onClose: () => void;
  material?: Material;
  preselectedMaterialId?: number;
  jobId?: number;
}

const consumeReasons = [
  'maintenance',
  'repair',
  'replacement',
  'testing',
  'other',
];

export function QuickConsumeModal({
  open,
  onClose,
  material,
  preselectedMaterialId,
  jobId,
}: QuickConsumeModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | undefined>(
    material?.id || preselectedMaterialId
  );

  // Fetch materials list if no material provided
  const { data: materialsData, isLoading: materialsLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list({ active_only: true }),
    enabled: !material,
  });

  // Fetch batches for selected material
  const { data: batchesData } = useQuery({
    queryKey: ['material-batches', selectedMaterialId],
    queryFn: () => materialsApi.getBatches(selectedMaterialId!, 'available'),
    enabled: !!selectedMaterialId,
  });

  const materials = materialsData?.data?.materials || [];
  const batches = batchesData?.data?.batches || [];
  const selectedMaterial = material || materials.find((m) => m.id === selectedMaterialId);

  const consumeMutation = useMutation({
    mutationFn: (data: { materialId: number; quantity: number; reason?: string; job_id?: number; batch_id?: number }) =>
      materialsApi.consume(data.materialId, {
        quantity: data.quantity,
        reason: data.reason,
        job_id: data.job_id,
        batch_id: data.batch_id,
      }),
    onSuccess: () => {
      message.success(t('materials.consumed_successfully', 'Material consumed successfully'));
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['material-batches'] });
      queryClient.invalidateQueries({ queryKey: ['material-history'] });
      form.resetFields();
      onClose();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'An error occurred'));
    },
  });

  const handleSubmit = (values: any) => {
    const materialId = material?.id || values.material_id;
    if (!materialId) {
      message.error(t('materials.select_material', 'Please select a material'));
      return;
    }

    consumeMutation.mutate({
      materialId,
      quantity: values.quantity,
      reason: values.reason === 'other' ? values.custom_reason : values.reason,
      job_id: jobId || values.job_id,
      batch_id: values.batch_id,
    });
  };

  const handleMaterialChange = (materialId: number) => {
    setSelectedMaterialId(materialId);
    form.setFieldValue('batch_id', undefined);
  };

  const maxQuantity = selectedMaterial?.current_stock || 0;
  const currentQuantity = Form.useWatch('quantity', form) || 0;
  const willBeLowStock = selectedMaterial && (selectedMaterial.current_stock - currentQuantity) < selectedMaterial.min_stock;

  return (
    <Modal
      title={
        <Space>
          <MinusCircleOutlined style={{ color: '#ff4d4f' }} />
          {t('materials.quick_consume', 'Quick Consume')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={consumeMutation.isPending}
      okText={t('materials.consume', 'Consume')}
      okButtonProps={{ danger: true }}
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          material_id: material?.id || preselectedMaterialId,
          job_id: jobId,
        }}
      >
        {/* Material Selector (if not pre-selected) */}
        {!material && (
          <Form.Item
            name="material_id"
            label={t('materials.material', 'Material')}
            rules={[{ required: true, message: t('materials.select_material', 'Please select a material') }]}
          >
            <Select
              placeholder={t('materials.select_material', 'Select material')}
              loading={materialsLoading}
              showSearch
              optionFilterProp="children"
              onChange={handleMaterialChange}
            >
              {materials.map((m) => (
                <Select.Option key={m.id} value={m.id}>
                  <Space>
                    <Text strong>{m.name}</Text>
                    <Text type="secondary">({m.code})</Text>
                    <Text type="secondary">- Stock: {m.current_stock}</Text>
                    {m.is_low_stock && <WarningOutlined style={{ color: '#ff4d4f' }} />}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        {/* Material Info */}
        {selectedMaterial && (
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <StockLevelGauge
              currentStock={selectedMaterial.current_stock}
              minStock={selectedMaterial.min_stock}
              unit={selectedMaterial.unit}
              size="small"
            />
            <div>
              <Text strong>{selectedMaterial.name}</Text>
              <div>
                <Text type="secondary">{selectedMaterial.code}</Text>
              </div>
            </div>
          </div>
        )}

        {/* Batch Selector (if multiple batches) */}
        {batches.length > 1 && (
          <Form.Item
            name="batch_id"
            label={t('materials.batch', 'Batch')}
          >
            <Select
              placeholder={t('materials.select_batch', 'Select batch (optional)')}
              allowClear
            >
              {batches.map((batch) => (
                <Select.Option key={batch.id} value={batch.id}>
                  <Space>
                    <Text>{batch.batch_number}</Text>
                    <Text type="secondary">Qty: {batch.quantity}</Text>
                    {batch.expiry_date && (
                      <Text type="secondary">
                        Exp: {new Date(batch.expiry_date).toLocaleDateString()}
                      </Text>
                    )}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        {/* Quantity */}
        <Form.Item
          name="quantity"
          label={t('materials.quantity', 'Quantity')}
          rules={[
            { required: true, message: t('materials.enter_quantity', 'Please enter quantity') },
            {
              validator: (_, value) => {
                if (value && value > maxQuantity) {
                  return Promise.reject(
                    t('materials.exceeds_stock', 'Quantity exceeds available stock')
                  );
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <InputNumber
            min={1}
            max={maxQuantity}
            style={{ width: '100%' }}
            addonAfter={selectedMaterial?.unit || ''}
            placeholder={`Max: ${maxQuantity}`}
          />
        </Form.Item>

        {/* Warning if will be low stock */}
        {willBeLowStock && (
          <Alert
            message={t('materials.will_be_low_stock', 'This will result in low stock!')}
            description={
              <Text type="secondary">
                {t('materials.stock_after', 'Stock after consumption')}: {selectedMaterial!.current_stock - currentQuantity} (
                {t('materials.min', 'Min')}: {selectedMaterial!.min_stock})
              </Text>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Reason */}
        <Form.Item
          name="reason"
          label={t('materials.reason', 'Reason')}
        >
          <Select placeholder={t('materials.select_reason', 'Select reason (optional)')}>
            {consumeReasons.map((reason) => (
              <Select.Option key={reason} value={reason}>
                {t(`materials.reason_${reason}`, reason.charAt(0).toUpperCase() + reason.slice(1))}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Custom reason if "other" selected */}
        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) => prev.reason !== curr.reason}
        >
          {({ getFieldValue }) =>
            getFieldValue('reason') === 'other' && (
              <Form.Item
                name="custom_reason"
                label={t('materials.custom_reason', 'Specify reason')}
                rules={[{ required: true, message: t('materials.enter_reason', 'Please enter a reason') }]}
              >
                <Input.TextArea rows={2} placeholder={t('materials.enter_reason', 'Enter reason')} />
              </Form.Item>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default QuickConsumeModal;
