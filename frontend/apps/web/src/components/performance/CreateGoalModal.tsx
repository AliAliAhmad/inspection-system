import { Modal, Form, Input, InputNumber, DatePicker, Select, Space, Typography } from 'antd';
import {
  TrophyOutlined,
  ThunderboltOutlined,
  FireOutlined,
  StarOutlined,
  ExperimentOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { GoalType } from '@inspection/shared';

const { Text } = Typography;

export interface CreateGoalPayload {
  goal_type: GoalType;
  title: string;
  description?: string;
  target_value: number;
  end_date: string;
}

export interface CreateGoalModalProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateGoalPayload) => void;
  loading?: boolean;
  editGoal?: {
    id: number;
    goal_type: GoalType;
    title: string;
    description?: string;
    target_value: number;
    end_date: string;
  } | null;
}

const GOAL_TYPE_OPTIONS = [
  { value: 'jobs', label: 'Jobs Completed', icon: <ThunderboltOutlined />, color: '#1677ff', hint: 'Target number of jobs to complete' },
  { value: 'points', label: 'Points Earned', icon: <StarOutlined />, color: '#faad14', hint: 'Target leaderboard points to earn' },
  { value: 'streak', label: 'Day Streak', icon: <FireOutlined />, color: '#fa541c', hint: 'Consecutive working days goal' },
  { value: 'rating', label: 'Average Rating', icon: <TrophyOutlined />, color: '#722ed1', hint: 'Target average quality rating (1-5)' },
  { value: 'inspections', label: 'Inspections', icon: <ExperimentOutlined />, color: '#52c41a', hint: 'Target number of inspections to complete' },
  { value: 'defects', label: 'Defects Fixed', icon: <BugOutlined />, color: '#eb2f96', hint: 'Target number of defects to resolve' },
];

export function CreateGoalModal({
  open,
  onCancel,
  onSubmit,
  loading = false,
  editGoal,
}: CreateGoalModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const selectedType = Form.useWatch('goal_type', form);
  const selectedOption = GOAL_TYPE_OPTIONS.find((opt) => opt.value === selectedType);

  const handleSubmit = (values: any) => {
    onSubmit({
      goal_type: values.goal_type,
      title: values.title,
      description: values.description,
      target_value: values.target_value,
      end_date: values.end_date.format('YYYY-MM-DD'),
    });
  };

  const getDefaultTargetValue = (type: GoalType): number => {
    switch (type) {
      case 'jobs': return 10;
      case 'points': return 100;
      case 'streak': return 7;
      case 'rating': return 4;
      case 'inspections': return 20;
      case 'defects': return 5;
      default: return 10;
    }
  };

  const getTargetConfig = (type: GoalType) => {
    switch (type) {
      case 'rating':
        return { min: 1, max: 5, step: 0.1, suffix: 'stars' };
      case 'streak':
        return { min: 1, max: 365, step: 1, suffix: 'days' };
      case 'points':
        return { min: 1, max: 10000, step: 10, suffix: 'pts' };
      case 'inspections':
      case 'defects':
      case 'jobs':
      default:
        return { min: 1, max: 1000, step: 1, suffix: '' };
    }
  };

  return (
    <Modal
      title={
        <Space>
          <TrophyOutlined style={{ color: '#faad14' }} />
          {editGoal
            ? t('performance.edit_goal', 'Edit Goal')
            : t('performance.create_goal', 'Create New Goal')}
        </Space>
      }
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnClose
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={
          editGoal
            ? {
                goal_type: editGoal.goal_type,
                title: editGoal.title,
                description: editGoal.description,
                target_value: editGoal.target_value,
                end_date: dayjs(editGoal.end_date),
              }
            : {
                goal_type: 'jobs',
                end_date: dayjs().add(30, 'day'),
              }
        }
      >
        {/* Goal Type */}
        <Form.Item
          name="goal_type"
          label={t('performance.goal_type', 'Goal Type')}
          rules={[{ required: true }]}
        >
          <Select
            placeholder={t('performance.select_goal_type', 'Select goal type')}
            onChange={(value) => {
              form.setFieldsValue({ target_value: getDefaultTargetValue(value) });
            }}
          >
            {GOAL_TYPE_OPTIONS.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                <Space>
                  <span style={{ color: option.color }}>{option.icon}</span>
                  {option.label}
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Hint for selected type */}
        {selectedOption && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: `${selectedOption.color}10`,
              borderRadius: 8,
              marginBottom: 16,
              marginTop: -8,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {selectedOption.icon} {selectedOption.hint}
            </Text>
          </div>
        )}

        {/* Title */}
        <Form.Item
          name="title"
          label={t('performance.goal_title', 'Goal Title')}
          rules={[{ required: true, message: t('performance.title_required', 'Please enter a title') }]}
        >
          <Input
            placeholder={t('performance.title_placeholder', 'e.g., Complete 20 PM jobs this month')}
            maxLength={100}
            showCount
          />
        </Form.Item>

        {/* Description */}
        <Form.Item
          name="description"
          label={t('performance.description', 'Description (Optional)')}
        >
          <Input.TextArea
            rows={2}
            placeholder={t('performance.description_placeholder', 'Add more details about your goal...')}
            maxLength={500}
          />
        </Form.Item>

        {/* Target Value */}
        <Form.Item
          name="target_value"
          label={t('performance.target_value', 'Target Value')}
          rules={[{ required: true, message: t('performance.target_required', 'Please enter target value') }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            {...(selectedType ? getTargetConfig(selectedType) : {})}
            addonAfter={selectedType ? getTargetConfig(selectedType).suffix : undefined}
          />
        </Form.Item>

        {/* End Date */}
        <Form.Item
          name="end_date"
          label={t('performance.end_date', 'Target Date')}
          rules={[{ required: true, message: t('performance.date_required', 'Please select end date') }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={(date) => date.isBefore(dayjs(), 'day')}
            format="MMMM D, YYYY"
            presets={[
              { label: 'In 1 Week', value: dayjs().add(7, 'day') },
              { label: 'In 2 Weeks', value: dayjs().add(14, 'day') },
              { label: 'In 1 Month', value: dayjs().add(1, 'month') },
              { label: 'In 3 Months', value: dayjs().add(3, 'month') },
              { label: 'End of Year', value: dayjs().endOf('year') },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default CreateGoalModal;
