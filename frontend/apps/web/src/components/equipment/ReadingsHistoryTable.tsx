import { useMemo, useState } from 'react';
import { Table, Tag, Select, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ReadingGroup } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text } = Typography;

interface ReadingsHistoryTableProps {
  groups: ReadingGroup[];
}

interface FlatReading {
  key: string;
  group_key: string;
  group_label: string;
  value: number;
  date: string;
  recorded_at: string;
  recorded_by: string | null;
  inspection_id: number | null;
  is_faulty: boolean;
  source: string;
  max_threshold: number | null;
  min_threshold: number | null;
}

export default function ReadingsHistoryTable({ groups }: ReadingsHistoryTableProps) {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const flatReadings: FlatReading[] = useMemo(() => {
    const rows: FlatReading[] = [];
    for (const g of groups) {
      for (const r of g.readings) {
        rows.push({
          key: `${g.group_key}-${r.id}`,
          group_key: g.group_key,
          group_label: g.label,
          value: r.value,
          date: r.date,
          recorded_at: r.recorded_at,
          recorded_by: r.recorded_by,
          inspection_id: r.inspection_id,
          is_faulty: r.is_faulty,
          source: g.source,
          max_threshold: g.thresholds.max_value,
          min_threshold: g.thresholds.min_value,
        });
      }
    }
    rows.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
    return rows;
  }, [groups]);

  const filtered = typeFilter
    ? flatReadings.filter(r => r.group_key === typeFilter)
    : flatReadings;

  const typeOptions = groups.map(g => ({ label: g.label, value: g.group_key }));

  const columns = [
    {
      title: t('readings.date', 'Date'),
      dataIndex: 'recorded_at',
      key: 'date',
      width: 150,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
      sorter: (a: FlatReading, b: FlatReading) => (a.recorded_at || '').localeCompare(b.recorded_at || ''),
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
      width: 100,
      render: (val: number, row: FlatReading) => {
        if (row.is_faulty) return <Tag color="red">Faulty</Tag>;
        const exceeds = row.max_threshold != null && val > row.max_threshold;
        const below = row.min_threshold != null && val < row.min_threshold;
        const color = exceeds ? '#ff4d4f' : below ? '#faad14' : '#262626';
        return <Text strong style={{ color }}>{val}</Text>;
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
        const colors: Record<string, string> = { equipment_reading: 'blue', inspection_answer: 'purple', running_hours: 'cyan' };
        return <Tag color={colors[v] || 'default'}>{v.replace(/_/g, ' ')}</Tag>;
      },
    },
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
        scroll={{ y: 500 }}
      />
    </div>
  );
}
