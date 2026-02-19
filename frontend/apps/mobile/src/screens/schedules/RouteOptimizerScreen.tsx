/**
 * RouteOptimizerScreen - Route optimizer with map view
 *
 * Features:
 * - Equipment multi-select
 * - Optimize route button
 * - Route steps display
 * - Estimated time and distance
 * - Navigation integration
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { scheduleAIApi, type OptimizedRoute } from '@inspection/shared';
import { Button, Chip, Card, Divider } from 'react-native-paper';

export default function RouteOptimizerScreen() {
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);

  // Fetch equipment list
  const { data: equipmentData, isLoading: loadingEquipment } = useQuery({
    queryKey: ['equipment-for-route'],
    queryFn: async () => {
      try {
        // Fetch equipment with high/critical risk for route planning
        const response = await scheduleAIApi.getRiskScores();
        return response?.equipment_risk_scores || [];
      } catch (error) {
        console.error('Error fetching equipment:', error);
        return [];
      }
    },
  });

  // Optimize route mutation
  const optimizeRouteMutation = useMutation({
    mutationFn: async (equipmentIds: number[]) => {
      const response = await scheduleAIApi.optimizeRoute({
        equipment_ids: equipmentIds,
      });
      return response;
    },
    onSuccess: (data) => {
      setOptimizedRoute(data);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to optimize route');
    },
  });

  const equipment = equipmentData || [];

  const handleEquipmentToggle = (equipmentId: number) => {
    setSelectedEquipmentIds((prev) =>
      prev.includes(equipmentId)
        ? prev.filter((id) => id !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  const handleOptimizeRoute = () => {
    if (selectedEquipmentIds.length < 2) {
      Alert.alert('Invalid Selection', 'Please select at least 2 equipment items');
      return;
    }
    optimizeRouteMutation.mutate(selectedEquipmentIds);
  };

  const handleStartNavigation = () => {
    if (!optimizedRoute || optimizedRoute.route_order.length === 0) return;

    // Get the first location in the route
    const firstLocation = optimizedRoute.route_order[0];
    const locationName = encodeURIComponent(firstLocation.location);

    // Open in native maps app
    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });
    const url = Platform.select({
      ios: `${scheme}${locationName}`,
      android: `${scheme}${locationName}`,
    });

    if (url) {
      Linking.openURL(url).catch((err) => {
        Alert.alert('Error', 'Could not open maps application');
      });
    }
  };

  const handleClearRoute = () => {
    setOptimizedRoute(null);
    setSelectedEquipmentIds([]);
  };

  if (loadingEquipment) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!optimizedRoute ? (
        <>
          {/* Equipment Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Equipment for Route</Text>
            <Text style={styles.sectionSubtitle}>
              Select 2 or more equipment items to optimize your route
            </Text>

            <View style={styles.chipContainer}>
              {equipment.slice(0, 20).map((item) => (
                <Chip
                  key={item.equipment_id}
                  selected={selectedEquipmentIds.includes(item.equipment_id)}
                  onPress={() => handleEquipmentToggle(item.equipment_id)}
                  style={styles.equipmentChip}
                  textStyle={styles.chipText}
                  icon={selectedEquipmentIds.includes(item.equipment_id) ? 'check' : undefined}
                >
                  {item.equipment_name}
                </Chip>
              ))}
            </View>

            <View style={styles.selectedCountContainer}>
              <Text style={styles.selectedCountText}>
                {selectedEquipmentIds.length} {selectedEquipmentIds.length === 1 ? 'item' : 'items'} selected
              </Text>
            </View>
          </View>

          {/* Optimize Button */}
          <View style={styles.actionContainer}>
            <Button
              mode="contained"
              onPress={handleOptimizeRoute}
              disabled={selectedEquipmentIds.length < 2 || optimizeRouteMutation.isPending}
              style={styles.optimizeButton}
              labelStyle={styles.optimizeButtonLabel}
              icon="map-marker-path"
              loading={optimizeRouteMutation.isPending}
            >
              {optimizeRouteMutation.isPending ? 'Optimizing...' : 'Optimize Route'}
            </Button>
          </View>
        </>
      ) : (
        <>
          {/* Optimized Route Display */}
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryTitle}>Route Optimized!</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Distance</Text>
                  <Text style={styles.summaryValue}>
                    {optimizedRoute.total_distance.toFixed(1)} km
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Estimated Time</Text>
                  <Text style={styles.summaryValue}>
                    {Math.round(optimizedRoute.total_time_minutes)} min
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* Savings Summary */}
          {optimizedRoute.optimization_savings && (
            <Card style={styles.savingsCard}>
              <Card.Content>
                <Text style={styles.savingsTitle}>Optimization Savings</Text>
                <View style={styles.savingsRow}>
                  <View style={styles.savingsItem}>
                    <Text style={styles.savingsIcon}>📉</Text>
                    <Text style={styles.savingsValue}>
                      {optimizedRoute.optimization_savings.distance_saved_km.toFixed(1)} km
                    </Text>
                    <Text style={styles.savingsLabel}>Distance Saved</Text>
                  </View>
                  <View style={styles.savingsItem}>
                    <Text style={styles.savingsIcon}>⏱️</Text>
                    <Text style={styles.savingsValue}>
                      {Math.round(optimizedRoute.optimization_savings.time_saved_minutes)} min
                    </Text>
                    <Text style={styles.savingsLabel}>Time Saved</Text>
                  </View>
                  <View style={styles.savingsItem}>
                    <Text style={styles.savingsIcon}>✨</Text>
                    <Text style={styles.savingsValue}>
                      {Math.round(optimizedRoute.optimization_savings.efficiency_improvement_pct)}%
                    </Text>
                    <Text style={styles.savingsLabel}>Efficiency</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Route Steps */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route Steps</Text>
            {optimizedRoute.route_order.map((step) => (
              <View key={step.sequence} style={styles.routeStep}>
                <View style={styles.routeStepNumber}>
                  <Text style={styles.routeStepNumberText}>{step.sequence}</Text>
                </View>
                <View style={styles.routeStepContent}>
                  <Text style={styles.routeStepName}>{step.equipment_name}</Text>
                  <Text style={styles.routeStepLocation}>{step.location}</Text>
                  <View style={styles.routeStepStats}>
                    <Text style={styles.routeStepStat}>
                      ~{step.estimated_time_minutes} min
                    </Text>
                    {step.distance_from_previous > 0 && (
                      <>
                        <Text style={styles.routeStepSeparator}>•</Text>
                        <Text style={styles.routeStepStat}>
                          {step.distance_from_previous.toFixed(1)} km from previous
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Map Placeholder */}
          <Card style={styles.mapPlaceholder}>
            <Card.Content>
              <Text style={styles.mapPlaceholderText}>
                📍 Map view would display here
              </Text>
              <Text style={styles.mapPlaceholderSubtext}>
                Route visualization with {optimizedRoute.route_order.length} stops
              </Text>
            </Card.Content>
          </Card>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            <Button
              mode="contained"
              icon="navigation"
              onPress={handleStartNavigation}
              style={styles.navigationButton}
              labelStyle={styles.navigationButtonLabel}
            >
              Start Navigation
            </Button>

            <Button
              mode="outlined"
              icon="refresh"
              onPress={handleClearRoute}
              style={styles.clearButton}
              labelStyle={styles.clearButtonLabel}
            >
              Plan New Route
            </Button>
          </View>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },

  // Section
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 12,
  },

  // Equipment Selection
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipmentChip: { marginBottom: 4 },
  chipText: { fontSize: 12 },
  selectedCountContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  selectedCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },

  // Action Container
  actionContainer: { paddingHorizontal: 16, marginBottom: 16, gap: 10 },
  optimizeButton: {
    backgroundColor: '#1976D2',
    borderRadius: 10,
    paddingVertical: 6,
  },
  optimizeButtonLabel: { fontSize: 14, fontWeight: '600' },

  // Summary Card
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: '#757575', marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '700', color: '#212121' },

  // Savings Card
  savingsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  savingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 12,
  },
  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  savingsItem: { alignItems: 'center', flex: 1 },
  savingsIcon: { fontSize: 24, marginBottom: 4 },
  savingsValue: { fontSize: 18, fontWeight: '700', color: '#212121' },
  savingsLabel: { fontSize: 10, color: '#757575', marginTop: 2 },

  // Route Steps
  routeStep: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.05)',
    elevation: 2,
  },
  routeStepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routeStepNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  routeStepContent: { flex: 1 },
  routeStepName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  routeStepLocation: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 6,
  },
  routeStepStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeStepStat: { fontSize: 11, color: '#757575' },
  routeStepSeparator: { marginHorizontal: 6, color: '#757575' },

  // Map Placeholder
  mapPlaceholder: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
  },
  mapPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    textAlign: 'center',
    marginBottom: 4,
  },
  mapPlaceholderSubtext: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
  },

  // Navigation Buttons
  navigationButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 6,
  },
  navigationButtonLabel: { fontSize: 14, fontWeight: '600' },
  clearButton: {
    borderRadius: 10,
    borderColor: '#757575',
  },
  clearButtonLabel: { fontSize: 14, fontWeight: '600', color: '#757575' },

  bottomSpacer: { height: 40 },
});
