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
  DatePicker,
  Collapse,
  Divider,
} from 'antd';
import { PlusCircleOutlined, ShopOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, Material, Vendor } from '@inspection/shared';
import { StockLevelGauge } from './StockLevelGauge';
import { LocationSelector } from './LocationSelector';

const { Text } = Typography;
const { Panel } = Collapse;

interface QuickRestockModalProps {
  open: boolean;
  onClose: () => void;
  material?: Material;
  preselectedMaterialId?: number;
}

export function QuickRestockModal({
  open,
  onClose,
  material,
  preselectedMaterialId,
}: QuickRestockModalProps) {
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

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ['material-vendors'],
    queryFn: () => materialsApi.getVendors(),
  });

  const materials = materialsData?.data?.materials || [];
  const vendors = vendorsData?.data?.vendors || [];
  const selectedMaterial = material || materials.find((m) => m.id === selectedMaterialId);

  const restockMutation = useMutation({
    mutationFn: (data: {
      materialId: number;
      quantity: number;
      vendor_id?: number;
      location_id?: number;
      batch_info?: { batch_number?: string; lot_number?: string; expiry_date?: string };
    }) =>
      materialsApi.restock(data.materialId, {
        quantity: data.quantity,
        vendor_id: data.vendor_id,
        location_id: data.location_id,
        batch_info: data.batch_info,
      }),
    onSuccess: () => {
      message.success(t('materials.restocked_successfully', 'Material restocked successfully'));
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

    const batchInfo = values.batch_number || values.lot_number || values.expiry_date
      ? {
          batch_number: values.batch_number,
          lot_number: values.lot_number,
          expiry_date: values.expiry_date?.format('YYYY-MM-DD'),
        }
      : undefined;

    restockMutation.mutate({
      materialId,
      quantity: values.quantity,
      vendor_id: values.vendor_id,
      location_id: values.location_id,
      batch_info: batchInfo,
    });
  };

  const handleMaterialChange = (materialId: number) => {
    setSelectedMaterialId(materialId);
  };

  return (
    <Modal
      title={
        <Space>
          <PlusCircleOutlined style={{ color: '#52c41a' }} />
          {t('materials.quick_restock', 'Quick Restock')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={restockMutation.isPending}
      okText={t('materials.restock', 'Restock')}
      okButtonProps={{ style: { background: '#52c41a', borderColor: '#52c41a' } }}
      width={550}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          material_id: material?.id || preselectedMaterialId,
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

        {/* Quantity */}
        <Form.Item
          name="quantity"
          label={t('materials.quantity', 'Quantity')}
          rules={[
            { required: true, message: t('materials.enter_quantity', 'Please enter quantity') },
            {
              validator: (_, value) => {
                if (value && value <= 0) {
                  return Promise.reject(t('materials.quantity_positive', 'Quantity must be positive'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <InputNumber
            min={1}
            style={{ width: '100%' }}
            addonAfter={selectedMaterial?.unit || ''}
            placeholder={t('materials.enter_quantity', 'Enter quantity')}
          />
        </Form.Item>

        {/* Vendor Selector */}
        <Form.Item
          name="vendor_id"
          label={
            <Space>
              <ShopOutlined />
              {t('materials.vendor', 'Vendor')}
            </Space>
          }
        >
          <Select
            placeholder={t('materials.select_vendor', 'Select vendor (optional)')}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {vendors.filter((v) => v.is_active).map((v) => (
              <Select.Option key={v.id} value={v.id}>
                <Space>
                  <Text>{v.name}</Text>
                  {v.lead_time_days && (
                    <Text type="secondary">({v.lead_time_days} days lead time)</Text>
                  )}
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Location Selector */}
        <Form.Item
          name="location_id"
          label={
            <Space>
              <InboxOutlined />
              {t('materials.location', 'Location')}
            </Space>
          }
        >
          <LocationSelector
            placeholder={t('materials.select_location', 'Select storage location (optional)')}
          />
        </Form.Item>

        {/* Batch Information (Collapsible) */}
        <Collapse ghost style={{ marginBottom: 0 }}>
          <Panel
            header={
              <Text type="secondary">{t('materials.batch_info', 'Batch Information (Optional)')}</Text>
            }
            key="batch"
          >
            <Form.Item
              name="batch_number"
              label={t('materials.batch_number', 'Batch Number')}
            >
              <Input placeholder="e.g., BATCH-2024-001" />
            </Form.Item>

            <Form.Item
              name="lot_number"
              label={t('materials.lot_number', 'Lot Number')}
            >
              <Input placeholder="e.g., LOT-12345" />
            </Form.Item>

            <Form.Item
              name="expiry_date"
              label={t('materials.expiry_date', 'Expiry Date')}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Panel>
        </Collapse>
      </Form>
    </Modal>
  );
}

export default QuickRestockModal;
