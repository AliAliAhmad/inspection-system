import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi, type DayInspectionSummary } from '@inspection/shared';

const STATUS_COLORS: Record<string, string> = {
  unassigned: '#9E9E9E',
  assigned: '#2196F3',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  mech_complete: '#FF9800',
  elec_complete: '#FF9800',
  both_complete: '#4CAF50',
  assessment_pending: '#7C4DFF',
};

interface InspectionSummaryBarProps {
  date: string; // YYYY-MM-DD
  berth: 'east' | 'west';
}

export default function InspectionSummaryBar({ date, berth }: InspectionSummaryBarProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const { data: inspections, isLoading, isError } = useQuery({
    queryKey: ['day-inspections', date, berth],
    queryFn: () => workPlansApi.getDayInspections(date, berth).then(r => r.data.data),
    enabled: !!date,
    staleTime: 30_000,
    retry: 1,
  });

  const berthData = inspections?.[berth];
  const count = berthData?.count ?? 0;
  const assignments = berthData?.assignments ?? [];

  if (isLoading) return null;

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2', borderWidth: 1, borderRadius: 8, padding: 8 }]}>
        <Text style={{ color: '#D32F2F', fontSize: 12 }}>Inspections failed to load</Text>
      </View>
    );
  }

  if (count === 0) return null;

  const assigned = assignments.filter(a => a.status === 'assigned').length;
  const inProgress = assignments.filter(a => ['in_progress', 'mech_complete', 'elec_complete'].includes(a.status)).length;
  const completed = assignments.filter(a => ['completed', 'both_complete', 'assessment_pending'].includes(a.status)).length;
  const unassigned = assignments.filter(a => a.status === 'unassigned').length;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.summaryBar}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.expandIcon}>{expanded ? '▼' : '▶'}</Text>
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.countText}>
          {count} {t('work_plan.inspections', 'Inspections')}
        </Text>
        <View style={styles.tagsRow}>
          {unassigned > 0 && <StatusTag count={unassigned} label="Unassigned" color="#9E9E9E" />}
          {assigned > 0 && <StatusTag count={assigned} label="Assigned" color="#2196F3" />}
          {inProgress > 0 && <StatusTag count={inProgress} label="In Progress" color="#FF9800" />}
          {completed > 0 && <StatusTag count={completed} label="Done" color="#4CAF50" />}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.grid}>
          {assignments.map((a, idx) => (
            <InspectionCard key={idx} assignment={a} />
          ))}
        </View>
      )}
    </View>
  );
}

function StatusTag({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{count} {label}</Text>
    </View>
  );
}

function InspectionCard({ assignment }: { assignment: DayInspectionSummary }) {
  const statusColor = STATUS_COLORS[assignment.status] ?? '#9E9E9E';

  return (
    <View style={[styles.card, { borderLeftColor: statusColor }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.equipmentName} numberOfLines={1}>
          {assignment.equipment_name}
        </Text>
      </View>
      {assignment.equipment_serial ? (
        <Text style={styles.serialText}>{assignment.equipment_serial}</Text>
      ) : null}
      <View style={styles.inspectorsList}>
        {assignment.mechanical_inspector && (
          <Text style={styles.inspectorText}>M: {assignment.mechanical_inspector}</Text>
        )}
        {assignment.electrical_inspector && (
          <Text style={styles.inspectorText}>E: {assignment.electrical_inspector}</Text>
        )}
        {assignment.engineer && (
          <Text style={styles.engineerText}>Eng: {assignment.engineer}</Text>
        )}
        {!assignment.mechanical_inspector && !assignment.electrical_inspector && (
          <Text style={styles.notAssignedText}>Not Assigned</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  expandIcon: {
    fontSize: 10,
    color: '#1565C0',
  },
  searchIcon: {
    fontSize: 14,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
  },
  tagsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  grid: {
    marginTop: 8,
    gap: 6,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  equipmentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },
  serialText: {
    fontSize: 11,
    color: '#757575',
    marginBottom: 4,
    marginLeft: 14,
  },
  inspectorsList: {
    marginLeft: 14,
  },
  inspectorText: {
    fontSize: 11,
    color: '#616161',
  },
  engineerText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '500',
  },
  notAssignedText: {
    fontSize: 11,
    color: '#F44336',
  },
});
