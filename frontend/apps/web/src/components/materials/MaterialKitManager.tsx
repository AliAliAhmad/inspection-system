import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Typography,
  Card, Popconfirm, message, Empty, Badge, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  materialsApi,
  type Material,
  type MaterialKit,
  type CreateMaterialKitPayload,
} from '@inspection/shared';

const { Text } = Typography;

interface KitItemRow {
  material_id: number;
  quantity: number;
}

export default function MaterialKitManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<MaterialKit | null>(null);
  const [kitItems, setKitItems] = useState<KitItemRow[]>([]);
  const [form] = Form.useForm();

  // ── Queries ──
  const { data: kitsData, isLoading } = useQuery({
    queryKey: ['material-kits'],
    queryFn: () => materialsApi.listKits(),
  });
  const kits: MaterialKit[] = (kitsData?.data as any)?.kits ?? [];

  const { data: materialsData } = useQuery({
    queryKey: ['materials-all'],
    queryFn: () => materialsApi.list({ active_only: true }),
  });
  const materials: Material[] = (materialsData?.data as any)?.data ?? [];

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (payload: CreateMaterialKitPayload) => materialsApi.createKit(payload),
    onSuccess: () => {
      message.success(t('materials.kit_created', 'Kit created successfully'));
      queryClient.invalidateQueries({ queryKey: ['material-kits'] });
      closeModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to create kit');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateMaterialKitPayload> & { is_active?: boolean } }) =>
      materialsApi.updateKit(id, payload),
    onSuccess: () => {
      message.success(t('materials.kit_updated', 'Kit updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['material-kits'] });
      closeModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to update kit');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => materialsApi.deleteKit(id),
    onSuccess: () => {
      message.success(t('materials.kit_deleted', 'Kit deleted'));
      queryClient.invalidateQueries({ queryKey: ['material-kits'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to delete kit');
    },
  });

  // ── Helpers ──
  const closeModal = () => {
    setModalOpen(false);
    setEditingKit(null);
    setKitItems([]);
    form.resetFields();
  };

  const openCreate = () => {
    setEditingKit(null);
    setKitItems([{ material_id: 0, quantity: 1 }]);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (kit: MaterialKit) => {
    setEditingKit(kit);
    setKitItems(
      kit.items.map((item) => ({
        material_id: item.material_id,
        quantity: item.quantity,
      }))
    );
    form.setFieldsValue({
      name: kit.name,
      name_ar: kit.name_ar,
      description: kit.description,
      equipment_type: kit.equipment_type,
    });
    setModalOpen(true);
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const validItems = kitItems.filter((i) => i.material_id > 0 && i.quantity > 0);
      if (validItems.length === 0) {
        message.warning(t('materials.kit_needs_items', 'Add at least one material to the kit'));
        return;
      }

      const payload: CreateMaterialKitPayload = {
        name: values.name,
        name_ar: values.name_ar || undefined,
        description: values.description || undefined,
        equipment_type: values.equipment_type || undefined,
        items: validItems,
      };

      if (editingKit) {
        updateMutation.mutate({ id: editingKit.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    });
  };

  const addItemRow = () => {
    setKitItems([...kitItems, { material_id: 0, quantity: 1 }]);
  };

  const removeItemRow = (index: number) => {
    setKitItems(kitItems.filter((_, i) => i !== index));
  };

  const updateItemRow = (index: number, field: 'material_id' | 'quantity', value: number) => {
    const updated = [...kitItems];
    updated[index] = { ...updated[index], [field]: value };
    setKitItems(updated);
  };

  // ── Equipment types from existing kits ──
  const equipmentTypes = [...new Set(kits.map((k) => k.equipment_type).filter(Boolean))];

  // ── Table columns ──
  const columns: ColumnsType<MaterialKit> = [
    {
      title: t('materials.kit_name', 'Kit Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <Text strong>{name}</Text>
          {record.name_ar && (
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.name_ar}</div>
          )}
        </div>
      ),
    },
    {
      title: t('materials.equipment_type', 'Equipment Type'),
      dataIndex: 'equipment_type',
      key: 'equipment_type',
      render: (val: string | null) => val ? <Tag color="blue">{val}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: t('materials.items', 'Items'),
      key: 'items',
      render: (_, record) => (
        <Tooltip
          title={
            <div>
              {record.items.map((item, i) => (
                <div key={i}>
                  {item.material?.name || `Material #${item.material_id}`} × {item.quantity}
                </div>
              ))}
            </div>
          }
        >
          <Badge count={record.items.length} style={{ backgroundColor: '#1677ff' }} showZero>
            <AppstoreOutlined style={{ fontSize: 18, color: '#8c8c8c' }} />
          </Badge>
        </Tooltip>
      ),
      width: 80,
      align: 'center' as const,
    },
    {
      title: t('materials.status', 'Status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
      width: 90,
    },
    {
      title: t('materials.description', 'Description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val: string | null) => val || <Text type="secondary">—</Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('materials.delete_kit_confirm', 'Delete this kit?')}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary">
          {t('materials.kits_desc', 'Create predefined material bundles for PM jobs. Attach a kit to a job to auto-add all materials.')}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('materials.create_kit', 'Create Kit')}
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={kits}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 15 }}
        locale={{ emptyText: <Empty description={t('materials.no_kits', 'No kits created yet')} /> }}
      />

      {/* ── Create/Edit Kit Modal ── */}
      <Modal
        title={editingKit ? t('materials.edit_kit', 'Edit Kit') : t('materials.create_kit', 'Create Kit')}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={700}
        okText={editingKit ? t('common.save', 'Save') : t('common.create', 'Create')}
      >
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item
              name="name"
              label={t('materials.kit_name', 'Kit Name')}
              rules={[{ required: true, message: 'Required' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="e.g. 2250h PM Kit — STS Crane" />
            </Form.Item>
            <Form.Item name="name_ar" label={t('materials.name_arabic', 'Arabic Name')} style={{ flex: 1 }}>
              <Input placeholder="الاسم بالعربي" dir="rtl" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="equipment_type" label={t('materials.equipment_type', 'Equipment Type')} style={{ flex: 1 }}>
              <Select
                placeholder={t('materials.select_equipment_type', 'Select equipment type')}
                allowClear
                showSearch
              >
                {equipmentTypes.map((et) => (
                  <Select.Option key={et} value={et}>{et}</Select.Option>
                ))}
                {/* Common types if not in list */}
                {['STS Crane', 'RTG', 'Reach Stacker', 'Forklift', 'Empty Handler', 'Mobile Crane', 'Truck', 'Trailer', 'Spreader']
                  .filter((t) => !equipmentTypes.includes(t))
                  .map((et) => (
                    <Select.Option key={et} value={et}>{et}</Select.Option>
                  ))}
              </Select>
            </Form.Item>
            <Form.Item name="description" label={t('materials.description', 'Description')} style={{ flex: 1 }}>
              <Input placeholder="Optional description" />
            </Form.Item>
          </div>

          {/* ── Kit Items ── */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong>{t('materials.kit_items', 'Materials in Kit')}</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={addItemRow}>
                {t('materials.add_material', 'Add Material')}
              </Button>
            </div>

            {kitItems.length === 0 ? (
              <Card size="small" style={{ textAlign: 'center', color: '#bfbfbf', padding: 16 }}>
                {t('materials.no_items_yet', 'No materials added. Click "Add Material" to start.')}
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Header */}
                <div style={{ display: 'flex', gap: 8, padding: '0 4px' }}>
                  <Text type="secondary" style={{ flex: 3, fontSize: 11 }}>Material</Text>
                  <Text type="secondary" style={{ width: 80, fontSize: 11 }}>Qty</Text>
                  <div style={{ width: 32 }} />
                </div>

                {kitItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Select
                      style={{ flex: 3 }}
                      placeholder="Select material"
                      showSearch
                      optionFilterProp="label"
                      value={item.material_id || undefined}
                      onChange={(val) => updateItemRow(idx, 'material_id', val)}
                      options={materials.map((m) => ({
                        value: m.id,
                        label: `${m.code} — ${m.name}`,
                      }))}
                    />
                    <InputNumber
                      style={{ width: 80 }}
                      min={0.01}
                      step={1}
                      value={item.quantity}
                      onChange={(val) => updateItemRow(idx, 'quantity', val ?? 1)}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeItemRow(idx)}
                      style={{ width: 32 }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Form>
      </Modal>
    </div>
  );
}
