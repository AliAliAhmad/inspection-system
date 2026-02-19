/**
 * ScheduleAICard - Card component for AI insights
 *
 * Displays Schedule AI insights with category, priority, recommendations
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Button } from 'react-native-paper';
import type { ScheduleAIInsight } from '@inspection/shared';

export interface ScheduleAICardProps {
  insight: ScheduleAIInsight;
  onAction?: (insight: ScheduleAIInsight) => void;
}

const CATEGORY_COLORS = {
  risk: '#F44336',
  efficiency: '#FF9800',
  quality: '#2196F3',
  capacity: '#9C27B0',
  optimization: '#4CAF50',
};

const PRIORITY_COLORS = {
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#bfbfbf',
};

export function ScheduleAICard({ insight, onAction }: ScheduleAICardProps) {
  const [expanded, setExpanded] = useState(false);

  const categoryColor = CATEGORY_COLORS[insight.category] || '#757575';
  const priorityColor = PRIORITY_COLORS[insight.priority] || '#bfbfbf';

  return (
    <Card style={[styles.card, { borderLeftColor: categoryColor }]}>
      <Card.Content>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
            <Text style={styles.categoryText}>{insight.category.toUpperCase()}</Text>
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
            <Text style={styles.priorityText}>{insight.priority.toUpperCase()}</Text>
          </View>
        </View>

        {/* Title and Description */}
        <Text style={styles.title}>{insight.title}</Text>
        <Text style={styles.description}>{insight.description}</Text>

        {/* Impact Estimate */}
        {insight.impact_estimate && (
          <View style={styles.impactContainer}>
            <Text style={styles.impactLabel}>Impact:</Text>
            <Text style={styles.impactValue}>{insight.impact_estimate}</Text>
          </View>
        )}

        {/* Expandable Recommendations */}
        {insight.actionable_recommendations && insight.actionable_recommendations.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setExpanded(!expanded)}
              activeOpacity={0.7}
            >
              <Text style={styles.expandButtonText}>
                {expanded ? '▼' : '▶'} Recommendations ({insight.actionable_recommendations.length})
              </Text>
            </TouchableOpacity>

            {expanded && (
              <View style={styles.recommendationsContainer}>
                {insight.actionable_recommendations.map((rec, index) => (
                  <View key={index} style={styles.recommendationItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.recommendationText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Action Button */}
        {onAction && (
          <Button
            mode="contained"
            onPress={() => onAction(insight)}
            style={styles.actionButton}
            labelStyle={styles.actionButtonLabel}
            compact
          >
            Take Action
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Content
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    color: '#424242',
    lineHeight: 19,
    marginBottom: 12,
  },

  // Impact
  impactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  impactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginRight: 6,
  },
  impactValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },

  // Expand Button
  expandButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },

  // Recommendations
  recommendationsContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  recommendationItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#1976D2',
    marginRight: 8,
    marginTop: 1,
  },
  recommendationText: {
    fontSize: 12,
    color: '#212121',
    lineHeight: 18,
    flex: 1,
  },

  // Action Button
  actionButton: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    marginTop: 4,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ScheduleAICard;
