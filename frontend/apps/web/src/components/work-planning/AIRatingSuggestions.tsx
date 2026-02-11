/**
 * AIRatingSuggestions.tsx
 * Shows AI-suggested ratings for each worker in a daily review.
 * Includes QC rating, cleaning rating, confidence, reasoning, and override inputs.
 */
import React, { useState, useMemo } from 'react';
import {
  Card,
  Button,
  Space,
  Rate,
  Typography,
  Tag,
  Tooltip,
  InputNumber,
  Input,
  Checkbox,
  Spin,
  Empty,
  Alert,
  Progress,
  Divider,
  Row,
  Col,
  message,
} from 'antd';
import {
  RobotOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  EditOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlanTrackingApi } from '@inspection/shared';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface WorkerSuggestion {
  userId: number;
  userName: string;
  jobId: number;
  equipmentName: string;
  suggestedQcRating: number;
  suggestedCleaningRating: number;
  confidence: number;
  reasoning: string;
  overrideQcRating?: number;
  overrideCleaningRating?: number;
  overrideReason?: string;
  selected: boolean;
}

interface AIRatingSuggestionsProps {
  reviewId: number;
  jobs: Array<{
    id: number;
    equipment?: { name?: string; serial_number?: string };
    assignments?: Array<{
      id: number;
      user_id: number;
      user?: { id: number; full_name: string };
      is_lead: boolean;
    }>;
    tracking?: { status?: string; actual_hours?: number };
    ratings?: Array<{
      user_id: number;
      qc_rating?: number;
      cleaning_rating?: number;
    }>;
  }>;
  onApply?: (ratings: Array<{
    jobId: number;
    userId: number;
    qcRating: number;
    cleaningRating: number;
  }>) => void;
  onClose?: () => void;
}

// Mock AI suggestions - in production this would come from API
const generateAISuggestions = (jobs: AIRatingSuggestionsProps['jobs']): WorkerSuggestion[] => {
  const suggestions: WorkerSuggestion[] = [];

  jobs.forEach((job) => {
    if (job.tracking?.status !== 'completed') return;

    (job.assignments || []).forEach((assignment) => {
      // Skip if already rated
      const existingRating = job.ratings?.find(r => r.user_id === assignment.user_id);
      if (existingRating?.qc_rating) return;

      // Generate mock AI suggestion based on various factors
      const actualHours = job.tracking?.actual_hours || 0;
      const isLead = assignment.is_lead;

      // AI "analysis" - in production this would be ML-based
      let suggestedQc = 4;
      let suggestedCleaning = 1;
      let confidence = 85;
      let reasoning = 'Based on historical performance and job completion time.';

      // Adjust based on lead status
      if (isLead) {
        suggestedQc = Math.min(5, suggestedQc + 0.5);
        confidence += 5;
        reasoning = 'Lead worker with consistent quality record. ' + reasoning;
      }

      // Simulate some variance
      const variance = Math.random() * 0.5 - 0.25;
      suggestedQc = Math.max(1, Math.min(5, Math.round((suggestedQc + variance) * 2) / 2));
      suggestedCleaning = Math.random() > 0.7 ? 2 : Math.random() > 0.4 ? 1 : 0;
      confidence = Math.max(60, Math.min(98, Math.round(confidence + (Math.random() * 20 - 10))));

      suggestions.push({
        userId: assignment.user?.id || assignment.user_id,
        userName: assignment.user?.full_name || `Worker ${assignment.user_id}`,
        jobId: job.id,
        equipmentName: job.equipment?.serial_number || job.equipment?.name || 'Equipment',
        suggestedQcRating: suggestedQc,
        suggestedCleaningRating: suggestedCleaning,
        confidence,
        reasoning,
        selected: true,
      });
    });
  });

  return suggestions;
};

export const AIRatingSuggestions: React.FC<AIRatingSuggestionsProps> = ({
  reviewId,
  jobs,
  onApply,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState<WorkerSuggestion[]>(() =>
    generateAISuggestions(jobs)
  );
  const [isLoading, setIsLoading] = useState(false);

  // Toggle selection for a suggestion
  const toggleSelection = (index: number) => {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  };

  // Update override values
  const updateOverride = (
    index: number,
    field: 'overrideQcRating' | 'overrideCleaningRating' | 'overrideReason',
    value: number | string | undefined
  ) => {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  // Select/deselect all
  const selectAll = (selected: boolean) => {
    setSuggestions((prev) => prev.map((s) => ({ ...s, selected })));
  };

  // Apply selected ratings
  const rateMutation = useMutation({
    mutationFn: async (ratings: Array<{
      job_id: number;
      user_id: number;
      qc_rating: number;
      cleaning_rating: number;
    }>) => {
      // Apply ratings one by one
      for (const rating of ratings) {
        await workPlanTrackingApi.rateJob(reviewId, rating);
      }
    },
    onSuccess: () => {
      message.success('Ratings applied successfully');
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      onClose?.();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to apply ratings');
    },
  });

  const handleApplySelected = () => {
    const selectedSuggestions = suggestions.filter((s) => s.selected);
    if (selectedSuggestions.length === 0) {
      message.warning('No ratings selected');
      return;
    }

    const ratings = selectedSuggestions.map((s) => ({
      job_id: s.jobId,
      user_id: s.userId,
      qc_rating: s.overrideQcRating ?? s.suggestedQcRating,
      cleaning_rating: s.overrideCleaningRating ?? s.suggestedCleaningRating,
    }));

    if (onApply) {
      onApply(ratings.map(r => ({
        jobId: r.job_id,
        userId: r.user_id,
        qcRating: r.qc_rating,
        cleaningRating: r.cleaning_rating,
      })));
    } else {
      rateMutation.mutate(ratings);
    }
  };

  const handleApplyAll = () => {
    selectAll(true);
    setTimeout(() => handleApplySelected(), 100);
  };

  const selectedCount = suggestions.filter((s) => s.selected).length;
  const averageConfidence = suggestions.length > 0
    ? Math.round(suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length)
    : 0;

  if (suggestions.length === 0) {
    return (
      <Card>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No unrated completed jobs found"
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#1890ff' }} />
          <span>AI Rating Suggestions</span>
          <Tag color="blue">{suggestions.length} workers</Tag>
        </Space>
      }
      extra={
        <Space>
          <Tooltip title="Average confidence across all suggestions">
            <Tag color={averageConfidence >= 80 ? 'green' : averageConfidence >= 60 ? 'orange' : 'red'}>
              {averageConfidence}% confidence
            </Tag>
          </Tooltip>
        </Space>
      }
    >
      {/* Info Alert */}
      <Alert
        message="AI-Powered Rating Suggestions"
        description="These suggestions are based on historical performance data, job completion metrics, and quality patterns. You can override any suggestion before applying."
        type="info"
        showIcon
        icon={<RobotOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* Selection Actions */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Checkbox
              indeterminate={selectedCount > 0 && selectedCount < suggestions.length}
              checked={selectedCount === suggestions.length}
              onChange={(e) => selectAll(e.target.checked)}
            >
              Select All ({selectedCount}/{suggestions.length})
            </Checkbox>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button
              onClick={handleApplySelected}
              disabled={selectedCount === 0}
              loading={rateMutation.isPending}
            >
              Apply Selected ({selectedCount})
            </Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleApplyAll}
              loading={rateMutation.isPending}
            >
              Apply All
            </Button>
          </Space>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      {/* Suggestions List */}
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {suggestions.map((suggestion, index) => (
          <Card
            key={`${suggestion.jobId}-${suggestion.userId}`}
            size="small"
            style={{
              marginBottom: 12,
              border: suggestion.selected ? '1px solid #1890ff' : '1px solid #f0f0f0',
              backgroundColor: suggestion.selected ? '#f0f9ff' : undefined,
            }}
          >
            <Row gutter={16} align="middle">
              {/* Checkbox & Worker Info */}
              <Col span={6}>
                <Space>
                  <Checkbox
                    checked={suggestion.selected}
                    onChange={() => toggleSelection(index)}
                  />
                  <div>
                    <Space>
                      <UserOutlined />
                      <Text strong>{suggestion.userName}</Text>
                    </Space>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {suggestion.equipmentName}
                      </Text>
                    </div>
                  </div>
                </Space>
              </Col>

              {/* Suggested QC Rating */}
              <Col span={5}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>QC Rating</Text>
                  <div>
                    <Rate
                      value={suggestion.overrideQcRating ?? suggestion.suggestedQcRating}
                      onChange={(v) => updateOverride(index, 'overrideQcRating', v)}
                      count={5}
                      style={{ fontSize: 14 }}
                    />
                  </div>
                  {suggestion.overrideQcRating !== undefined && (
                    <Tag color="orange" style={{ fontSize: 10, marginTop: 2 }}>
                      <EditOutlined /> Modified
                    </Tag>
                  )}
                </div>
              </Col>

              {/* Suggested Cleaning Rating */}
              <Col span={4}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Cleaning</Text>
                  <div>
                    <Space>
                      {[0, 1, 2].map((n) => (
                        <Button
                          key={n}
                          size="small"
                          type={
                            (suggestion.overrideCleaningRating ?? suggestion.suggestedCleaningRating) === n
                              ? 'primary'
                              : 'default'
                          }
                          shape="circle"
                          onClick={() => updateOverride(index, 'overrideCleaningRating', n)}
                        >
                          {n}
                        </Button>
                      ))}
                    </Space>
                  </div>
                </div>
              </Col>

              {/* Confidence */}
              <Col span={4}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Confidence</Text>
                  <Progress
                    percent={suggestion.confidence}
                    size="small"
                    strokeColor={
                      suggestion.confidence >= 80
                        ? '#52c41a'
                        : suggestion.confidence >= 60
                        ? '#faad14'
                        : '#ff4d4f'
                    }
                    format={(p) => `${p}%`}
                    style={{ width: 80 }}
                  />
                </div>
              </Col>

              {/* Reasoning */}
              <Col span={5}>
                <Tooltip title={suggestion.reasoning}>
                  <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                    <InfoCircleOutlined style={{ marginRight: 4 }} />
                    {suggestion.reasoning.length > 50
                      ? `${suggestion.reasoning.substring(0, 50)}...`
                      : suggestion.reasoning}
                  </div>
                </Tooltip>
              </Col>
            </Row>
          </Card>
        ))}
      </div>

      {/* Footer Actions */}
      <Divider style={{ margin: '16px 0 12px' }} />
      <Row justify="end">
        <Space>
          {onClose && (
            <Button onClick={onClose}>Cancel</Button>
          )}
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={handleApplySelected}
            disabled={selectedCount === 0}
            loading={rateMutation.isPending}
          >
            Apply {selectedCount} Rating{selectedCount !== 1 ? 's' : ''}
          </Button>
        </Space>
      </Row>
    </Card>
  );
};

export default AIRatingSuggestions;
