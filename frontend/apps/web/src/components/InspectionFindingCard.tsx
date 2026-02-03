import { useState } from 'react';
import { Card, Tag, Typography, Space } from 'antd';
import { SoundOutlined, PictureOutlined, VideoCameraOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { InspectionAnswerSummary } from '@inspection/shared';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface InspectionFindingCardProps {
  answer: InspectionAnswerSummary;
  title?: string;
}

const answerColors: Record<string, string> = {
  fail: 'red',
  no: 'red',
  pass: 'green',
  yes: 'green',
};

export default function InspectionFindingCard({ answer, title }: InspectionFindingCardProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const token = localStorage.getItem('access_token') || '';
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const questionText = isArabic && answer.checklist_item?.question_text_ar
    ? answer.checklist_item.question_text_ar
    : answer.checklist_item?.question_text || '';

  const photoStreamUrl = answer.photo_file
    ? `${API_BASE}/api/files/${answer.photo_file.id}/stream?token=${token}`
    : null;

  const videoStreamUrl = answer.video_file
    ? `${API_BASE}/api/files/${answer.video_file.id}/stream?token=${token}`
    : null;

  const voiceStreamUrl = answer.voice_note_id
    ? `${API_BASE}/api/files/${answer.voice_note_id}/stream?token=${token}`
    : null;

  return (
    <Card
      size="small"
      title={
        <Space>
          <WarningOutlined style={{ color: '#fa8c16' }} />
          <Typography.Text strong>
            {title || t('inspection.finding', "Inspector's Finding")}
          </Typography.Text>
        </Space>
      }
      style={{ marginBottom: 12, background: '#fffbe6', borderColor: '#ffe58f' }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Question */}
        {questionText && (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('inspection.question', 'Question')}:
            </Typography.Text>
            <Typography.Text style={{ marginLeft: 4 }}>{questionText}</Typography.Text>
            {answer.checklist_item?.category && (
              <Tag
                color={answer.checklist_item.category === 'mechanical' ? 'blue' : 'gold'}
                style={{ marginLeft: 8 }}
              >
                {answer.checklist_item.category}
              </Tag>
            )}
            {answer.checklist_item?.critical_failure && (
              <Tag color="red" style={{ marginLeft: 4 }}>Critical</Tag>
            )}
          </div>
        )}

        {/* Answer value */}
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('inspection.answer', 'Answer')}:
          </Typography.Text>
          <Tag color={answerColors[answer.answer_value] || 'default'} style={{ marginLeft: 4 }}>
            {answer.answer_value.toUpperCase()}
          </Tag>
        </div>

        {/* Photo */}
        {photoStreamUrl && (
          <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <PictureOutlined /> {t('inspection.photo', 'Photo')}:
            </Typography.Text>
            {photoLoadError ? (
              <div style={{
                width: 200, height: 120,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#999', fontSize: 12, background: '#fafafa', borderRadius: 4,
              }}>
                <PictureOutlined style={{ fontSize: 24, marginRight: 8 }} />
                {t('inspection.photo_load_error', 'Photo unavailable')}
              </div>
            ) : (
              <img
                src={photoStreamUrl}
                alt="Inspection photo"
                style={{ maxWidth: 300, maxHeight: 200, objectFit: 'contain', borderRadius: 4, display: 'block' }}
                onError={() => setPhotoLoadError(true)}
              />
            )}
          </div>
        )}

        {/* Video */}
        {videoStreamUrl && (
          <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <VideoCameraOutlined /> {t('inspection.video', 'Video')}:
            </Typography.Text>
            <video
              controls
              src={videoStreamUrl}
              style={{ maxWidth: 400, maxHeight: 250, borderRadius: 4 }}
              preload="metadata"
            />
          </div>
        )}

        {/* Voice note */}
        {voiceStreamUrl && (
          <div
            style={{
              background: '#f0f5ff',
              padding: '8px 12px',
              borderRadius: 4,
              border: '1px solid #d6e4ff',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <SoundOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('inspection.voiceNote', 'Voice Note')}:
            </Typography.Text>
            <audio controls src={voiceStreamUrl} style={{ height: 32, flex: 1 }} preload="auto" />
          </div>
        )}

        {/* Comment */}
        {answer.comment && (
          <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
              {t('inspection.comment', 'Comment')}:
            </Typography.Text>
            <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{answer.comment}</Typography.Text>
          </div>
        )}
      </Space>
    </Card>
  );
}
