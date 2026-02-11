/**
 * Daily Review Page (Web)
 * Engineer reviews jobs, rates workers, handles pauses, manages carry-overs.
 * Enhanced with AI-powered suggestions and worker feedback.
 */
import React, { useState, useMemo } from 'react';
import {
  Card, Row, Col, Button, Tag, Statistic, DatePicker, Select, Table, Modal,
  Rate, Input, Alert, Badge, Space, Typography, Tooltip, Progress, message,
  Tabs, Drawer, Switch, Divider,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, PauseCircleOutlined,
  CarryOutOutlined, StarOutlined, SendOutlined, ExclamationCircleOutlined,
  RobotOutlined, UserOutlined, BulbOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlanTrackingApi } from '@inspection/shared';
import type {
  ShiftType, WorkPlanDailyReview, WorkPlanJobRating,
} from '@inspection/shared';
import dayjs from 'dayjs';

import {
  AIRatingSuggestions,
  FeedbackSummaryCard,
  IncompleteJobsWarning,
  generateMockPredictions,
  RatingBiasAlert,
  detectRatingBias,
} from '../../components/work-planning';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  incomplete: 'red',
  in_progress: 'orange',
  paused: 'purple',
  not_started: 'default',
  pending: 'default',
};

export default function DailyReviewPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [shift, setShift] = useState<ShiftType>('day');
  const [ratingModal, setRatingModal] = useState<{ visible: boolean; job: any; worker: any }>({
    visible: false, job: null, worker: null,
  });
  const [qcRating, setQcRating] = useState(0);
  const [qcReason, setQcReason] = useState('');
  const [cleaningRating, setCleaningRating] = useState(0);
  const [aiSuggestionsOpen, setAiSuggestionsOpen] = useState(false);
  const [showWorkerFeedback, setShowWorkerFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState('jobs');
  const [aiAssistanceEnabled, setAiAssistanceEnabled] = useState(true);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['daily-review', selectedDate, shift],
    queryFn: () => workPlanTrackingApi.getDailyReview({ date: selectedDate, shift }),
  });

  const review: WorkPlanDailyReview | undefined = data?.data?.review;
  const jobs: any[] = data?.data?.jobs || [];

  // AI predictions for incomplete jobs
  const incompleteJobPredictions = useMemo(() => {
    if (!aiAssistanceEnabled) return [];
    return generateMockPredictions(
      jobs.filter(j => j.tracking?.status !== 'completed')
    );
  }, [jobs, aiAssistanceEnabled]);

  // Get unique workers from jobs for feedback cards
  const workers = useMemo(() => {
    const workerMap = new Map<number, any>();
    jobs.forEach((job) => {
      (job.assignments || []).forEach((a: any) => {
        if (a.user && !workerMap.has(a.user.id)) {
          const workerJobs = jobs.filter(j =>
            j.assignments?.some((assign: any) => assign.user?.id === a.user.id)
          );
          const completed = workerJobs.filter(j => j.tracking?.status === 'completed').length;
          const ratings = workerJobs
            .flatMap(j => j.ratings || [])
            .filter((r: any) => r.user_id === a.user.id);

          workerMap.set(a.user.id, {
            ...a.user,
            jobCount: workerJobs.length,
            completedCount: completed,
            avgQcRating: ratings.length > 0
              ? ratings.reduce((sum: number, r: any) => sum + (r.qc_rating || 0), 0) / ratings.length
              : null,
            avgCleaningRating: ratings.length > 0
              ? ratings.reduce((sum: number, r: any) => sum + (r.cleaning_rating || 0), 0) / ratings.length
              : null,
          });
        }
      });
    });
    return Array.from(workerMap.values());
  }, [jobs]);

  // Count completed jobs that need rating
  const completedUnratedCount = jobs.filter(j => {
    if (j.tracking?.status !== 'completed') return false;
    const workers = j.assignments || [];
    return workers.some((a: any) => !j.ratings?.find((r: any) => r.user_id === a.user?.id && r.qc_rating));
  }).length;

  // Mutations
  const rateMutation = useMutation({
    mutationFn: (payload: any) => workPlanTrackingApi.rateJob(review!.id, payload),
    onSuccess: () => {
      setRatingModal({ visible: false, job: null, worker: null });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      message.success('Rating saved');
    },
    onError: (err: any) => message.error(err?.response?.data?.message || 'Failed'),
  });

  const approvePauseMutation = useMutation({
    mutationFn: (id: number) => workPlanTrackingApi.approvePause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      message.success('Pause approved');
    },
  });

  const rejectPauseMutation = useMutation({
    mutationFn: (id: number) => workPlanTrackingApi.rejectPause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      message.info('Pause rejected');
    },
  });

  const carryOverMutation = useMutation({
    mutationFn: (jobId: number) => workPlanTrackingApi.createCarryOver(review!.id, { original_job_id: jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      message.success('Job carried over');
    },
    onError: (err: any) => message.error(err?.response?.data?.message || 'Failed'),
  });

  const consumeMaterialsMutation = useMutation({
    mutationFn: (payload: any) => workPlanTrackingApi.consumeMaterials(review!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      message.success('Materials recorded');
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.submitReview(review!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      message.success('Review submitted!');
    },
    onError: (err: any) => message.error(err?.response?.data?.message || 'Cannot submit'),
  });

  const openRatingModal = (job: any, worker: any) => {
    const existing = job.ratings?.find((r: any) => r.user_id === worker.id);
    setQcRating(existing?.qc_rating || 0);
    setQcReason(existing?.qc_reason || '');
    setCleaningRating(existing?.cleaning_rating ?? 0);
    setRatingModal({ visible: true, job, worker });
  };

  const handleSubmitRating = () => {
    if (qcRating > 0 && (qcRating < 3 || qcRating > 4) && !qcReason.trim()) {
      message.warning('QC reason required for ratings below 3 or above 4');
      return;
    }
    rateMutation.mutate({
      job_id: ratingModal.job.id,
      user_id: ratingModal.worker.id,
      qc_rating: qcRating || undefined,
      qc_reason: qcReason || undefined,
      cleaning_rating: cleaningRating,
    });
  };

  const handleAIRatingsApplied = (ratings: any[]) => {
    message.success(`Applied ${ratings.length} AI-suggested ratings`);
    setAiSuggestionsOpen(false);
    queryClient.invalidateQueries({ queryKey: ['daily-review'] });
  };

  const columns = [
    {
      title: 'Type',
      dataIndex: 'job_type',
      width: 80,
      render: (type: string) => (
        <Tag color={type === 'pm' ? 'blue' : type === 'defect' ? 'red' : 'green'}>
          {type?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Equipment',
      key: 'equipment',
      render: (_: any, record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.equipment?.serial_number || record.equipment?.name || 'Unknown'}</Text>
          {record.equipment?.name && record.equipment?.serial_number && (
            <Text type="secondary" style={{ fontSize: 11 }}>{record.equipment.name}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_: any, record: any) => {
        const status = record.tracking?.status || 'pending';
        return <Tag color={STATUS_COLORS[status]}>{status.replace('_', ' ')}</Tag>;
      },
    },
    {
      title: 'Hours',
      key: 'hours',
      width: 130,
      render: (_: any, record: any) => (
        <Text>
          {record.estimated_hours || '--'}h est / {record.tracking?.actual_hours || '--'}h actual
        </Text>
      ),
    },
    {
      title: 'Workers',
      key: 'workers',
      width: 220,
      render: (_: any, record: any) => (
        <Space direction="vertical" size={2}>
          {(record.assignments || []).map((a: any) => {
            const rated = record.ratings?.find((r: any) => r.user_id === a.user?.id);
            return (
              <Space key={a.id} size={4}>
                <Text>{a.user?.full_name}{a.is_lead ? ' (Lead)' : ''}</Text>
                {record.tracking?.status === 'completed' && (
                  <Button
                    size="small"
                    type={rated ? 'default' : 'primary'}
                    icon={<StarOutlined />}
                    onClick={() => openRatingModal(record, a.user)}
                  >
                    {rated ? `${rated.qc_rating || ''}` : 'Rate'}
                  </Button>
                )}
              </Space>
            );
          })}
        </Space>
      ),
    },
    {
      title: 'Pauses',
      key: 'pauses',
      width: 150,
      render: (_: any, record: any) => {
        const pending = (record.pause_requests || []).filter((pr: any) => pr.status === 'pending');
        if (pending.length === 0) return <Text type="secondary">None</Text>;
        return (
          <Space direction="vertical" size={2}>
            {pending.map((pr: any) => (
              <Space key={pr.id} size={4}>
                <Tooltip title={pr.reason_details || pr.reason_category}>
                  <Tag color="orange">{pr.reason_category.replace(/_/g, ' ')}</Tag>
                </Tooltip>
                <Button size="small" type="primary" onClick={() => approvePauseMutation.mutate(pr.id)}>
                  OK
                </Button>
                <Button size="small" danger onClick={() => rejectPauseMutation.mutate(pr.id)}>
                  No
                </Button>
              </Space>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_: any, record: any) => {
        const status = record.tracking?.status;
        return (
          <Space direction="vertical" size={4}>
            {(status === 'incomplete' || status === 'not_started') && (
              <Button
                size="small"
                icon={<CarryOutOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: 'Carry Over Job?',
                    content: 'This will create a copy for the next day.',
                    onOk: () => carryOverMutation.mutate(record.id),
                  });
                }}
              >
                Carry Over
              </Button>
            )}
            {record.materials?.length > 0 && (
              <Button
                size="small"
                onClick={() => {
                  consumeMaterialsMutation.mutate({
                    materials: record.materials.map((m: any) => ({
                      material_id: m.id,
                      job_id: record.id,
                      consumed: true,
                    })),
                  });
                }}
              >
                Materials ({record.materials.length})
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header with AI Toggle */}
      <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Daily Review</Title>
        </Col>
        <Col>
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(d) => d && setSelectedDate(d.format('YYYY-MM-DD'))}
          />
        </Col>
        <Col>
          <Select value={shift} onChange={setShift} style={{ width: 120 }}>
            <Select.Option value="day">Day Shift</Select.Option>
            <Select.Option value="night">Night Shift</Select.Option>
          </Select>
        </Col>
        <Col>
          <Tooltip title="Toggle AI-powered suggestions">
            <Space size={4}>
              <Switch
                checked={aiAssistanceEnabled}
                onChange={setAiAssistanceEnabled}
                checkedChildren={<RobotOutlined />}
                unCheckedChildren={<RobotOutlined />}
                size="small"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>AI</Text>
            </Space>
          </Tooltip>
        </Col>
        <Col flex="auto" />
        {aiAssistanceEnabled && completedUnratedCount > 0 && (
          <Col>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => setAiSuggestionsOpen(true)}
            >
              Get AI Suggestions
              <Badge count={completedUnratedCount} style={{ marginLeft: 8, backgroundColor: '#fff', color: '#1890ff' }} />
            </Button>
          </Col>
        )}
        {review && review.status !== 'submitted' && (
          <Col>
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              onClick={() => {
                if (review.has_unresolved_pauses) {
                  message.warning('Resolve all pause requests before submitting');
                  return;
                }
                Modal.confirm({
                  title: 'Submit Daily Review?',
                  content: 'This will finalize ratings and award points.',
                  onOk: () => submitMutation.mutate(),
                });
              }}
              disabled={!review.can_submit || submitMutation.isPending}
              loading={submitMutation.isPending}
            >
              Submit Review
            </Button>
          </Col>
        )}
      </Row>

      {/* AI-powered incomplete jobs warning */}
      {aiAssistanceEnabled && incompleteJobPredictions.length > 0 && (
        <IncompleteJobsWarning
          jobs={incompleteJobPredictions}
          compact
          maxItems={3}
          onTakeAction={(jobId, action) => {
            message.info(`Recommended action for job ${jobId}: ${action}`);
          }}
        />
      )}

      {/* Summary stats */}
      {review && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card size="small">
                <Statistic title="Total Jobs" value={review.total_jobs} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="Completed" value={review.approved_jobs} valueStyle={{ color: '#3f8600' }} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="Incomplete" value={review.incomplete_jobs} valueStyle={{ color: '#cf1322' }} prefix={<CloseCircleOutlined />} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="Not Started" value={review.not_started_jobs} prefix={<PauseCircleOutlined />} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="Carry Over" value={review.carry_over_jobs} valueStyle={{ color: '#fa8c16' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" bodyStyle={{ textAlign: 'center' }}>
                <Progress
                  type="circle"
                  percent={review.completion_rate}
                  width={50}
                  strokeColor={review.completion_rate >= 90 ? '#52c41a' : review.completion_rate >= 70 ? '#faad14' : '#ff4d4f'}
                />
              </Card>
            </Col>
          </Row>

          {review.has_unresolved_pauses && (
            <Alert
              message={`${review.total_pause_requests - review.resolved_pause_requests} unresolved pause request(s) - must resolve before submitting`}
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              style={{ marginBottom: 16 }}
            />
          )}

          {review.status === 'submitted' && (
            <Alert message="Review submitted" type="success" showIcon style={{ marginBottom: 16 }} />
          )}
        </>
      )}

      {/* Main Content Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'jobs',
            label: (
              <Space>
                <BarChartOutlined />
                Jobs
                <Badge count={jobs.length} style={{ backgroundColor: '#1890ff' }} />
              </Space>
            ),
            children: (
              <Table
                columns={columns}
                dataSource={jobs}
                rowKey="id"
                loading={isLoading}
                pagination={false}
                size="small"
                scroll={{ x: 1000 }}
              />
            ),
          },
          {
            key: 'workers',
            label: (
              <Space>
                <UserOutlined />
                Worker Feedback
                <Badge count={workers.length} style={{ backgroundColor: '#52c41a' }} />
              </Space>
            ),
            children: (
              <div>
                <Row justify="end" style={{ marginBottom: 16 }}>
                  <Space>
                    <Switch
                      checked={showWorkerFeedback}
                      onChange={setShowWorkerFeedback}
                    />
                    <Text type="secondary">Detailed View</Text>
                  </Space>
                </Row>
                <Row gutter={[16, 16]}>
                  {workers.map((worker) => (
                    <Col key={worker.id} span={showWorkerFeedback ? 24 : 8}>
                      <FeedbackSummaryCard
                        worker={{
                          id: worker.id,
                          fullName: worker.full_name,
                          role: worker.role,
                        }}
                        period={{
                          start: selectedDate,
                          end: selectedDate,
                          label: 'Today',
                        }}
                        performance={{
                          avgQcRating: worker.avgQcRating,
                          avgCleaningRating: worker.avgCleaningRating,
                          avgTimeRating: null,
                          totalJobs: worker.jobCount,
                          completedJobs: worker.completedCount,
                          completionRate: worker.jobCount > 0
                            ? Math.round((worker.completedCount / worker.jobCount) * 100)
                            : 0,
                        }}
                        compact={!showWorkerFeedback}
                      />
                    </Col>
                  ))}
                </Row>
              </div>
            ),
          },
        ]}
      />

      {/* Rating Modal */}
      <Modal
        title={`Rate: ${ratingModal.worker?.full_name || ''}`}
        open={ratingModal.visible}
        onOk={handleSubmitRating}
        onCancel={() => setRatingModal({ visible: false, job: null, worker: null })}
        confirmLoading={rateMutation.isPending}
        okText="Save Rating"
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>QC Rating (1-5):</Text>
          <br />
          <Rate value={qcRating} onChange={setQcRating} count={5} />
        </div>

        {qcRating > 0 && (qcRating < 3 || qcRating > 4) && (
          <div style={{ marginBottom: 16 }}>
            <Text type="danger">Reason required:</Text>
            <TextArea
              rows={2}
              value={qcReason}
              onChange={(e) => setQcReason(e.target.value)}
              placeholder="Explain the rating..."
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <Text strong>Cleaning Rating (0-2):</Text>
          <br />
          <Space>
            {[0, 1, 2].map((n) => (
              <Button
                key={n}
                type={cleaningRating === n ? 'primary' : 'default'}
                shape="circle"
                onClick={() => setCleaningRating(n)}
              >
                {n}
              </Button>
            ))}
          </Space>
        </div>

        {ratingModal.job?.tracking?.actual_hours && ratingModal.job?.estimated_hours && (
          <Alert
            message={`Time: ${ratingModal.job.estimated_hours}h est / ${ratingModal.job.tracking.actual_hours}h actual`}
            type="info"
            style={{ marginTop: 8 }}
          />
        )}
      </Modal>

      {/* AI Suggestions Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#1890ff' }} />
            <span>AI Rating Suggestions</span>
          </Space>
        }
        open={aiSuggestionsOpen}
        onClose={() => setAiSuggestionsOpen(false)}
        width={900}
        destroyOnClose
      >
        {review && (
          <AIRatingSuggestions
            reviewId={review.id}
            jobs={jobs}
            onApply={handleAIRatingsApplied}
            onClose={() => setAiSuggestionsOpen(false)}
          />
        )}
      </Drawer>
    </div>
  );
}
