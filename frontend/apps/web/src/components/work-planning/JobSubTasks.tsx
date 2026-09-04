import React, { useState } from 'react';
import { Popover, Checkbox, Input, Button, Tooltip, Spin, Empty, Typography, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobSubTasksApi, type JobSubTask } from '@inspection/shared';

const { Text } = Typography;

/**
 * The "+" on a planned job: sub-tasks and team notes.
 *
 * These stick to the JOB, not to its place in the week. Send the job back to
 * the pool and pull it out again three weeks later — the list comes back with
 * it. The backend does that by anchoring on the SAP order number rather than
 * the plan row (see app/models/work_plan_job_task.py); the client only ever
 * passes a job id.
 *
 * Everything here calls stopPropagation aggressively. The job row it sits in is
 * BOTH a dnd-kit drag source and a click target that opens the job modal, so a
 * bare click on a checkbox would drag the job to another day or open a dialog
 * over the list.
 */

export const subTaskQueryKey = (jobId: number) => ['job-sub-tasks', jobId] as const;

interface JobSubTasksProps {
  jobId: number;
  /** Count shown before the popover is ever opened, from the plan-wide fetch. */
  total?: number;
  done?: number;
  /** Plan id, so the plan-wide badge cache is refreshed after every change. */
  planId?: number;
  /** Engineers and admins manage the list; everyone else only reads it. */
  canEdit?: boolean;
}

/** Swallow drag + click so the row underneath does not react. */
const stop = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const JobSubTasksInner: React.FC<JobSubTasksProps> = ({
  jobId,
  total = 0,
  done = 0,
  planId,
  canEdit = true,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();

  // Only fetched once the popover is opened — the board draws ~100 of these.
  const { data, isLoading } = useQuery({
    queryKey: subTaskQueryKey(jobId),
    queryFn: async () => (await jobSubTasksApi.list(jobId)).data,
    enabled: open,
  });

  const tasks: JobSubTask[] = data?.tasks ?? [];
  const shownTotal = data?.total ?? total;
  const shownDone = data?.done ?? done;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: subTaskQueryKey(jobId) });
    if (planId) queryClient.invalidateQueries({ queryKey: ['plan-job-sub-tasks', planId] });
  };

  const addMutation = useMutation({
    mutationFn: (content: string) => jobSubTasksApi.add(jobId, content),
    onSuccess: () => {
      setDraft('');
      refresh();
    },
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not add the sub-task'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, isDone }: { taskId: number; isDone: boolean }) =>
      jobSubTasksApi.update(jobId, taskId, { is_done: isDone }),
    onSuccess: refresh,
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not update the sub-task'),
  });

  const removeMutation = useMutation({
    mutationFn: (taskId: number) => jobSubTasksApi.remove(jobId, taskId),
    onSuccess: refresh,
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not remove the sub-task'),
  });

  const submitDraft = () => {
    const content = draft.trim();
    if (!content) return;
    addMutation.mutate(content);
  };

  const content = (
    <div style={{ width: 300 }} onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin size="small" />
        </div>
      ) : tasks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text style={{ fontSize: 12 }}>No sub-tasks yet</Text>}
          style={{ margin: '8px 0' }}
        />
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 8 }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '4px 2px',
                borderBottom: '1px solid #f5f5f5',
              }}
            >
              <Checkbox
                checked={task.is_done}
                disabled={toggleMutation.isPending}
                onChange={(e) =>
                  toggleMutation.mutate({ taskId: task.id, isDone: e.target.checked })
                }
                style={{ marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 12,
                    wordBreak: 'break-word',
                    textDecoration: task.is_done ? 'line-through' : undefined,
                    color: task.is_done ? '#8c8c8c' : '#262626',
                  }}
                >
                  {task.content}
                </Text>
                {task.is_done && task.done_by_name ? (
                  <div>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      done by {task.done_by_name}
                    </Text>
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(task.id)}
                  style={{ flexShrink: 0, color: '#bfbfbf' }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canEdit ? (
        <Input.Search
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onSearch={submitDraft}
          placeholder="Add a sub-task or note"
          maxLength={500}
          size="small"
          enterButton={<PlusOutlined />}
          loading={addMutation.isPending}
        />
      ) : null}
    </div>
  );

  const hasAny = shownTotal > 0;

  return (
    <span onClick={stop} onPointerDown={stop} style={{ flexShrink: 0, display: 'inline-flex' }}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="rightTop"
        title={<span style={{ fontSize: 12 }}>Sub-tasks &amp; notes</span>}
        content={content}
        destroyOnHidden
      >
        <Tooltip title={hasAny ? `${shownDone}/${shownTotal} sub-tasks done` : 'Add a sub-task or note'}>
          <span
            role="button"
            tabIndex={0}
            style={{
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
              padding: '0 5px',
              borderRadius: 8,
              cursor: 'pointer',
              userSelect: 'none',
              // Green once every line is ticked — readable at a glance across
              // a whole day column without opening anything.
              color: hasAny ? (shownDone === shownTotal ? '#237804' : '#0958d9') : '#8c8c8c',
              background: hasAny ? (shownDone === shownTotal ? '#f6ffed' : '#e6f4ff') : 'transparent',
              border: `1px dashed ${hasAny ? 'transparent' : '#d9d9d9'}`,
            }}
          >
            {hasAny ? `☑ ${shownDone}/${shownTotal}` : '+'}
          </span>
        </Tooltip>
      </Popover>
    </span>
  );
};

export const JobSubTasks = React.memo(JobSubTasksInner);

export default JobSubTasks;
