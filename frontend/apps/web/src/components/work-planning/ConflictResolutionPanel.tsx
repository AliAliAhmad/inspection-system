import React, { useState } from 'react';
import {
  Card,
  List,
  Tag,
  Button,
  Space,
  Modal,
  Input,
  Select,
  Empty,
  Badge,
  Tooltip,
  message,
} from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CheckOutlined,
  EyeInvisibleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';

interface SchedulingConflict {
  id: number;
  conflict_type: string;
  severity: 'info' | 'warning' | 'error';
  description: string;
  affected_job_ids?: number[];
  affected_user_ids?: number[];
  resolution?: string;
  is_ignored: boolean;
  is_resolved?: boolean;
  created_at: string;
}

interface ConflictResolutionPanelProps {
  planId: number;
  compact?: boolean;
  onRefresh?: () => void;
}

const severityConfig = {
  error: { color: 'red', icon: <ExclamationCircleOutlined /> },
  warning: { color: 'orange', icon: <WarningOutlined /> },
  info: { color: 'blue', icon: <InfoCircleOutlined /> },
};

const conflictTypeLabels: Record<string, string> = {
  capacity: 'Capacity',
  overlap: 'Overlap',
  skill: 'Skill',
  equipment: 'Equipment',
  dependency: 'Dependency',
};

export const ConflictResolutionPanel: React.FC<ConflictResolutionPanelProps> = ({
  planId,
  compact = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<SchedulingConflict | null>(null);
  const [resolution, setResolution] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const { data: conflicts, isLoading, refetch } = useQuery({
    queryKey: ['plan-conflicts', planId],
    queryFn: () => workPlansApi.listConflicts(planId),
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ conflictId, resolution }: { conflictId: number; resolution: string }) =>
      workPlansApi.resolveConflict(planId, conflictId, { resolution }),
    onSuccess: () => {
      message.success(t('workPlan.conflictResolved'));
      queryClient.invalidateQueries({ queryKey: ['plan-conflicts', planId] });
      setResolveModalOpen(false);
      setSelectedConflict(null);
      setResolution('');
      onRefresh?.();
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: (conflictId: number) => workPlansApi.ignoreConflict(planId, conflictId),
    onSuccess: () => {
      message.success(t('workPlan.conflictIgnored'));
      queryClient.invalidateQueries({ queryKey: ['plan-conflicts', planId] });
      onRefresh?.();
    },
  });

  const detectMutation = useMutation({
    mutationFn: () => workPlansApi.detectConflicts(planId),
    onSuccess: (result) => {
      message.info(t('workPlan.conflictsDetected', { count: result?.data?.conflicts?.length || 0 }));
      queryClient.invalidateQueries({ queryKey: ['plan-conflicts', planId] });
    },
  });

  const conflictList: SchedulingConflict[] = conflicts?.data?.conflicts || [];

  const filteredConflicts = conflictList.filter((c) => {
    if (filter === 'all') return !c.is_resolved && !c.is_ignored;
    if (filter === 'resolved') return c.is_resolved;
    if (filter === 'ignored') return c.is_ignored;
    return c.conflict_type === filter;
  });

  const unresolvedCount = conflictList.filter((c) => !c.is_resolved && !c.is_ignored).length;
  const errorCount = conflictList.filter((c) => c.severity === 'error' && !c.is_resolved && !c.is_ignored).length;

  const handleResolve = (conflict: SchedulingConflict) => {
    setSelectedConflict(conflict);
    setResolution('');
    setResolveModalOpen(true);
  };

  const handleSubmitResolution = () => {
    if (selectedConflict && resolution.trim()) {
      resolveMutation.mutate({ conflictId: selectedConflict.id, resolution });
    }
  };

  if (compact) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <WarningOutlined />
            {t('workPlan.conflicts')}
            {unresolvedCount > 0 && (
              <Badge count={unresolvedCount} style={{ backgroundColor: errorCount > 0 ? '#ff4d4f' : '#faad14' }} />
            )}
          </Space>
        }
      >
        {unresolvedCount === 0 ? (
          <div style={{ textAlign: 'center', color: '#52c41a' }}>
            <CheckOutlined /> {t('workPlan.noConflicts')}
          </div>
        ) : (
          <List
            size="small"
            dataSource={filteredConflicts.slice(0, 3)}
            renderItem={(item) => (
              <List.Item>
                <Tag color={severityConfig[item.severity].color}>
                  {conflictTypeLabels[item.conflict_type]}
                </Tag>
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description.substring(0, 50)}...
                </span>
              </List.Item>
            )}
          />
        )}
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <WarningOutlined />
          {t('workPlan.schedulingConflicts')}
          {unresolvedCount > 0 && (
            <Badge count={unresolvedCount} style={{ backgroundColor: errorCount > 0 ? '#ff4d4f' : '#faad14' }} />
          )}
        </Space>
      }
      extra={
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 130 }}
            size="small"
          >
            <Select.Option value="all">{t('workPlan.unresolved')}</Select.Option>
            <Select.Option value="capacity">{t('workPlan.capacity')}</Select.Option>
            <Select.Option value="skill">{t('workPlan.skill')}</Select.Option>
            <Select.Option value="equipment">{t('workPlan.equipment')}</Select.Option>
            <Select.Option value="resolved">{t('common.resolved')}</Select.Option>
            <Select.Option value="ignored">{t('common.ignored')}</Select.Option>
          </Select>
          <Button
            icon={<SyncOutlined />}
            size="small"
            onClick={() => detectMutation.mutate()}
            loading={detectMutation.isPending}
          >
            {t('workPlan.detectConflicts')}
          </Button>
        </Space>
      }
      loading={isLoading}
    >
      {filteredConflicts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            filter === 'all'
              ? t('workPlan.noConflicts')
              : t('workPlan.noConflictsOfType')
          }
        />
      ) : (
        <List
          dataSource={filteredConflicts}
          renderItem={(conflict) => (
            <List.Item
              actions={
                !conflict.is_resolved && !conflict.is_ignored
                  ? [
                      <Tooltip title={t('workPlan.resolve')} key="resolve">
                        <Button
                          type="link"
                          icon={<CheckOutlined />}
                          onClick={() => handleResolve(conflict)}
                        >
                          {t('workPlan.resolve')}
                        </Button>
                      </Tooltip>,
                      <Tooltip title={t('workPlan.ignore')} key="ignore">
                        <Button
                          type="link"
                          icon={<EyeInvisibleOutlined />}
                          onClick={() => ignoreMutation.mutate(conflict.id)}
                        >
                          {t('common.ignore')}
                        </Button>
                      </Tooltip>,
                    ]
                  : [
                      conflict.is_resolved && (
                        <Tag color="green" key="resolved">
                          {t('common.resolved')}
                        </Tag>
                      ),
                      conflict.is_ignored && (
                        <Tag color="default" key="ignored">
                          {t('common.ignored')}
                        </Tag>
                      ),
                    ]
              }
            >
              <List.Item.Meta
                avatar={
                  <Tag color={severityConfig[conflict.severity].color} icon={severityConfig[conflict.severity].icon}>
                    {conflictTypeLabels[conflict.conflict_type]}
                  </Tag>
                }
                title={conflict.description}
                description={
                  <Space>
                    {conflict.affected_job_ids && conflict.affected_job_ids.length > 0 && (
                      <span>
                        {t('workPlan.affectedJobs')}: {conflict.affected_job_ids.join(', ')}
                      </span>
                    )}
                    {conflict.resolution && (
                      <Tag color="green">{conflict.resolution}</Tag>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        title={t('workPlan.resolveConflict')}
        open={resolveModalOpen}
        onCancel={() => setResolveModalOpen(false)}
        onOk={handleSubmitResolution}
        confirmLoading={resolveMutation.isPending}
        okButtonProps={{ disabled: !resolution.trim() }}
      >
        {selectedConflict && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Tag color={severityConfig[selectedConflict.severity].color}>
                {conflictTypeLabels[selectedConflict.conflict_type]}
              </Tag>
              <p style={{ marginTop: 8 }}>{selectedConflict.description}</p>
            </div>
            <Input.TextArea
              placeholder={t('workPlan.enterResolution')}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
            />
          </>
        )}
      </Modal>
    </Card>
  );
};

export default ConflictResolutionPanel;
