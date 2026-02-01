import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Progress,
  Button,
  Radio,
  InputNumber,
  Upload,
  Tag,
  Space,
  Spin,
  Alert,
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
  SoundOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  inspectionsApi,
  filesApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
} from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';

export default function InspectionChecklistPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      voice_note_id?: number;
    }) => inspectionsApi.answerQuestion(inspectionId!, payload),
    onSuccess: () => {
      refetchProgress();
      refetchInspection();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || err?.response?.data?.error || t('common.error'));
    },
  });

  // Submit mutation using actual inspection ID
  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    onSuccess: () => {
      message.success(t('inspection.submit'));
      navigate('/inspector/assignments');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || err?.response?.data?.error || t('common.error'));
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
    (checklistItemId: number, value: string, comment?: string, voiceNoteId?: number) => {
      answerMutation.mutate({
        checklist_item_id: checklistItemId,
        answer_value: value,
        comment,
        voice_note_id: voiceNoteId,
      });
    },
    [answerMutation],
  );

  const handleUpload = useCallback(
    (file: File, checklistItemId: number) => {
      uploadMutation.mutate({ file, checklistItemId });
      return false;
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

  const rawChecklistItems: ChecklistItem[] = (inspection as any).checklist_items ?? [];
  const itemsFromAnswers: ChecklistItem[] = answers
    .filter((a) => a.checklist_item !== null)
    .map((a) => a.checklist_item as ChecklistItem);

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
  onAnswer: (id: number, value: string, comment?: string, voiceNoteId?: number) => void;
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
  const [voiceNoteId, setVoiceNoteId] = useState<number | undefined>(
    existingAnswer?.voice_note_id ?? undefined,
  );
  const [currentValue, setCurrentValue] = useState(existingAnswer?.answer_value ?? '');

  // Auto-show comment area when answer is fail/no, or when there's an existing comment/voice
  const isFailed = currentValue === 'fail' || currentValue === 'no';
  const hasExistingCommentOrVoice = !!(existingAnswer?.comment || existingAnswer?.voice_note_id);
  const [showComment, setShowComment] = useState(isFailed || hasExistingCommentOrVoice);

  // Auto-expand comment section when fail/no is selected
  useEffect(() => {
    if (isFailed) {
      setShowComment(true);
    }
  }, [isFailed]);

  const handleAnswerChange = (value: string) => {
    setCurrentValue(value);
    onAnswer(item.id, value, comment || undefined, voiceNoteId);
  };

  // Build stream URL for existing voice note (for engineers/admins viewing submitted inspections)
  const existingVoiceStreamUrl = existingAnswer?.voice_note_id
    ? `/api/files/${existingAnswer.voice_note_id}/stream?token=${localStorage.getItem('access_token') || ''}`
    : null;

  const renderAnswerInput = () => {
    const disabled = isSubmitted;

    switch (item.answer_type) {
      case 'yes_no':
        return (
          <Radio.Group
            value={currentValue || undefined}
            onChange={(e) => handleAnswerChange(e.target.value)}
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
            onChange={(e) => handleAnswerChange(e.target.value)}
            disabled={disabled}
          >
            <Radio.Button value="pass">Pass</Radio.Button>
            <Radio.Button value="fail">Fail</Radio.Button>
          </Radio.Group>
        );
      case 'text':
        return (
          <VoiceTextArea
            defaultValue={currentValue}
            rows={2}
            placeholder={t('inspection.answer', 'Enter answer')}
            disabled={disabled}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== (existingAnswer?.answer_value ?? '')) {
                onAnswer(item.id, e.target.value, comment || undefined, voiceNoteId);
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
                onAnswer(item.id, val, comment || undefined, voiceNoteId);
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

        <Space wrap>
          {!showComment && (
            <Button
              size="small"
              type="link"
              onClick={() => setShowComment(true)}
            >
              {t('inspection.comment', 'Comment')}
            </Button>
          )}

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

          {(existingAnswer?.voice_note_id || voiceNoteId) && (
            <Tag color="blue" icon={<SoundOutlined />}>Voice note</Tag>
          )}
        </Space>

        {/* Comment + Voice recording area — always visible on fail/no */}
        {showComment && (
          <div>
            <VoiceTextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                isFailed
                  ? t('inspection.fail_comment', 'Add comment or use voice recording...')
                  : t('inspection.comment', 'Add a comment...')
              }
              rows={2}
              disabled={isSubmitted}
              onVoiceRecorded={(audioFileId) => {
                setVoiceNoteId(audioFileId);
                // Auto-save with voice note
                if (currentValue) {
                  onAnswer(item.id, currentValue, comment || undefined, audioFileId);
                }
              }}
              onTranscribed={(en, ar) => {
                const parts: string[] = [];
                if (en) parts.push(`EN: ${en}`);
                if (ar) parts.push(`AR: ${ar}`);
                const combined = parts.join('\n');
                setComment(combined);
                if (currentValue) {
                  onAnswer(item.id, currentValue, combined, voiceNoteId);
                }
              }}
              onBlur={() => {
                if (
                  existingAnswer &&
                  comment !== (existingAnswer.comment ?? '')
                ) {
                  onAnswer(
                    item.id,
                    existingAnswer.answer_value,
                    comment || undefined,
                    voiceNoteId,
                  );
                }
              }}
            />

            {/* Existing voice note playback (from server, for viewing submitted inspections) */}
            {existingVoiceStreamUrl && (
              <div
                style={{
                  marginTop: 6,
                  padding: '6px 10px',
                  background: '#f0f5ff',
                  borderRadius: 4,
                  border: '1px solid #d6e4ff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <SoundOutlined style={{ color: '#1677ff', fontSize: 14 }} />
                <audio controls src={existingVoiceStreamUrl} style={{ height: 32, flex: 1 }} preload="metadata" />
              </div>
            )}

            {isFailed && !comment && !voiceNoteId && !isSubmitted && (
              <Typography.Text type="warning" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                {t('inspection.fail_requires_note', 'A comment or voice note is required for failed items')}
              </Typography.Text>
            )}
          </div>
        )}
      </Space>
    </Card>
  );
}
