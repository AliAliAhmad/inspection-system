import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Checkbox, Radio, Space, Divider, Typography, Tag, Button } from 'antd';
import { FilePdfOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { PdfFilters, WorkPlanDay } from '@inspection/shared';

const { Text } = Typography;

interface PdfFilterModalProps {
  open: boolean;
  loading?: boolean;
  /**
   * The days of the plan — used to render day checkboxes. Each entry must
   * have the ISO date string and a display label.
   */
  days: WorkPlanDay[];
  onCancel: () => void;
  onGenerate: (filters: PdfFilters | undefined) => void;
}

type BerthChoice = 'both' | 'east' | 'west';
type TradeChoice = 'both' | 'MECH' | 'ELEC';
type JobType = 'pm' | 'defect' | 'inspection';

const ALL_JOB_TYPES: JobType[] = ['pm', 'defect', 'inspection'];

export const PdfFilterModal: React.FC<PdfFilterModalProps> = ({
  open,
  loading = false,
  days,
  onCancel,
  onGenerate,
}) => {
  // All days selected by default
  const allDayDates = useMemo(() => days.map((d) => d.date), [days]);

  const [selectedDays, setSelectedDays] = useState<string[]>(allDayDates);
  const [berth, setBerth] = useState<BerthChoice>('both');
  const [trade, setTrade] = useState<TradeChoice>('both');
  const [selectedJobTypes, setSelectedJobTypes] = useState<JobType[]>(ALL_JOB_TYPES);

  // Re-sync day selection when the plan changes
  useEffect(() => {
    if (open) {
      setSelectedDays(allDayDates);
      setBerth('both');
      setTrade('both');
      setSelectedJobTypes(ALL_JOB_TYPES);
    }
  }, [open, allDayDates]);

  const totalSelectedJobs = useMemo(() => {
    return days
      .filter((d) => selectedDays.includes(d.date))
      .reduce((sum, d) => sum + (d.total_jobs || 0), 0);
  }, [days, selectedDays]);

  const toggleAllDays = (checked: boolean) => {
    setSelectedDays(checked ? allDayDates : []);
  };

  const handleGenerate = () => {
    // Build filter payload. Omit keys that match the default ("all selected")
    // so the backend treats them as "no filter" and skips unnecessary work.
    const filters: PdfFilters = {};

    if (selectedDays.length > 0 && selectedDays.length < allDayDates.length) {
      filters.days = [...selectedDays].sort();
    }
    if (berth !== 'both') {
      filters.berths = [berth];
    }
    if (trade !== 'both') {
      filters.work_centers = [trade];
    }
    if (selectedJobTypes.length < ALL_JOB_TYPES.length) {
      filters.job_types = [...selectedJobTypes];
    }

    const hasAnyFilter = Object.keys(filters).length > 0;
    onGenerate(hasAnyFilter ? filters : undefined);
  };

  // Determine if this is a "default" request (no actual filters applied)
  const isDefault =
    selectedDays.length === allDayDates.length &&
    berth === 'both' &&
    trade === 'both' &&
    selectedJobTypes.length === ALL_JOB_TYPES.length;

  // Build day label (e.g. "Monday, 06 Apr")
  const dayLabel = (d: WorkPlanDay): string => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  };

  const canGenerate = !loading && selectedDays.length > 0 && selectedJobTypes.length > 0;

  return (
    <Modal
      open={open}
      title={
        <Space>
          <FilePdfOutlined style={{ color: '#d4380d' }} />
          <span>Customize PDF Output</span>
        </Space>
      }
      onCancel={onCancel}
      width={560}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>,
        <Button
          key="generate"
          type="primary"
          icon={<FilePdfOutlined />}
          loading={loading}
          disabled={!canGenerate}
          onClick={handleGenerate}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderColor: '#667eea',
          }}
        >
          {isDefault ? 'Generate Full Week PDF' : 'Generate Filtered PDF'}
        </Button>,
      ]}
    >
      <div style={{ padding: '4px 0 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '8px 12px',
            background: '#f0f5ff',
            border: '1px solid #d6e4ff',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 12,
            color: '#595959',
            lineHeight: '18px',
          }}
        >
          <InfoCircleOutlined style={{ color: '#1890ff', fontSize: 14, marginTop: 2 }} />
          <div>
            Pick the days, berth, trade, and job types you want in the PDF.
            Defaults show the <strong>full week</strong>. The card layout stays the same.
          </div>
        </div>

        {/* ── Days ─────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <Text strong style={{ fontSize: 13 }}>
              Days
            </Text>
            <Space size={4}>
              <Tag color="blue" style={{ fontSize: 10 }}>
                {totalSelectedJobs} jobs
              </Tag>
              <a
                onClick={() => toggleAllDays(true)}
                style={{ fontSize: 11 }}
              >
                All
              </a>
              <span style={{ color: '#d9d9d9' }}>|</span>
              <a
                onClick={() => toggleAllDays(false)}
                style={{ fontSize: 11 }}
              >
                None
              </a>
            </Space>
          </div>
          <Checkbox.Group
            value={selectedDays}
            onChange={(vals) => setSelectedDays(vals as string[])}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
          >
            {days.map((d) => (
              <Checkbox key={d.id} value={d.date}>
                <span style={{ fontSize: 12 }}>
                  {dayLabel(d)} <Text type="secondary" style={{ fontSize: 10 }}>({d.total_jobs})</Text>
                </span>
              </Checkbox>
            ))}
          </Checkbox.Group>
        </div>

        <Divider style={{ margin: '10px 0' }} />

        {/* ── Berth ─────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Berth
          </Text>
          <Radio.Group value={berth} onChange={(e) => setBerth(e.target.value)}>
            <Radio.Button value="both">Both</Radio.Button>
            <Radio.Button value="east">East</Radio.Button>
            <Radio.Button value="west">West</Radio.Button>
          </Radio.Group>
        </div>

        <Divider style={{ margin: '10px 0' }} />

        {/* ── Trade ─────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Trade
          </Text>
          <Radio.Group value={trade} onChange={(e) => setTrade(e.target.value)}>
            <Radio.Button value="both">Both</Radio.Button>
            <Radio.Button value="MECH">Mechanical</Radio.Button>
            <Radio.Button value="ELEC">Electrical</Radio.Button>
          </Radio.Group>
          {trade !== 'both' && (
            <Text
              type="secondary"
              style={{ fontSize: 10, display: 'block', marginTop: 4 }}
            >
              Dual-trade (ELME) jobs always appear because both teams need them.
            </Text>
          )}
        </div>

        <Divider style={{ margin: '10px 0' }} />

        {/* ── Job Types ─────────────────────────────────── */}
        <div>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Job Types
          </Text>
          <Checkbox.Group
            value={selectedJobTypes}
            onChange={(vals) => setSelectedJobTypes(vals as JobType[])}
          >
            <Space size={16}>
              <Checkbox value="pm">PM</Checkbox>
              <Checkbox value="defect">Defects</Checkbox>
              <Checkbox value="inspection">Inspections</Checkbox>
            </Space>
          </Checkbox.Group>
        </div>

        {selectedDays.length === 0 && (
          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 10 }}>
            Please select at least one day.
          </Text>
        )}
        {selectedJobTypes.length === 0 && (
          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            Please select at least one job type.
          </Text>
        )}
      </div>
    </Modal>
  );
};
