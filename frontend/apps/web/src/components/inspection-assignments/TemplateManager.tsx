import { useState } from 'react';
import {
  Card,
  Typography,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  List,
  message,
  Popconfirm,
  Empty,
  Spin,
  Tooltip,
  Badge,
  Select,
} from 'antd';
import {
  SaveOutlined,
  FileOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  inspectionAssignmentsApi,
  AssignmentTemplate,
} from '@inspection/shared';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface TemplateManagerProps {
  currentListId?: number;
  targetListId?: number;
  onTemplateApplied?: () => void;
}

export function TemplateManager({
  currentListId,
  targetListId,
  onTemplateApplied,
}: TemplateManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AssignmentTemplate | null>(null);
  const [form] = Form.useForm();

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ['assignment-templates'],
    queryFn: () => inspectionAssignmentsApi.getTemplates().then((r) => r.data?.data || []),
  });

  // Save template mutation
  const saveMutation = useMutation({
    mutationFn: (values: { name: string; description?: string }) =>
      inspectionAssignmentsApi.saveTemplate(values.name, currentListId!, values.description),
    onSuccess: () => {
      message.success(t('templates.save_success', 'Template saved successfully'));
      queryClient.invalidateQueries({ queryKey: ['assignment-templates'] });
      setSaveModalOpen(false);
      form.resetFields();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Apply template mutation
  const applyMutation = useMutation({
    mutationFn: (templateId: number) =>
      inspectionAssignmentsApi.applyTemplate(templateId, targetListId!),
    onSuccess: (res) => {
      const count = res.data?.data?.applied_count || 0;
      message.success(t('templates.apply_success', `Applied template to ${count} assignments`));
      setApplyModalOpen(false);
      setSelectedTemplate(null);
      onTemplateApplied?.();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: (templateId: number) => inspectionAssignmentsApi.deleteTemplate(templateId),
    onSuccess: () => {
      message.success(t('templates.delete_success', 'Template deleted'));
      queryClient.invalidateQueries({ queryKey: ['assignment-templates'] });
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const handleSave = (values: { name: string; description?: string }) => {
    saveMutation.mutate(values);
  };

  const handleApply = () => {
    if (selectedTemplate) {
      applyMutation.mutate(selectedTemplate.id);
    }
  };

  return (
    <Card
      title={
        <Space>
          <FileOutlined />
          {t('templates.title', 'Assignment Templates')}
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => setSaveModalOpen(true)}
          disabled={!currentListId}
        >
          {t('templates.save_current', 'Save Current')}
        </Button>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : !templates || templates.length === 0 ? (
        <Empty
          description={t('templates.no_templates', 'No templates saved yet')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setSaveModalOpen(true)}
            disabled={!currentListId}
          >
            {t('templates.create_first', 'Create First Template')}
          </Button>
        </Empty>
      ) : (
        <List
          dataSource={templates}
          renderItem={(template: AssignmentTemplate) => (
            <List.Item
              actions={[
                <Tooltip title={t('templates.apply', 'Apply to current list')}>
                  <Button
                    type="link"
                    icon={<PlayCircleOutlined />}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setApplyModalOpen(true);
                    }}
                    disabled={!targetListId}
                  >
                    {t('common.apply', 'Apply')}
                  </Button>
                </Tooltip>,
                <Popconfirm
                  title={t('templates.delete_confirm', 'Delete this template?')}
                  onConfirm={() => deleteMutation.mutate(template.id)}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                >
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    loading={deleteMutation.isPending}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Badge count={template.items_count} style={{ backgroundColor: '#1890ff' }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: '#f0f5ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CalendarOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                    </div>
                  </Badge>
                }
                title={
                  <Space>
                    <Text strong>{template.name}</Text>
                    {template.shift && (
                      <Tag color={template.shift === 'day' ? 'orange' : 'blue'}>
                        {template.shift}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    {template.description && <Text type="secondary">{template.description}</Text>}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {template.items_count} {t('templates.assignments', 'assignments')} •{' '}
                      {t('templates.created_by', 'Created by')} {template.created_by_name}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* Save Template Modal */}
      <Modal
        title={t('templates.save_template', 'Save as Template')}
        open={saveModalOpen}
        onCancel={() => {
          setSaveModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="name"
            label={t('templates.name', 'Template Name')}
            rules={[{ required: true, message: t('templates.name_required', 'Name is required') }]}
          >
            <Input placeholder={t('templates.name_placeholder', 'e.g., Monday Morning Routine')} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('templates.description', 'Description')}
          >
            <TextArea
              rows={3}
              placeholder={t('templates.description_placeholder', 'Optional description...')}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Apply Template Modal */}
      <Modal
        title={t('templates.apply_template', 'Apply Template')}
        open={applyModalOpen}
        onCancel={() => {
          setApplyModalOpen(false);
          setSelectedTemplate(null);
        }}
        onOk={handleApply}
        confirmLoading={applyMutation.isPending}
        okText={t('templates.apply_now', 'Apply Now')}
      >
        {selectedTemplate && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>
              {t('templates.apply_description', 'This will assign inspectors from template:')}
            </Text>
            <Card size="small">
              <Text strong>{selectedTemplate.name}</Text>
              <br />
              <Text type="secondary">
                {selectedTemplate.items_count} {t('templates.assignments', 'assignments')}
              </Text>
            </Card>
            <Text type="warning">
              {t('templates.apply_warning', 'Only unassigned inspections will be updated.')}
            </Text>
          </Space>
        )}
      </Modal>
    </Card>
  );
}

export default TemplateManager;
