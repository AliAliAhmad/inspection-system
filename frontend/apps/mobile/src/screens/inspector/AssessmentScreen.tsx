import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  assessmentsApi,
  FinalAssessment,
  Verdict,
} from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'Assessment'>;

export default function AssessmentScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id } = route.params;

  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [urgentReason, setUrgentReason] = useState('');

  // Try to get existing assessment; if not found, create one
  const {
    data: assessment,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['assessment', id],
    queryFn: async () => {
      try {
        const res = await assessmentsApi.get(id);
        return res.data.data ?? res.data;
      } catch {
        // If not found, attempt to create
        const createRes = await assessmentsApi.create(id);
        return createRes.data.data ?? createRes.data;
      }
    },
  });

  const verdictMutation = useMutation({
    mutationFn: (payload: { verdict: Verdict; urgent_reason?: string }) =>
      assessmentsApi.submitVerdict((assessment as FinalAssessment).id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', id] });
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
      Alert.alert(t('common.confirm'), t('common.submit'));
    },
    onError: () => {
      Alert.alert(t('common.error'), t('common.error'));
    },
  });

  const handleSubmitVerdict = useCallback(() => {
    if (!selectedVerdict) return;

    if (selectedVerdict === 'urgent' && !urgentReason.trim()) {
      Alert.alert(t('common.error'), 'Urgent reason is required.');
      return;
    }

    Alert.alert(
      t('common.confirm'),
      `${t('common.submit')} "${selectedVerdict}"?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.submit'),
          onPress: () => {
            verdictMutation.mutate({
              verdict: selectedVerdict,
              urgent_reason: selectedVerdict === 'urgent' ? urgentReason.trim() : undefined,
            });
          },
        },
      ],
    );
  }, [selectedVerdict, urgentReason, t, verdictMutation]);

  const getVerdictColor = (verdict: Verdict | null): string => {
    if (verdict === 'operational') return '#4CAF50';
    if (verdict === 'urgent') return '#F44336';
    return '#9E9E9E';
  };

  const getVerdictLabel = (verdict: Verdict | null): string => {
    if (verdict === 'operational') return t('status.operational');
    if (verdict === 'urgent') return t('status.urgent');
    return t('status.pending');
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError || !assessment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = assessment as FinalAssessment;
  const isMechInspector = user?.id === data.mechanical_inspector_id;
  const isElecInspector = user?.id === data.electrical_inspector_id;
  const userVerdict = isMechInspector ? data.mech_verdict : isElecInspector ? data.elec_verdict : null;
  const hasSubmittedVerdict = userVerdict !== null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      {/* Equipment Info */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('common.details')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Assignment ID:</Text>
          <Text style={styles.infoValue}>#{data.inspection_assignment_id}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Equipment ID:</Text>
          <Text style={styles.infoValue}>#{data.equipment_id}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.status')}:</Text>
          <Text
            style={[
              styles.infoValue,
              { color: data.final_status ? getVerdictColor(data.final_status) : '#9E9E9E' },
            ]}
          >
            {data.final_status ? getVerdictLabel(data.final_status) : t('status.pending')}
          </Text>
        </View>
        {data.finalized_at ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Finalized:</Text>
            <Text style={styles.infoValue}>
              {new Date(data.finalized_at).toLocaleString()}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Verdicts Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('nav.assessments')}</Text>

        {/* Mechanical Inspector Verdict */}
        <View style={styles.verdictRow}>
          <Text style={styles.verdictLabel}>Mechanical Inspector:</Text>
          <View
            style={[
              styles.verdictBadge,
              { backgroundColor: getVerdictColor(data.mech_verdict) },
            ]}
          >
            <Text style={styles.verdictBadgeText}>
              {getVerdictLabel(data.mech_verdict)}
            </Text>
          </View>
        </View>

        {/* Electrical Inspector Verdict */}
        <View style={styles.verdictRow}>
          <Text style={styles.verdictLabel}>Electrical Inspector:</Text>
          <View
            style={[
              styles.verdictBadge,
              { backgroundColor: getVerdictColor(data.elec_verdict) },
            ]}
          >
            <Text style={styles.verdictBadgeText}>
              {getVerdictLabel(data.elec_verdict)}
            </Text>
          </View>
        </View>

        {/* Final Status */}
        {data.final_status ? (
          <View style={styles.finalStatusContainer}>
            <Text style={styles.finalStatusLabel}>Final Status:</Text>
            <View
              style={[
                styles.finalStatusBadge,
                { backgroundColor: getVerdictColor(data.final_status) },
              ]}
            >
              <Text style={styles.finalStatusText}>
                {getVerdictLabel(data.final_status)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Resolution Info */}
      {data.resolved_by ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Resolution</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Resolved By:</Text>
            <Text style={styles.infoValue}>{data.resolved_by.replace('_', ' ')}</Text>
          </View>
          {data.admin_decision_notes ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Admin Notes:</Text>
              <Text style={styles.infoValue}>{data.admin_decision_notes}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Urgent Reason */}
      {data.urgent_reason ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('status.urgent')} Reason</Text>
          <Text style={styles.urgentReasonText}>{data.urgent_reason}</Text>
        </View>
      ) : null}

      {/* Submit Verdict Section */}
      {(isMechInspector || isElecInspector) && !hasSubmittedVerdict ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your Verdict</Text>

          <View style={styles.verdictSelection}>
            <TouchableOpacity
              style={[
                styles.verdictCard,
                styles.verdictCardOperational,
                selectedVerdict === 'operational' && styles.verdictCardSelectedGreen,
              ]}
              onPress={() => setSelectedVerdict('operational')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.verdictCardTitle,
                  selectedVerdict === 'operational' && styles.verdictCardTitleSelected,
                ]}
              >
                {t('status.operational')}
              </Text>
              <Text
                style={[
                  styles.verdictCardDesc,
                  selectedVerdict === 'operational' && styles.verdictCardDescSelected,
                ]}
              >
                Equipment is functioning properly
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.verdictCard,
                styles.verdictCardUrgent,
                selectedVerdict === 'urgent' && styles.verdictCardSelectedRed,
              ]}
              onPress={() => setSelectedVerdict('urgent')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.verdictCardTitle,
                  selectedVerdict === 'urgent' && styles.verdictCardTitleSelected,
                ]}
              >
                {t('status.urgent')}
              </Text>
              <Text
                style={[
                  styles.verdictCardDesc,
                  selectedVerdict === 'urgent' && styles.verdictCardDescSelected,
                ]}
              >
                Equipment requires immediate attention
              </Text>
            </TouchableOpacity>
          </View>

          {selectedVerdict === 'urgent' ? (
            <TextInput
              style={styles.urgentReasonInput}
              value={urgentReason}
              onChangeText={setUrgentReason}
              placeholder="Enter reason for urgent status (required)"
              multiline
              numberOfLines={3}
            />
          ) : null}

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!selectedVerdict || verdictMutation.isPending) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmitVerdict}
            disabled={!selectedVerdict || verdictMutation.isPending}
          >
            {verdictMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{t('common.submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Already submitted message */}
      {(isMechInspector || isElecInspector) && hasSubmittedVerdict ? (
        <View style={styles.submittedCard}>
          <Text style={styles.submittedText}>
            Your verdict: {getVerdictLabel(userVerdict)}
          </Text>
        </View>
      ) : null}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#757575',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
    textTransform: 'capitalize',
  },
  verdictRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  verdictLabel: {
    fontSize: 14,
    color: '#424242',
    fontWeight: '500',
  },
  verdictBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  verdictBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  finalStatusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
  },
  finalStatusLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  finalStatusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  finalStatusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  urgentReasonText: {
    fontSize: 14,
    color: '#D32F2F',
    lineHeight: 20,
  },
  verdictSelection: {
    gap: 12,
    marginBottom: 16,
  },
  verdictCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    alignItems: 'center',
  },
  verdictCardOperational: {
    borderColor: '#C8E6C9',
    backgroundColor: '#F1F8E9',
  },
  verdictCardUrgent: {
    borderColor: '#FFCDD2',
    backgroundColor: '#FFF5F5',
  },
  verdictCardSelectedGreen: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  verdictCardSelectedRed: {
    borderColor: '#F44336',
    backgroundColor: '#F44336',
  },
  verdictCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#424242',
    marginBottom: 4,
  },
  verdictCardTitleSelected: {
    color: '#fff',
  },
  verdictCardDesc: {
    fontSize: 13,
    color: '#757575',
  },
  verdictCardDescSelected: {
    color: 'rgba(255,255,255,0.85)',
  },
  urgentReasonInput: {
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
    backgroundColor: '#FFF5F5',
    color: '#212121',
  },
  submitButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  submittedCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  submittedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
    textTransform: 'capitalize',
  },
  bottomSpacer: {
    height: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
