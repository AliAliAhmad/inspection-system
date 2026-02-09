import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Typography,
  Alert,
  Tooltip,
  Progress,
  message,
  Popconfirm,
} from 'antd';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { equipmentApi } from '@inspection/shared';
import type { EquipmentCertification, CreateCertificationPayload, CertificationStatus } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text } = Typography;

interface CertificationTrackerProps {
  equipmentId: number;
  canManage?: boolean;
}

const statusConfig: Record<CertificationStatus, { color: string; icon: React.ReactNode; label: string }> = {
  active: { color: 'green', icon: <CheckCircleOutlined />, label: 'Active' },
  pending_renewal: { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending Renewal' },
  expired: { color: 'red', icon: <ExclamationCircleOutlined />, label: 'Expired' },
  revoked: { color: 'default', icon: <WarningOutlined />, label: 'Revoked' },
};

export const CertificationTracker: React.FC<CertificationTrackerProps> = ({
  equipmentId,
  canManage = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<EquipmentCertification | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: certifications, isLoading } = useQuery({
    queryKey: ['equipment-certifications', equipmentId],
    queryFn: async () => {
      const response = await equipmentApi.getCertifications(equipmentId);
      return response.data?.data as EquipmentCertification[];
    },
  });

  const addMutation = useMutation({
    mutationFn: (payload: CreateCertificationPayload) =>
      equipmentApi.addCertification(equipmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-certifications', equipmentId] });
      message.success('Certification added');
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error('Failed to add certification'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ certId, payload }: { certId: number; payload: Partial<CreateCertificationPayload> }) =>
      equipmentApi.updateCertification(equipmentId, certId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-certifications', equipmentId] });
      message.success('Certification updated');
      setIsModalOpen(false);
      setEditingCert(null);
      form.resetFields();
    },
    onError: () => message.error('Failed to update certification'),
  });

  const deleteMutation = useMutation({
    mutationFn: (certId: number) => equipmentApi.deleteCertification(equipmentId, certId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-certifications', equipmentId] });
      message.success('Certification deleted');
    },
    onError: () => message.error('Failed to delete certification'),
  });

  const handleSubmit = async (values: any) => {
    const payload: CreateCertificationPayload = {
      name: values.name,
      certification_type: values.certification_type,
      issuing_authority: values.issuing_authority,
      certificate_number: values.certificate_number,
      issued_date: values.issued_date?.format('YYYY-MM-DD'),
      expiry_date: values.expiry_date?.format('YYYY-MM-DD'),
      document_url: values.document_url,
    };

    if (editingCert) {
      updateMutation.mutate({ certId: editingCert.id, payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const handleEdit = (cert: EquipmentCertification) => {
    setEditingCert(cert);
    form.setFieldsValue({
      name: cert.name,
      certification_type: cert.certification_type,
      issuing_authority: cert.issuing_authority,
      certificate_number: cert.certificate_number,
      issued_date: cert.issued_date ? dayjs(cert.issued_date) : null,
      expiry_date: cert.expiry_date ? dayjs(cert.expiry_date) : null,
      document_url: cert.document_url,
    });
    setIsModalOpen(true);
  };

  const expiringCount = certifications?.filter(c => c.status === 'pending_renewal').length || 0;
  const expiredCount = certifications?.filter(c => c.status === 'expired').length || 0;

  const columns = [
    {
      title: 'Certification',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: EquipmentCertification) => (
        <Space>
          <SafetyCertificateOutlined />
          <div>
            <div>{name}</div>
            {record.certificate_number && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                #{record.certificate_number}
              </Text>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'certification_type',
      key: 'certification_type',
      render: (type: string) => type || '-',
    },
    {
      title: 'Issuing Authority',
      dataIndex: 'issuing_authority',
      key: 'issuing_authority',
      render: (auth: string) => auth || '-',
    },
    {
      title: 'Issued',
      dataIndex: 'issued_date',
      key: 'issued_date',
      render: (date: string) => (date ? dayjs(date).format('MMM D, YYYY') : '-'),
    },
    {
      title: 'Expires',
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      render: (date: string, record: EquipmentCertification) => {
        if (!date) return <Text type="secondary">Never</Text>;

        const daysLeft = record.days_until_expiry;
        let color = 'green';
        if (daysLeft !== null) {
          if (daysLeft < 0) color = 'red';
          else if (daysLeft <= 30) color = 'orange';
          else if (daysLeft <= 60) color = 'gold';
        }

        return (
          <Tooltip title={daysLeft !== null ? `${Math.abs(daysLeft)} days ${daysLeft < 0 ? 'overdue' : 'remaining'}` : ''}>
            <Text style={{ color }}>
              {dayjs(date).format('MMM D, YYYY')}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: CertificationStatus) => {
        const config = statusConfig[status] || statusConfig.active;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    ...(canManage
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_: any, record: EquipmentCertification) => (
              <Space size="small">
                {record.document_url && (
                  <Tooltip title="View Document">
                    <Button
                      type="text"
                      size="small"
                      icon={<FileTextOutlined />}
                      onClick={() => window.open(record.document_url!, '_blank')}
                    />
                  </Tooltip>
                )}
                <Tooltip title="Edit">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                </Tooltip>
                <Popconfirm
                  title="Delete this certification?"
                  onConfirm={() => deleteMutation.mutate(record.id)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Tooltip title="Delete">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined />
            <span>Certifications</span>
            {(expiringCount > 0 || expiredCount > 0) && (
              <Tag color={expiredCount > 0 ? 'red' : 'orange'}>
                {expiredCount > 0 ? `${expiredCount} expired` : `${expiringCount} expiring soon`}
              </Tag>
            )}
          </Space>
        }
        extra={
          canManage && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingCert(null);
                form.resetFields();
                setIsModalOpen(true);
              }}
              size="small"
            >
              Add Certification
            </Button>
          )
        }
      >
        {(expiringCount > 0 || expiredCount > 0) && (
          <Alert
            type={expiredCount > 0 ? 'error' : 'warning'}
            message={
              expiredCount > 0
                ? `${expiredCount} certification(s) have expired and need immediate attention.`
                : `${expiringCount} certification(s) will expire within 30 days.`
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Table
          columns={columns}
          dataSource={certifications}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
          locale={{ emptyText: 'No certifications recorded' }}
        />
      </Card>

      <Modal
        title={editingCert ? 'Edit Certification' : 'Add Certification'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingCert(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="Certification Name"
            rules={[{ required: true, message: 'Please enter certification name' }]}
          >
            <Input placeholder="e.g., Safety Inspection Certificate" />
          </Form.Item>

          <Form.Item name="certification_type" label="Type">
            <Select placeholder="Select type" allowClear>
              <Select.Option value="safety">Safety</Select.Option>
              <Select.Option value="calibration">Calibration</Select.Option>
              <Select.Option value="inspection">Inspection</Select.Option>
              <Select.Option value="compliance">Compliance</Select.Option>
              <Select.Option value="environmental">Environmental</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="issuing_authority" label="Issuing Authority">
            <Input placeholder="e.g., Maritime Safety Authority" />
          </Form.Item>

          <Form.Item name="certificate_number" label="Certificate Number">
            <Input placeholder="e.g., CERT-2024-001" />
          </Form.Item>

          <Form.Item
            name="issued_date"
            label="Issue Date"
            rules={[{ required: true, message: 'Please select issue date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="expiry_date" label="Expiry Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="document_url" label="Document URL">
            <Input placeholder="https://..." />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={addMutation.isPending || updateMutation.isPending}>
                {editingCert ? 'Update' : 'Add'} Certification
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CertificationTracker;
