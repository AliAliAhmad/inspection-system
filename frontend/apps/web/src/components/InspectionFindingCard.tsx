import { useState } from 'react';
import { Card, Tag, Typography, Space, Button, Tooltip } from 'antd';
import { SoundOutlined, PictureOutlined, VideoCameraOutlined, WarningOutlined, BgColorsOutlined, TagsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { InspectionAnswerSummary } from '@inspection/shared';

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

/**
 * Convert Cloudinary audio URL to MP3 format for better iOS compatibility
 */
function getAudioMp3Url(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  // Insert f_mp3 transformation
  return url.replace('/upload/', '/upload/f_mp3/');
}

/**
 * Generate waveform image URL from Cloudinary audio URL
 */
function getWaveformUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  // Generate waveform: blue color, white background, 280x40 size
  return url
    .replace('/upload/', '/upload/fl_waveform,co_rgb:1677ff,b_rgb:f0f5ff,w_280,h_40/')
    .replace(/\.[^.]+$/, '.png'); // Change extension to png
}

/**
 * Optimize Cloudinary video URL with auto-format and auto-quality
 * - f_auto: Picks best format for viewer's browser (MP4, WebM, etc.)
 * - q_auto: Automatic quality optimization (reduces file size 40-60%)
 */
function getOptimizedVideoUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

/**
 * Generate video thumbnail/poster image from Cloudinary video URL
 * Extracts frame at 1 second as a JPG thumbnail
 */
function getVideoThumbnailUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  return url
    .replace('/upload/', '/upload/so_1,w_400,h_250,c_fill,q_auto/')
    .replace(/\.[^.]+$/, '.jpg');
}

/**
 * Optimize Cloudinary image URL with auto-format, auto-quality, and enhancement
 * - f_auto: Best format for browser (WebP, AVIF, JPEG)
 * - q_auto: Smart compression (30-50% smaller)
 * - e_improve: Auto-enhance colors/contrast for poorly lit photos
 */
function getOptimizedPhotoUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,e_improve/');
}

/**
 * Generate photo thumbnail for list views
 * - Small size for fast loading
 * - c_fill with g_auto for smart cropping
 */
function getPhotoThumbnailUrl(url: string, width = 300, height = 200): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},h_${height},c_fill,g_auto/`);
}

/**
 * Remove background from image using Cloudinary AI
 * - e_background_removal: AI-powered background removal
 */
function getBackgroundRemovedUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/e_background_removal/');
}

export default function InspectionFindingCard({ answer, title }: InspectionFindingCardProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [showBgRemoved, setShowBgRemoved] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState(false);

  const questionText = isArabic && answer.checklist_item?.question_text_ar
    ? answer.checklist_item.question_text_ar
    : answer.checklist_item?.question_text || '';

  // Cloudinary URLs - direct access, no token needed
  const photoFile = answer.photo_file as any;
  const photoUrl = photoFile?.url || null;
  const videoUrl = (answer.video_file as any)?.url || null;
  const voiceUrl = (answer.voice_note as any)?.url || null;

  // AI tags from Cloudinary (auto-detected objects, scenes, etc.)
  const aiTags = photoFile?.ai_tags as Array<{ tag: string; confidence: number }> | null;

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

        {/* Photo - with Cloudinary optimizations and AI features */}
        {photoUrl && (
          <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                <PictureOutlined /> {t('inspection.photo', 'Photo')}:
              </Typography.Text>
              <Tooltip title={showBgRemoved ? t('inspection.showOriginal', 'Show original') : t('inspection.removeBg', 'Remove background')}>
                <Button
                  type="text"
                  size="small"
                  icon={<BgColorsOutlined />}
                  onClick={() => setShowBgRemoved(!showBgRemoved)}
                  style={{ color: showBgRemoved ? '#1677ff' : '#999' }}
                />
              </Tooltip>
            </div>
            <a href={photoUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={photoLoadError ? photoUrl : getPhotoThumbnailUrl(photoUrl)}
                alt="Inspection photo"
                style={{
                  maxWidth: 300, maxHeight: 200, objectFit: 'contain', borderRadius: 4, display: 'block', cursor: 'pointer',
                }}
                onError={() => { if (!photoLoadError) setPhotoLoadError(true); }}
                title={t('inspection.clickToEnlarge', 'Click to view full size')}
              />
            </a>
            {/* AI-detected tags */}
            {aiTags && aiTags.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  <TagsOutlined /> {t('inspection.aiDetected', 'AI Detected')}:
                </Typography.Text>
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {aiTags.slice(0, 5).map((tag, idx) => (
                    <Tag key={idx} color="blue" style={{ fontSize: 11, margin: 0 }}>
                      {tag.tag} {tag.confidence < 1 && `(${Math.round(tag.confidence * 100)}%)`}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video - with Cloudinary optimizations */}
        {videoUrl && (
          <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <VideoCameraOutlined /> {t('inspection.video', 'Video')}:
            </Typography.Text>
            <video
              controls
              src={videoUrl}
              style={{ maxWidth: 400, maxHeight: 250, borderRadius: 4, background: '#000' }}
              preload="metadata"
            />
          </div>
        )}

        {/* Voice note with waveform */}
        {voiceUrl && (
          <div
            style={{
              background: '#f0f5ff',
              padding: '12px',
              borderRadius: 8,
              border: '1px solid #d6e4ff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <SoundOutlined style={{ color: '#1677ff', fontSize: 16 }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('inspection.voiceNote', 'Voice Note')}
              </Typography.Text>
            </div>
            {/* Audio player */}
            <audio
              controls
              style={{ width: '100%', height: 36 }}
              preload="metadata"
            >
              <source src={voiceUrl} />
            </audio>
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
