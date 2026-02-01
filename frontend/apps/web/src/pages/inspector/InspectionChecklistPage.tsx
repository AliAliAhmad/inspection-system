import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Progress,
  Button,
  Radio,
  Input,
  InputNumber,
  Upload,
  Tag,
  Space,
  Spin,
  Alert,
  Collapse,
  List,
  Badge,
  message,
  Popconfirm,
  Descriptions,
} from 'antd';
import {
  CameraOutlined,
  PictureOutlined,
  StarFilled,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  inspectionsApi,
  inspectionAssignmentsApi,
  filesApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
} from '@inspection/shared';

export default function InspectionChecklistPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const assignmentId = Number(id);
  const isArabic = i18n.language === 'ar';

  // Warn on page close/refresh if inspection is in draft status
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Fetch inspection data by assignment ID (auto-creates if needed)
  const {
    data: inspection,
    isLoading,
    error,
    refetch: refetchInspection,
  } = useQuery({
    queryKey: ['inspection', 'by-assignment', assignmentId],
    queryFn: () =>
      inspectionsApi.getByAssignment(assignmentId).then((r) => (r.data as any).data as Inspection),
  });

  const inspectionId = inspection?.id;

  // Fetch progress using actual inspection ID
  const { data: progress, refetch: refetchProgress } = useQuery({
    queryKey: ['inspection-progress', inspectionId],
    queryFn: () =>
      inspectionsApi
        .getProgress(inspectionId!)
        .then((r) => {
          const raw = (r.data as any).data ?? (r.data as any).progress;
          return {
            total_items: raw.total_items,
            answered_items: raw.answered_items,
            percentage: raw.percentage ?? raw.progress_percentage ?? 0,
          } as InspectionProgress;
        }),
    enabled: !!inspectionId,
  });

  // Answer mutation using actual inspection ID
  const answerMutation = useMutation({
    mutationFn: (payload: {
      checklist_item_id: number;
      answer_value: string;
      comment?: string;
    }) => inspectionsApi.answerQuestion(inspectionId!, payload),
    onSuccess: () => {
      refetchProgress();
      refetchInspection();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Submit mutation using actual inspection ID
  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    onSuccess: () => {
      message.success(t('inspection.submit'));
      navigate('/inspector/assignments');
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (params: { file: File; checklistItemId: number }) =>
      filesApi.upload(params.file, 'inspection_answer', params.checklistItemId),
    onSuccess: () => {
      message.success('Photo uploaded');
      refetchInspection();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const handleAnswer = useCallback(
    (checklistItemId: number, value: string, comment?: string) => {
      answerMutation.mutate({
        checklist_item_id: checklistItemId,
        answer_value: value,
        comment,
      });
    },
    [answerMutation],
  );

  const handleUpload = useCallback(
    (file: File, checklistItemId: number) => {
      uploadMutation.mutate({ file, checklistItemId });
      return false; // prevent default upload behavior
    },
    [uploadMutation],
  );

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  if (!inspection) {
    return <Alert type="warning" message={t('common.noData')} showIcon />;
  }

  const answers = inspection.answers ?? [];
  const answeredMap = new Map<number, InspectionAnswer>();
  answers.forEach((a) => answeredMap.set(a.checklist_item_id, a));

  // Get checklist items: prefer checklist_items from response, fallback to extracting from answers
  const rawChecklistItems: ChecklistItem[] = (inspection as any).checklist_items ?? [];
  const itemsFromAnswers: ChecklistItem[] = answers
    .filter((a) => a.checklist_item !== null)
    .map((a) => a.checklist_item as ChecklistItem);

  // Merge and deduplicate by id, sorted by order_index
  const allItems = [...rawChecklistItems, ...itemsFromAnswers];
  const uniqueItems = Array.from(
    new Map(allItems.map((item) => [item.id, item])).values(),
  ).sort((a, b) => a.order_index - b.order_index);

  const canSubmit =
    progress &&
    progress.answered_items >= progress.total_items &&
    inspection.status === 'draft';

  const getQuestionText = (item: ChecklistItem) => {
    if (isArabic && item.question_text_ar) {
      return item.question_text_ar;
    }
    return item.question_text;
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/inspector/assignments')}
        >
          {t('common.back')}
        </Button>
      </Space>

      <Typography.Title level={4}>{t('inspection.checklist')}</Typography.Title>

      {/* Equipment Info */}
      {inspection.equipment && (
        <Card style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('equipment.name')}>
              {inspection.equipment.name}
            </Descriptions.Item>
            <Descriptions.Item label={t('equipment.type')}>
              {inspection.equipment.equipment_type}
            </Descriptions.Item>
            <Descriptions.Item label={t('equipment.location')}>
              {inspection.equipment.location ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('equipment.berth')}>
              {inspection.equipment.berth ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('common.status')}>
              <Tag color={inspection.status === 'draft' ? 'blue' : 'green'}>
                {t(`status.${inspection.status}`, inspection.status)}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Progress Bar */}
      {progress && (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Text strong>{t('inspection.progress')}</Typography.Text>
          <Progress
            percent={Math.round(progress.percentage)}
            status={progress.percentage >= 100 ? 'success' : 'active'}
            format={() =>
              `${progress.answered_items} / ${progress.total_items}`
            }
          />
        </Card>
      )}

      {/* Checklist Items */}
      <List
        dataSource={uniqueItems}
        locale={{ emptyText: t('common.noData') }}
        renderItem={(item) => {
          const existingAnswer = answeredMap.get(item.id);
          return (
            <ChecklistItemCard
              key={item.id}
              item={item}
              existingAnswer={existingAnswer}
              getQuestionText={getQuestionText}
              onAnswer={handleAnswer}
              onUpload={handleUpload}
              isSubmitted={inspection.status !== 'draft'}
            />
          );
        }}
      />

      {/* Submit Button */}
      {inspection.status === 'draft' && (
        <Card style={{ marginTop: 16, textAlign: 'center' }}>
          <Popconfirm
            title={t('common.confirm')}
            onConfirm={() => submitMutation.mutate()}
            okText={t('common.submit')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              loading={submitMutation.isPending}
              disabled={!canSubmit}
            >
              {t('inspection.submit')}
            </Button>
          </Popconfirm>
          {!canSubmit && progress && progress.total_items > 0 && (
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginTop: 8 }}
            >
              {t('inspection.progress')}: {progress.answered_items} /{' '}
              {progress.total_items}
            </Typography.Text>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist Item Sub-Component                                       */
/* ------------------------------------------------------------------ */

interface ChecklistItemCardProps {
  item: ChecklistItem;
  existingAnswer?: InspectionAnswer;
  getQuestionText: (item: ChecklistItem) => string;
  onAnswer: (id: number, value: string, comment?: string) => void;
  onUpload: (file: File, id: number) => boolean;
  isSubmitted: boolean;
}

function openCameraInput(accept: string, onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.capture = 'environment';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

function ChecklistItemCard({
  item,
  existingAnswer,
  getQuestionText,
  onAnswer,
  onUpload,
  isSubmitted,
}: ChecklistItemCardProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState(existingAnswer?.comment ?? '');
  const [showComment, setShowComment] = useState(!!existingAnswer?.comment);

  const renderAnswerInput = () => {
    const currentValue = existingAnswer?.answer_value ?? '';
    const disabled = isSubmitted;

    switch (item.answer_type) {
      case 'yes_no':
        return (
          <Radio.Group
            value={currentValue || undefined}
            onChange={(e) => onAnswer(item.id, e.target.value, comment || undefined)}
            disabled={disabled}
          >
            <Radio.Button value="yes">Yes</Radio.Button>
            <Radio.Button value="no">No</Radio.Button>
          </Radio.Group>
        );
      case 'pass_fail':
        return (
          <Radio.Group
            value={currentValue || undefined}
            onChange={(e) => onAnswer(item.id, e.target.value, comment || undefined)}
            disabled={disabled}
          >
            <Radio.Button value="pass">Pass</Radio.Button>
            <Radio.Button value="fail">Fail</Radio.Button>
          </Radio.Group>
        );
      case 'text':
        return (
          <Input.TextArea
            defaultValue={currentValue}
            rows={2}
            placeholder={t('inspection.answer', 'Enter answer')}
            disabled={disabled}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== currentValue) {
                onAnswer(item.id, e.target.value, comment || undefined);
              }
            }}
          />
        );
      case 'numeric':
        return (
          <InputNumber
            defaultValue={currentValue ? Number(currentValue) : undefined}
            placeholder={t('inspection.answer', 'Enter value')}
            disabled={disabled}
            onBlur={(e) => {
              const val = e.target.value;
              if (val && val !== currentValue) {
                onAnswer(item.id, val, comment || undefined);
              }
            }}
            style={{ width: 200 }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card
      style={{ marginBottom: 12 }}
      size="small"
      title={
        <Space wrap>
          <Typography.Text strong>{getQuestionText(item)}</Typography.Text>
          {item.category && (
            <Tag color={item.category === 'mechanical' ? 'blue' : 'gold'}>
              {item.category}
            </Tag>
          )}
          {item.critical_failure && (
            <Badge
              count={
                <StarFilled style={{ color: '#f5222d', fontSize: 14 }} />
              }
            />
          )}
          {existingAnswer && (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {renderAnswerInput()}

        <Space>
          <Button
            size="small"
            type="link"
            onClick={() => setShowComment(!showComment)}
          >
            {t('inspection.comment', 'Comment')}
          </Button>

          {!isSubmitted && (
            <>
              <Button
                size="small"
                type="link"
                icon={<CameraOutlined />}
                onClick={() => openCameraInput('image/*', (file) => onUpload(file, item.id))}
              >
                {t('inspection.take_photo', 'Take Photo')}
              </Button>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => onUpload(file, item.id)}
              >
                <Button size="small" type="link" icon={<PictureOutlined />}>
                  {t('inspection.from_gallery', 'From Gallery')}
                </Button>
              </Upload>
            </>
          )}

          {existingAnswer?.photo_path && (
            <Tag color="green">{t('inspection.photo', 'Photo')} uploaded</Tag>
          )}
        </Space>

        {showComment && (
          <Input.TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('inspection.comment', 'Add a comment...')}
            rows={2}
            disabled={isSubmitted}
            onBlur={() => {
              if (
                existingAnswer &&
                comment !== (existingAnswer.comment ?? '')
              ) {
                onAnswer(
                  item.id,
                  existingAnswer.answer_value,
                  comment || undefined,
                );
              }
            }}
          />
        )}
      </Space>
    </Card>
  );
}
