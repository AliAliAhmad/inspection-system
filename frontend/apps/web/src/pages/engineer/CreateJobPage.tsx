import { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Radio,
  Button,
  Space,
  Typography,
  message,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import {
  engineerJobsApi,
  equipmentApi,
  CreateEngineerJobPayload,
  Equipment,
} from '@inspection/shared';

export default function CreateJobPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [category, setCategory] = useState<string | undefined>();

  const { data: equipmentData } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: () => equipmentApi.list({ per_page: 200 }).then((r) => r.data),
  });

  const equipmentList: Equipment[] = equipmentData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: CreateEngineerJobPayload) =>
      engineerJobsApi.create(payload),
    onSuccess: () => {
      message.success(t('common.success', 'Job created successfully'));
      navigate('/engineer/jobs');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const handleSubmit = (values: any) => {
    const payload: CreateEngineerJobPayload = {
      engineer_id: user?.id,
      job_type: values.job_type,
      title: values.title,
      description: values.description,
      equipment_id: values.equipment_id,
      category: values.category,
      major_reason: values.category === 'major' ? values.major_reason : undefined,
    };
    createMutation.mutate(payload);
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/engineer/jobs')}>
          {t('common.back', 'Back')}
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.create_job', 'Create Job')}
        </Typography.Title>
      </Space>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="job_type"
            label={t('common.type', 'Job Type')}
            rules={[{ required: true, message: t('common.required', 'This field is required') }]}
          >
            <Select
              placeholder={t('common.select', 'Select...')}
              options={[
                { value: 'custom_project', label: t('jobs.type_custom_project', 'Custom Project') },
                { value: 'system_review', label: t('jobs.type_system_review', 'System Review') },
                { value: 'special_task', label: t('jobs.type_special_task', 'Special Task') },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="title"
            label={t('common.title', 'Title')}
            rules={[{ required: true, message: t('common.required', 'This field is required') }]}
          >
            <Input placeholder={t('common.title', 'Title')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('common.description', 'Description')}
            rules={[{ required: true, message: t('common.required', 'This field is required') }]}
          >
            <Input.TextArea rows={4} placeholder={t('common.description', 'Description')} />
          </Form.Item>

          <Form.Item
            name="equipment_id"
            label={t('equipment.name', 'Equipment')}
          >
            <Select
              allowClear
              showSearch
              placeholder={t('common.select', 'Select equipment...')}
              optionFilterProp="label"
              options={equipmentList.map((eq) => ({
                value: eq.id,
                label: `${eq.name} (${eq.equipment_type})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="category"
            label={t('common.category', 'Category')}
          >
            <Radio.Group
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'major', label: t('status.major', 'Major') },
                { value: 'minor', label: t('status.minor', 'Minor') },
              ]}
            />
          </Form.Item>

          {category === 'major' && (
            <Form.Item
              name="major_reason"
              label={t('jobs.major_reason', 'Major Reason')}
              rules={[{ required: true, message: t('common.required', 'This field is required') }]}
            >
              <Input.TextArea rows={3} placeholder={t('jobs.major_reason', 'Explain why this is major...')} />
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                {t('common.submit', 'Submit')}
              </Button>
              <Button onClick={() => navigate('/engineer/jobs')}>
                {t('common.cancel', 'Cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
