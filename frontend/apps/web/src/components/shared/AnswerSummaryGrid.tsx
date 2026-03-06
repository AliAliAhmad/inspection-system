import { useState } from 'react';
import { Tag, Tooltip, Modal, Descriptions, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { AnswerSummaryEntry } from '@inspection/shared';

const { Text } = Typography;

const URGENCY_COLORS = ['#4CAF50', '#FF9800', '#FF5722', '#F44336'];
const URGENCY_LABELS = ['OK', 'Monitor', 'Attention', 'Critical'];

function isNumericInRange(num: number, entry: AnswerSummaryEntry): boolean {
  const rule = entry.numeric_rule;
  const min = entry.min_value;
  const max = entry.max_value;
  if (!rule) return true;
  if (rule === 'less_than' && max != null) return num < max;
  if (rule === 'greater_than' && min != null) return num > min;
  if (rule === 'between' && min != null && max != null) return num >= min && num <= max;
  return true;
}

function getCellStyle(entry: AnswerSummaryEntry) {
  const val = entry.answer_value?.toLowerCase().trim();
  let label = '';
  let bgColor = '#f0f0f0';
  let textColor = '#333';
  let borderColor = 'transparent';

  if (entry.answer_type === 'pass_fail' || entry.answer_type === 'yes_no') {
    if (val === 'pass' || val === 'yes') {
      label = 'P'; bgColor = '#C8E6C9'; textColor = '#2E7D32';
    } else if (val === 'fail' || val === 'no') {
      label = 'F'; bgColor = '#FFCDD2'; textColor = '#C62828';
    } else if (val === 'stop' || val === 'stopped') {
      label = 'S'; bgColor = '#F44336'; textColor = '#fff';
    } else {
      label = val?.charAt(0)?.toUpperCase() || '?';
    }
  } else if (entry.answer_type === 'numeric') {
    const num = parseFloat(entry.answer_value);
    label = isNaN(num) ? entry.answer_value : String(num);
    if (!isNaN(num)) {
      const inRange = isNumericInRange(num, entry);
      bgColor = inRange ? '#C8E6C9' : '#FFCDD2';
      textColor = inRange ? '#2E7D32' : '#C62828';
    }
  } else {
    label = entry.answer_value?.substring(0, 3) || '-';
    bgColor = '#E8EAF6'; textColor = '#3F51B5';
  }

  const urgency = entry.urgency_level ?? 0;
  if (urgency > 0) {
    borderColor = URGENCY_COLORS[urgency] ?? 'transparent';
  }

  return { label, bgColor, textColor, borderColor, urgency };
}

interface AnswerSummaryGridProps {
  answers: AnswerSummaryEntry[];
  compact?: boolean;
}

export function AnswerSummaryGrid({ answers, compact = false }: AnswerSummaryGridProps) {
  const { t } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState<AnswerSummaryEntry | null>(null);

  if (!answers || answers.length === 0) return null;

  const cellSize = compact ? 20 : 24;
  const fontSize = compact ? 10 : 11;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {answers.map((entry, i) => {
          const { label, bgColor, textColor, borderColor, urgency } = getCellStyle(entry);
          return (
            <Tooltip
              key={i}
              title={
                <div>
                  <div>{entry.question_text || `Q${i + 1}`}</div>
                  <div>{t('common.answer', 'Answer')}: {entry.answer_value}</div>
                  {entry.category && <div>{t('common.category', 'Category')}: {entry.category}</div>}
                  {urgency > 0 && <div>{t('common.urgency', 'Urgency')}: {URGENCY_LABELS[urgency]}</div>}
                </div>
              }
            >
              <div
                onClick={() => setSelectedEntry(entry)}
                style={{
                  width: cellSize,
                  height: cellSize,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: bgColor,
                  color: textColor,
                  fontSize,
                  fontWeight: 600,
                  borderRadius: 3,
                  cursor: 'pointer',
                  border: urgency > 0 ? `2px solid ${borderColor}` : '1px solid #e8e8e8',
                  lineHeight: 1,
                }}
              >
                {label.substring(0, 2)}
              </div>
            </Tooltip>
          );
        })}
      </div>

      <Modal
        title={t('assignments.answerDetail', 'Answer Detail')}
        open={!!selectedEntry}
        onCancel={() => setSelectedEntry(null)}
        footer={null}
        width={400}
      >
        {selectedEntry && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('common.question', 'Question')}>
              {selectedEntry.question_text || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('common.answer', 'Answer')}>
              <Tag color={
                ['pass', 'yes'].includes(selectedEntry.answer_value?.toLowerCase()) ? 'green' :
                ['fail', 'no'].includes(selectedEntry.answer_value?.toLowerCase()) ? 'red' : 'blue'
              }>
                {selectedEntry.answer_value}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('common.type', 'Type')}>
              {selectedEntry.answer_type}
            </Descriptions.Item>
            {selectedEntry.category && (
              <Descriptions.Item label={t('common.category', 'Category')}>
                <Tag color={selectedEntry.category === 'mechanical' ? 'blue' : 'orange'}>
                  {selectedEntry.category}
                </Tag>
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('common.urgency', 'Urgency')}>
              <Space>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  backgroundColor: URGENCY_COLORS[selectedEntry.urgency_level ?? 0],
                }} />
                <Text>{URGENCY_LABELS[selectedEntry.urgency_level ?? 0]}</Text>
              </Space>
            </Descriptions.Item>
            {selectedEntry.comment && (
              <Descriptions.Item label={t('common.comment', 'Comment')}>
                {selectedEntry.comment}
              </Descriptions.Item>
            )}
            {selectedEntry.has_photo && (
              <Descriptions.Item label={t('common.photo', 'Photo')}>
                <Tag color="blue">{t('common.hasPhoto', 'Has photo')}</Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </>
  );
}

export default AnswerSummaryGrid;
