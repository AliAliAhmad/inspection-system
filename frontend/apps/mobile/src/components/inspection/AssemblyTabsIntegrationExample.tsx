/**
 * AssemblyTabsIntegrationExample.tsx
 *
 * This file demonstrates how to integrate Assembly Tabs into the InspectionChecklistScreen.
 * It is meant as a reference implementation, not a standalone component.
 *
 * Key features:
 * - Groups questions by assembly/category
 * - Horizontal scrollable tabs at top
 * - Progress per tab (5/8 format and progress bar)
 * - Color coding: Green (complete), Yellow (in-progress), Gray (not started)
 * - Animated indicator under active tab
 * - Badge showing incomplete count per assembly
 * - Swipe between tabs or tap to switch
 * - Remembers last active tab
 * - Bilingual support (AR/EN)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChecklistItem } from '@inspection/shared';

// Import the Assembly Tabs components
import {
  AssemblyTabs,
  SwipeableAssemblyTabs,
  createAssemblyGroups,
  createAssemblyTabs,
  AssemblyGroup,
  AssemblyTab,
} from './AssemblyTabs';

// Example usage with the original AssemblyTabs component (filter mode)
export function ExampleWithFilterMode() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  // Example checklist items with assemblies
  const checklistItems: ChecklistItem[] = [
    // These would come from your API
    // Each item should have an 'assembly' or 'category' field
  ];

  // Local answers state (from InspectionChecklistScreen)
  const [localAnswers, setLocalAnswers] = useState<Record<number, { answer_value: string }>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Get answer status for grouping
  const getAnswerStatus = useCallback((itemId: number): 'pass' | 'fail' | 'unanswered' => {
    const answer = localAnswers[itemId];
    if (!answer?.answer_value) return 'unanswered';
    if (['yes', 'pass'].includes(answer.answer_value)) return 'pass';
    if (['no', 'fail'].includes(answer.answer_value)) return 'fail';
    return 'pass'; // Text/numeric answers count as pass
  }, [localAnswers]);

  // Create assembly groups
  const assemblyGroups = useMemo(() => {
    return createAssemblyGroups(checklistItems, getAnswerStatus);
  }, [checklistItems, getAnswerStatus]);

  // Handle group selection - filter to show only questions in that group
  const handleSelectGroup = useCallback((group: AssemblyGroup, groupIndex: number) => {
    // Jump to the first question in this assembly group
    setCurrentQuestionIndex(group.startIndex);
  }, []);

  // Handle jump to first incomplete
  const handleJumpToIncomplete = useCallback(() => {
    // Find the first unanswered question
    const firstUnanswered = checklistItems.findIndex(
      (item) => getAnswerStatus(item.id) === 'unanswered'
    );
    if (firstUnanswered >= 0) {
      setCurrentQuestionIndex(firstUnanswered);
    }
  }, [checklistItems, getAnswerStatus]);

  // Get filtered items based on current group
  const currentGroup = assemblyGroups.find(
    (g) => currentQuestionIndex >= g.startIndex && currentQuestionIndex <= g.endIndex
  );

  const filteredItems = currentGroup
    ? checklistItems.slice(currentGroup.startIndex, currentGroup.endIndex + 1)
    : checklistItems;

  return (
    <View style={styles.container}>
      {/* Assembly tabs at the top */}
      <AssemblyTabs
        groups={assemblyGroups}
        currentIndex={currentQuestionIndex}
        onSelectGroup={handleSelectGroup}
        onJumpToIncomplete={handleJumpToIncomplete}
        isArabic={isArabic}
        inspectionId={123} // Pass the actual inspection ID for tab persistence
      />

      {/* Questions list (filtered by assembly) */}
      <ScrollView style={styles.content}>
        {filteredItems.map((item, idx) => (
          <View key={item.id} style={styles.questionCard}>
            <Text style={styles.questionText}>{item.question_text}</Text>
            {/* Your existing question rendering logic */}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Example usage with SwipeableAssemblyTabs component (swipe mode)
export function ExampleWithSwipeMode() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  // Example checklist items with assemblies
  const checklistItems: ChecklistItem[] = [
    // These would come from your API
  ];

  const [localAnswers, setLocalAnswers] = useState<Record<number, { answer_value: string }>>({});
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const getAnswerStatus = useCallback((itemId: number): 'pass' | 'fail' | 'unanswered' => {
    const answer = localAnswers[itemId];
    if (!answer?.answer_value) return 'unanswered';
    if (['yes', 'pass'].includes(answer.answer_value)) return 'pass';
    if (['no', 'fail'].includes(answer.answer_value)) return 'fail';
    return 'pass';
  }, [localAnswers]);

  // Create assembly tabs
  const assemblyTabs = useMemo(() => {
    return createAssemblyTabs(checklistItems, getAnswerStatus);
  }, [checklistItems, getAnswerStatus]);

  // Render content for each tab
  const renderTabContent = useCallback((tab: AssemblyTab, index: number) => {
    // Get questions for this tab
    const tabQuestions = checklistItems.filter((item) =>
      tab.questionIds.includes(item.id)
    );

    return (
      <ScrollView style={styles.tabContent}>
        {tabQuestions.map((item) => (
          <View key={item.id} style={styles.questionCard}>
            <Text style={styles.questionText}>
              {isArabic && (item as any).question_text_ar
                ? (item as any).question_text_ar
                : item.question_text}
            </Text>
            {/* Your existing question rendering logic */}
          </View>
        ))}
      </ScrollView>
    );
  }, [checklistItems, isArabic]);

  return (
    <SwipeableAssemblyTabs
      tabs={assemblyTabs}
      activeTabIndex={activeTabIndex}
      onTabChange={setActiveTabIndex}
      renderContent={renderTabContent}
      isArabic={isArabic}
      inspectionId={123}
    />
  );
}

// Integration steps for InspectionChecklistScreen:
//
// 1. Import the components:
//    import { AssemblyTabs, createAssemblyGroups, AssemblyGroup } from '../../components/inspection';
//
// 2. Create a function to get answer status:
//    const getAnswerStatus = useCallback((itemId: number) => {
//      const answer = localAnswers[itemId];
//      if (!answer?.answer_value) return 'unanswered';
//      if (['yes', 'pass'].includes(answer.answer_value)) return 'pass';
//      if (['no', 'fail'].includes(answer.answer_value)) return 'fail';
//      return 'pass';
//    }, [localAnswers]);
//
// 3. Create assembly groups from checklist items:
//    const assemblyGroups = useMemo(() => {
//      return createAssemblyGroups(checklistItems, getAnswerStatus);
//    }, [checklistItems, getAnswerStatus]);
//
// 4. Add state for current question index:
//    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
//
// 5. Add AssemblyTabs before the checklist items:
//    <AssemblyTabs
//      groups={assemblyGroups}
//      currentIndex={currentQuestionIndex}
//      onSelectGroup={(group) => setCurrentQuestionIndex(group.startIndex)}
//      onJumpToIncomplete={() => {
//        const firstUnanswered = checklistItems.findIndex(
//          (item) => getAnswerStatus(item.id) === 'unanswered'
//        );
//        if (firstUnanswered >= 0) setCurrentQuestionIndex(firstUnanswered);
//      }}
//      isArabic={i18n.language === 'ar'}
//      inspectionId={inspectionId}
//    />
//
// 6. Optionally filter displayed items by current assembly:
//    const currentGroup = assemblyGroups.find(
//      (g) => currentQuestionIndex >= g.startIndex && currentQuestionIndex <= g.endIndex
//    );
//    const filteredItems = currentGroup
//      ? checklistItems.slice(currentGroup.startIndex, currentGroup.endIndex + 1)
//      : checklistItems;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
    lineHeight: 24,
  },
});

export default { ExampleWithFilterMode, ExampleWithSwipeMode };
