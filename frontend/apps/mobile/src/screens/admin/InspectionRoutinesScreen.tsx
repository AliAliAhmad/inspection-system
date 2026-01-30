import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionRoutinesApi,
} from '@inspection/shared';
import type {
  InspectionRoutine,
} from '@inspection/shared';

const dayAbbr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Badge({ label, color, textColor }: { label: string; color: string; textColor?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[styles.badgeText, { color: textColor ?? '#fff' }]}>{label}</Text>
    </View>
  );
}

function RoutineCard({
  routine,
  onToggleActive,
  isToggling,
}: {
  routine: InspectionRoutine;
  onToggleActive: (routine: InspectionRoutine) => void;
  isToggling: boolean;
}) {
  const { t } = useTranslation();

  const daysText = routine.days_of_week
    .map((d) => dayAbbr[d] ?? `${d}`)
    .join(', ');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {routine.name}
        </Text>
        <TouchableOpacity
          style={[
            styles.activeToggle,
            { backgroundColor: routine.is_active ? '#4CAF50' : '#BDBDBD' },
          ]}
          onPress={() => onToggleActive(routine)}
          disabled={isToggling}
          activeOpacity={0.7}
        >
          {isToggling ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.activeToggleText}>
              {routine.is_active
                ? t('routines.active', 'Active')
                : t('routines.inactive', 'Inactive')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Asset Types */}
      {routine.asset_types.length > 0 && (
        <View style={styles.badgeRow}>
          {routine.asset_types.map((type) => (
            <Badge key={type} label={type} color="#E3F2FD" textColor="#1976D2" />
          ))}
        </View>
      )}

      {/* Shift & Days */}
      <View style={styles.detailRow}>
        <Badge
          label={routine.shift === 'day'
            ? t('routines.day_shift', 'Day')
            : t('routines.night_shift', 'Night')}
          color={routine.shift === 'day' ? '#FFF9C4' : '#311B92'}
          textColor={routine.shift === 'day' ? '#F57F17' : '#fff'}
        />
        <Text style={styles.daysText}>{daysText}</Text>
      </View>

      {/* Template ID */}
      <Text style={styles.templateText}>
        {t('routines.template_id', 'Template')}: #{routine.template_id}
      </Text>
    </View>
  );
}

export default function InspectionRoutinesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const routinesQuery = useQuery({
    queryKey: ['inspection-routines'],
    queryFn: () => inspectionRoutinesApi.list(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      inspectionRoutinesApi.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
    },
  });

  const routines: InspectionRoutine[] =
    (routinesQuery.data?.data as any)?.data ?? (routinesQuery.data?.data as any) ?? [];

  const handleToggleActive = useCallback(
    (routine: InspectionRoutine) => {
      toggleMutation.mutate({ id: routine.id, is_active: !routine.is_active });
    },
    [toggleMutation],
  );

  const handleRefresh = useCallback(() => {
    routinesQuery.refetch();
  }, [routinesQuery]);

  if (routinesQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('routines.title', 'Inspection Routines')}</Text>

      <FlatList
        data={routines}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RoutineCard
            routine={item}
            onToggleActive={handleToggleActive}
            isToggling={
              toggleMutation.isPending &&
              (toggleMutation.variables as any)?.id === item.id
            }
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={routinesQuery.isRefetching}
            onRefresh={handleRefresh}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('routines.empty', 'No inspection routines found.')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    flex: 1,
    marginRight: 12,
  },
  activeToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 72,
    alignItems: 'center',
  },
  activeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  daysText: {
    fontSize: 13,
    color: '#616161',
    fontWeight: '500',
  },
  templateText: {
    fontSize: 12,
    color: '#757575',
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
  },
});
