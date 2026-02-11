import { useState } from 'react';
import { Card, Button, Typography, Space, Segmented, Empty, Spin, Modal, message, Row, Col } from 'antd';
import {
  PlusOutlined,
  TrophyOutlined,
  FilterOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GoalProgress, type Goal } from './GoalProgress';
import { CreateGoalModal, type CreateGoalPayload } from './CreateGoalModal';
import { apiClient, type GoalStatus } from '@inspection/shared';

const { Title, Text } = Typography;

export interface GoalsManagerProps {
  userId?: number;
  readOnly?: boolean;
  compact?: boolean;
}

type FilterStatus = 'all' | GoalStatus;

// API functions
const performanceApi = {
  getGoals: (userId?: number, status?: string) =>
    apiClient.get('/api/performance/goals', { params: { user_id: userId, status } }),
  createGoal: (payload: CreateGoalPayload) =>
    apiClient.post('/api/performance/goals', payload),
  updateGoal: (goalId: number, payload: Partial<CreateGoalPayload>) =>
    apiClient.put(`/api/performance/goals/${goalId}`, payload),
  deleteGoal: (goalId: number) =>
    apiClient.delete(`/api/performance/goals/${goalId}`),
};

export function GoalsManager({ userId, readOnly = false, compact = false }: GoalsManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('active');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);

  // Fetch goals
  const { data: goalsData, isLoading } = useQuery({
    queryKey: ['performance', 'goals', userId, filterStatus],
    queryFn: () =>
      performanceApi
        .getGoals(userId, filterStatus === 'all' ? undefined : filterStatus)
        .then((r) => r.data),
  });

  const goals: Goal[] = goalsData?.data || [];

  // Create goal mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateGoalPayload) => performanceApi.createGoal(payload),
    onSuccess: () => {
      message.success(t('performance.goal_created', 'Goal created successfully!'));
      queryClient.invalidateQueries({ queryKey: ['performance', 'goals'] });
      setCreateModalOpen(false);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('performance.create_error', 'Failed to create goal'));
    },
  });

  // Update goal mutation
  const updateMutation = useMutation({
    mutationFn: ({ goalId, payload }: { goalId: number; payload: Partial<CreateGoalPayload> }) =>
      performanceApi.updateGoal(goalId, payload),
    onSuccess: () => {
      message.success(t('performance.goal_updated', 'Goal updated successfully!'));
      queryClient.invalidateQueries({ queryKey: ['performance', 'goals'] });
      setEditGoal(null);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('performance.update_error', 'Failed to update goal'));
    },
  });

  // Delete goal mutation
  const deleteMutation = useMutation({
    mutationFn: (goalId: number) => performanceApi.deleteGoal(goalId),
    onSuccess: () => {
      message.success(t('performance.goal_deleted', 'Goal deleted'));
      queryClient.invalidateQueries({ queryKey: ['performance', 'goals'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('performance.delete_error', 'Failed to delete goal'));
    },
  });

  const handleEdit = (goal: Goal) => {
    setEditGoal(goal);
  };

  const handleDelete = (goal: Goal) => {
    Modal.confirm({
      title: t('performance.delete_goal_confirm', 'Delete Goal?'),
      content: t('performance.delete_goal_description', 'This action cannot be undone.'),
      okText: t('common.delete', 'Delete'),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutate(goal.id),
    });
  };

  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'completed');
  const failedGoals = goals.filter((g) => g.status === 'failed');

  if (compact) {
    return (
      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: '#faad14' }} />
            {t('performance.active_goals', 'Active Goals')}
          </Space>
        }
        extra={
          !readOnly && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              {t('performance.new_goal', 'New Goal')}
            </Button>
          )
        }
        size="small"
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : activeGoals.length === 0 ? (
          <Empty
            description={t('performance.no_active_goals', 'No active goals')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeGoals.slice(0, 3).map((goal) => (
              <GoalProgress key={goal.id} goal={goal} compact />
            ))}
            {activeGoals.length > 3 && (
              <Text type="secondary" style={{ textAlign: 'center', fontSize: 12 }}>
                +{activeGoals.length - 3} {t('performance.more_goals', 'more goals')}
              </Text>
            )}
          </div>
        )}

        <CreateGoalModal
          open={createModalOpen}
          onCancel={() => setCreateModalOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          loading={createMutation.isPending}
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <TrophyOutlined style={{ color: '#faad14' }} />
          <Title level={4} style={{ margin: 0 }}>
            {t('performance.goals_manager', 'Goals Manager')}
          </Title>
        </Space>
      }
      extra={
        <Space>
          {!readOnly && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              {t('performance.create_goal', 'Create Goal')}
            </Button>
          )}
        </Space>
      }
    >
      {/* Filter */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <FilterOutlined style={{ color: '#8c8c8c' }} />
          <Segmented
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as FilterStatus)}
            options={[
              { label: t('common.all', 'All'), value: 'all' },
              {
                label: (
                  <Space size={4}>
                    <span>{t('performance.active', 'Active')}</span>
                    {activeGoals.length > 0 && (
                      <span
                        style={{
                          backgroundColor: '#1677ff',
                          color: '#fff',
                          padding: '0 6px',
                          borderRadius: 10,
                          fontSize: 11,
                        }}
                      >
                        {activeGoals.length}
                      </span>
                    )}
                  </Space>
                ),
                value: 'active',
              },
              {
                label: (
                  <Space size={4}>
                    <span>{t('performance.completed', 'Completed')}</span>
                    {completedGoals.length > 0 && (
                      <span
                        style={{
                          backgroundColor: '#52c41a',
                          color: '#fff',
                          padding: '0 6px',
                          borderRadius: 10,
                          fontSize: 11,
                        }}
                      >
                        {completedGoals.length}
                      </span>
                    )}
                  </Space>
                ),
                value: 'completed',
              },
              {
                label: (
                  <Space size={4}>
                    <span>{t('performance.failed', 'Failed')}</span>
                    {failedGoals.length > 0 && (
                      <span
                        style={{
                          backgroundColor: '#ff4d4f',
                          color: '#fff',
                          padding: '0 6px',
                          borderRadius: 10,
                          fontSize: 11,
                        }}
                      >
                        {failedGoals.length}
                      </span>
                    )}
                  </Space>
                ),
                value: 'failed',
              },
            ]}
          />
        </Space>
      </div>

      {/* Goals List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : goals.length === 0 ? (
        <Empty
          description={
            filterStatus === 'all'
              ? t('performance.no_goals', 'No goals yet. Create one to get started!')
              : t('performance.no_goals_filter', 'No {{status}} goals', { status: filterStatus })
          }
        >
          {!readOnly && filterStatus !== 'completed' && filterStatus !== 'failed' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              {t('performance.create_first_goal', 'Create Your First Goal')}
            </Button>
          )}
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {goals.map((goal) => (
            <Col key={goal.id} xs={24} md={12} lg={8}>
              <div style={{ position: 'relative' }}>
                <GoalProgress
                  goal={goal}
                  onEdit={readOnly ? undefined : handleEdit}
                />
                {!readOnly && goal.status === 'active' && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 20,
                      right: 16,
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(goal)}
                    />
                  </div>
                )}
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* Create/Edit Modal */}
      <CreateGoalModal
        open={createModalOpen || !!editGoal}
        onCancel={() => {
          setCreateModalOpen(false);
          setEditGoal(null);
        }}
        onSubmit={(payload) => {
          if (editGoal) {
            updateMutation.mutate({ goalId: editGoal.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
        loading={createMutation.isPending || updateMutation.isPending}
        editGoal={
          editGoal
            ? {
                id: editGoal.id,
                goal_type: editGoal.goal_type,
                title: editGoal.title || `Goal #${editGoal.id}`,
                description: editGoal.description,
                target_value: editGoal.target_value,
                end_date: editGoal.end_date,
              }
            : null
        }
      />
    </Card>
  );
}

export default GoalsManager;
