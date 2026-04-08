import { useMemo, useState } from 'react';
import { Table, Tag, Select, Space, Typography, Button, Tooltip } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ReadingGroup, ReadingDataPoint } from '@inspection/shared';
import dayjs from 'dayjs';
import { EditReadingModal } from './EditReadingModal';

const { Text } = Typography;

interface ReadingsHistoryTableProps {
  groups: ReadingGroup[];
  /** Admin role: when true, an extra "Edit" column appears next to each row.
   *  Only readings from the equipment_reading source can be edited. */
  isAdmin?: boolean;
  /** Equipment ID — required when isAdmin is true so the edit modal knows
   *  which API endpoint to call. */
  equipmentId?: number;
}

interface FlatReading extends ReadingDataPoint {
  key: string;
  group_key: string;
  group_label: string;
  source: string;
  max_threshold: number | null;
  min_threshold: number | null;
}

export default function ReadingsHistoryTable({
  groups,
  isAdmin = false,
  equipmentId,
}: ReadingsHistoryTableProps) {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [editingReading, setEditingReading] = useState<FlatReading | null>(null);

  const flatReadings: FlatReading[] = useMemo(() => {
    const rows: FlatReading[] = [];
    for (const g of groups) {
      for (const r of g.readings) {
        rows.push({
          ...r,
          key: `${g.group_key}-${r.id}`,
          group_key: g.group_key,
          group_label: g.label,
          source: g.source,
          max_threshold: g.thresholds.max_value,
          min_threshold: g.thresholds.min_value,
        });
      }
    }
    rows.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
    return rows;
  }, [groups]);

  // Find the previous reading on the same group (one row newer-than-the-edited)
  // for the modal's "max realistic" computation.
  const previousReadingForEdited: ReadingDataPoint | null = useMemo(() => {
    if (!editingReading) return null;
    // Filter to same group, sort by date asc
    const sameGroup = flatReadings
      .filter((r) => r.group_key === editingReading.group_key)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const idx = sameGroup.findIndex((r) => r.id === editingReading.id);
    if (idx <= 0) return null;
    return sameGroup[idx - 1];
  }, [editingReading, flatReadings]);

  const filtered = typeFilter
    ? flatReadings.filter((r) => r.group_key === typeFilter)
    : flatReadings;

  const typeOptions = groups.map((g) => ({ label: g.label, value: g.group_key }));

  const columns = [
    {
      title: t('readings.date', 'Date'),
      dataIndex: 'recorded_at',
      key: 'date',
      width: 150,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
      sorter: (a: FlatReading, b: FlatReading) =>
        (a.recorded_at || '').localeCompare(b.recorded_at || ''),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: t('readings.type', 'Reading Type'),
      dataIndex: 'group_label',
      key: 'type',
      width: 180,
    },
    {
      title: t('readings.value', 'Value'),
      dataIndex: 'value',
      key: 'value',
      width: 110,
      render: (val: number, row: FlatReading) => {
        if (row.is_faulty) return <Tag color="red">Faulty</Tag>;
        const exceeds = row.max_threshold != null && val > row.max_threshold;
        const below = row.min_threshold != null && val < row.min_threshold;
        const color = exceeds ? '#ff4d4f' : below ? '#faad14' : '#262626';
        return (
          <Space size={4}>
            <Text strong style={{ color }}>{val}</Text>
            {row.is_edited && (
              <Tooltip
                title={
                  <>
                    Edited {row.edit_count}× — original was{' '}
                    <strong>{row.original_value}</strong>
                    {row.edit_reason && <><br />Reason: {row.edit_reason}</>}
                    {row.updated_by_name && <><br />By: {row.updated_by_name}</>}
                  </>
                }
              >
                <Tag color="orange" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                  edited
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
      sorter: (a: FlatReading, b: FlatReading) => a.value - b.value,
    },
    {
      title: t('readings.status', 'Status'),
      key: 'status',
      width: 90,
      render: (_: unknown, row: FlatReading) => {
        if (row.is_faulty) return <Tag color="red">Faulty</Tag>;
        if (row.max_threshold != null && row.value > row.max_threshold) return <Tag color="red">High</Tag>;
        if (row.min_threshold != null && row.value < row.min_threshold) return <Tag color="orange">Low</Tag>;
        return <Tag color="green">OK</Tag>;
      },
    },
    {
      title: t('readings.recordedBy', 'Recorded By'),
      dataIndex: 'recorded_by',
      key: 'recorded_by',
      width: 150,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('readings.source', 'Source'),
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (v: string) => {
        const colors: Record<string, string> = {
          equipment_reading: 'blue',
          inspection_answer: 'purple',
          running_hours: 'cyan',
        };
        return <Tag color={colors[v] || 'default'}>{v.replace(/_/g, ' ')}</Tag>;
      },
    },
    // Admin-only edit column. Works for all 3 sources (equipment_reading,
    // inspection_answer, running_hours) — the backend routes internally.
    ...(isAdmin && equipmentId
      ? [
          {
            title: t('readings.actions', 'Actions'),
            key: 'actions',
            width: 80,
            fixed: 'right' as const,
            render: (_: unknown, row: FlatReading) => (
              <Tooltip title="Correct this reading (admin only)">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditingReading(row)}
                />
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by type"
          allowClear
          style={{ width: 250 }}
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <Text type="secondary">{filtered.length} readings</Text>
      </Space>
      <Table
        columns={columns}
        dataSource={filtered}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true }}
        scroll={{ y: 500, x: 'max-content' }}
      />

      {/* Admin edit modal */}
      {isAdmin && equipmentId && (
        <EditReadingModal
          open={editingReading !== null}
          equipmentId={equipmentId}
          reading={editingReading}
          previousReading={previousReadingForEdited}
          onClose={() => setEditingReading(null)}
        />
      )}
    </div>
  );
}
