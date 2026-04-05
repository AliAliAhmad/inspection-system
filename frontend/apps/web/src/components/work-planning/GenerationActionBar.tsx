import React, { useState } from 'react';
import { Button, Space, Typography, Popconfirm, message } from 'antd';
import {
  CheckOutlined,
  ReloadOutlined,
  CloseOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { workPlansApi } from '@inspection/shared';
import type { GenerationSummary, PlanScore } from '@inspection/shared';

const { Text } = Typography;

interface GenerationActionBarProps {
  summary: GenerationSummary | null;
  score: PlanScore | null;
  planId: number;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export const GenerationActionBar: React.FC<GenerationActionBarProps> = ({
  summary,
  score,
  planId,
  onAccept,
  onReject,
  onRegenerate,
}) => {
  const [rejecting, setRejecting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!summary || dismissed) return null;

  const handleReject = async () => {
    setRejecting(true);
    try {
      await workPlansApi.rejectGeneration(planId);
      message.success('AI-generated jobs removed');
      onReject();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Reject failed';
      message.error(errorMsg);
    } finally {
      setRejecting(false);
    }
  };

  const handleAccept = () => {
    setDismissed(true);
    onAccept();
  };

  const overallScore = score?.overall ?? 0;
  const scoreColor = overallScore >= 80 ? '#52c41a' : overallScore >= 60 ? '#fa8c16' : '#ff4d4f';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        animation: 'slideUpIn 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUpIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px',
          background: 'linear-gradient(135deg, #f0f0ff 0%, #e8ecff 50%, #f6f0ff 100%)',
          borderTop: '1px solid #d6d6f5',
          boxShadow: '0 -4px 16px rgba(102, 126, 234, 0.12)',
        }}
      >
        {/* Left: Summary text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{'\u2728'}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#262626',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Plan generated
              {' \u2014 '}
              <span style={{ fontWeight: 700 }}>{summary.scheduled}</span>
              {' of '}
              <span style={{ fontWeight: 700 }}>{summary.total_candidates}</span>
              {' jobs scheduled'}
              {summary.bundles_created > 0 && (
                <>
                  {' \u2022 '}
                  <span style={{ fontWeight: 700 }}>{summary.bundles_created}</span>
                  {' bundles'}
                </>
              )}
              {score && (
                <>
                  {' \u2022 Score: '}
                  <span style={{ fontWeight: 700, color: scoreColor }}>{overallScore}/100</span>
                </>
              )}
            </Text>
            {summary.unscheduled > 0 && (
              <Text style={{ fontSize: 11, color: '#8c8c8c' }}>
                {summary.unscheduled} job{summary.unscheduled !== 1 ? 's' : ''} could not be scheduled
                {' (capacity exceeded)'}
              </Text>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <Space size={8} style={{ flexShrink: 0 }}>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleAccept}
            style={{
              background: '#52c41a',
              borderColor: '#52c41a',
              fontWeight: 600,
              boxShadow: '0 2px 4px rgba(82, 196, 26, 0.3)',
            }}
          >
            Accept
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRegenerate}
            style={{ fontWeight: 500 }}
          >
            Regenerate
          </Button>
          <Popconfirm
            title="Reject AI Generation?"
            description="This will remove all AI-placed jobs and revert to the previous state."
            onConfirm={handleReject}
            okText="Reject"
            okType="danger"
            cancelText="Keep"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={rejecting}
              style={{ fontWeight: 500 }}
            >
              Reject
            </Button>
          </Popconfirm>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => setDismissed(true)}
            style={{ color: '#8c8c8c' }}
          />
        </Space>
      </div>
    </div>
  );
};
