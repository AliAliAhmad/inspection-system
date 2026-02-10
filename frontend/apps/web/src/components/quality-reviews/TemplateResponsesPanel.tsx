import { useState } from 'react';
import {
  Card,
  List,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Typography,
  Tag,
  Tooltip,
  message,
  Empty,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qualityReviewsApi } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface ReviewTemplate {
  id: number;
  name: string;
  category: string;
  response_text: string;
  is_approval: boolean;
}

interface TemplateResponsesPanelProps {
  onSelectTemplate?: (template: ReviewTemplate) => void;
  selectable?: boolean;
}

export function TemplateResponsesPanel({ onSelectTemplate, selectable = false }: TemplateResponsesPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReviewTemplate | null>(null);
  const [form] = Form.useForm();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['qc-templates'],
    queryFn: () => qualityReviewsApi.getTemplates?.().then((r) => r.data?.data || []),
    enabled: !!qualityReviewsApi.getTemplates,
    staleTime: 300000,
  });

  // Mock data if API not available
  const mockTemplates: ReviewTemplate[] = [
    {
      id: 1,
      name: 'Standard Approval',
      category: 'approval',
      response_text: 'Work completed to satisfaction. All quality standards met.',
      is_approval: true,
    },
    {
      id: 2,
      name: 'Minor Issues',
      category: 'approval',
      response_text: 'Work approved with minor observations noted. Please review for future reference.',
      is_approval: true,
    },
    {
      id: 3,
      name: 'Incomplete Documentation',
      category: 'rejection',
      response_text: 'Rejected due to incomplete documentation. Please provide all required photos and checklist items.',
      is_approval: false,
    },
    {
      id: 4,
      name: 'Quality Below Standard',
      category: 'rejection',
      response_text: 'Work quality does not meet required standards. Please address the identified issues and resubmit.',
      is_approval: false,
    },
  ];

  const data = templates || mockTemplates;

  const createMutation = useMutation({
    mutationFn: (values: Omit<ReviewTemplate, 'id'>) => qualityReviewsApi.createTemplate?.(values) || Promise.resolve(),
    onSuccess: () => {
      message.success(t('common.saved', 'Template saved'));
      queryClient.invalidateQueries({ queryKey: ['qc-templates'] });
      handleCloseModal();
    },
    onError: () => {
      message.error(t('common.error', 'Failed to save template'));
    },
  });

  const handleOpenModal = (template?: ReviewTemplate) => {
    setEditingTemplate(template || null);
    if (template) {
      form.setFieldsValue(template);
    } else {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      createMutation.mutate({
        ...values,
        is_approval: values.category === 'approval',
      });
    } catch {
      // Validation error
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success(t('common.copied', 'Copied to clipboard'));
  };

  const handleSelectTemplate = (template: ReviewTemplate) => {
    if (selectable && onSelectTemplate) {
      onSelectTemplate(template);
    }
  };

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          {t('qc.template_responses', 'Template Responses')}
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => handleOpenModal()}>
          {t('common.add', 'Add')}
        </Button>
      }
    >
      {data.length === 0 ? (
        <Empty description={t('qc.no_templates', 'No templates yet')} />
      ) : (
        <List
          dataSource={data}
          renderItem={(template: ReviewTemplate) => (
            <List.Item
              actions={[
                <Tooltip title={t('common.copy', 'Copy')}>
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyText(template.response_text)}
                  />
                </Tooltip>,
                <Tooltip title={t('common.edit', 'Edit')}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleOpenModal(template)}
                  />
                </Tooltip>,
              ]}
              onClick={() => handleSelectTemplate(template)}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{template.name}</Text>
                    <Tag color={template.is_approval ? 'green' : 'red'}>
                      {template.is_approval ? t('qc.approval', 'Approval') : t('qc.rejection', 'Rejection')}
                    </Tag>
                  </Space>
                }
                description={
                  <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
                    {template.response_text}
                  </Paragraph>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        title={editingTemplate ? t('qc.edit_template', 'Edit Template') : t('qc.new_template', 'New Template')}
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSave}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('common.name', 'Name')}
            rules={[{ required: true, message: t('common.required', 'Required') }]}
          >
            <Input placeholder={t('qc.template_name_placeholder', 'e.g., Standard Approval')} />
          </Form.Item>

          <Form.Item
            name="category"
            label={t('common.category', 'Category')}
            rules={[{ required: true, message: t('common.required', 'Required') }]}
          >
            <Select>
              <Select.Option value="approval">{t('qc.approval', 'Approval')}</Select.Option>
              <Select.Option value="rejection">{t('qc.rejection', 'Rejection')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="response_text"
            label={t('qc.response_text', 'Response Text')}
            rules={[{ required: true, message: t('common.required', 'Required') }]}
          >
            <TextArea rows={4} placeholder={t('qc.response_placeholder', 'Enter the template response...')} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default TemplateResponsesPanel;
