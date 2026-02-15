import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Vibration,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type NoteImportance = 'normal' | 'important' | 'info';

export interface QuickNote {
  id: string;
  text: string;
  importance: NoteImportance;
  questionId?: number;
  questionText?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuickNotesProps {
  /** Inspection ID for persistence */
  inspectionId: number;
  /** Current question ID for context */
  currentQuestionId?: number;
  /** Current question text for context */
  currentQuestionText?: string;
  /** Callback when notes change */
  onNotesChange?: (notes: QuickNote[]) => void;
  /** Initial position */
  initialPosition?: { x: number; y: number };
  /** Show the floating button */
  showFloatingButton?: boolean;
}

// Note importance colors
const IMPORTANCE_COLORS = {
  normal: {
    background: '#FFFDE7', // Yellow
    border: '#FDD835',
    icon: '#F9A825',
    text: '#5D4037',
  },
  important: {
    background: '#FFEBEE', // Red
    border: '#EF5350',
    icon: '#C62828',
    text: '#B71C1C',
  },
  info: {
    background: '#E3F2FD', // Blue
    border: '#42A5F5',
    icon: '#1565C0',
    text: '#0D47A1',
  },
};

export function QuickNotes({
  inspectionId,
  currentQuestionId,
  currentQuestionText,
  onNotesChange,
  initialPosition = { x: SCREEN_WIDTH - 70, y: SCREEN_HEIGHT - 200 },
  showFloatingButton = true,
}: QuickNotesProps) {
  const { t } = useTranslation();

  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteImportance, setNewNoteImportance] = useState<NoteImportance>('normal');
  const [editingNote, setEditingNote] = useState<QuickNote | null>(null);
  const [filterImportance, setFilterImportance] = useState<NoteImportance | 'all'>('all');

  // Animation refs
  const position = useRef(new Animated.ValueXY(initialPosition)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load notes from storage
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const stored = await AsyncStorage.getItem(`quick_notes_${inspectionId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setNotes(parsed);
          onNotesChange?.(parsed);
        }
      } catch (error) {
        console.error('Failed to load quick notes:', error);
      }
    };
    loadNotes();
  }, [inspectionId, onNotesChange]);

  // Save notes to storage
  const saveNotes = useCallback(async (newNotes: QuickNote[]) => {
    try {
      await AsyncStorage.setItem(`quick_notes_${inspectionId}`, JSON.stringify(newNotes));
      onNotesChange?.(newNotes);
    } catch (error) {
      console.error('Failed to save quick notes:', error);
    }
  }, [inspectionId, onNotesChange]);

  // Pan responder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.setOffset({
          x: (position.x as any)._value,
          y: (position.y as any)._value,
        });
        position.setValue({ x: 0, y: 0 });
        Vibration.vibrate(30);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        position.flattenOffset();

        // Snap to edges
        const finalX = gesture.moveX < SCREEN_WIDTH / 2 ? 20 : SCREEN_WIDTH - 70;
        const finalY = Math.max(100, Math.min(SCREEN_HEIGHT - 150, gesture.moveY));

        Animated.spring(position, {
          toValue: { x: finalX, y: finalY },
          friction: 7,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Toggle expanded state
  const toggleExpanded = useCallback(() => {
    Vibration.vibrate(30);
    const toValue = isExpanded ? 0 : 1;

    Animated.spring(expandAnim, {
      toValue,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();

    setIsExpanded(!isExpanded);
  }, [isExpanded, expandAnim]);

  // Add note
  const handleAddNote = useCallback(() => {
    if (!newNoteText.trim()) return;

    const newNote: QuickNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: newNoteText.trim(),
      importance: newNoteImportance,
      questionId: currentQuestionId,
      questionText: currentQuestionText,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);
    saveNotes(updatedNotes);

    // Reset form
    setNewNoteText('');
    setNewNoteImportance('normal');
    setShowAddModal(false);

    // Pulse animation to indicate note added
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    Vibration.vibrate([50, 50, 50]);
  }, [newNoteText, newNoteImportance, currentQuestionId, currentQuestionText, notes, saveNotes, pulseAnim]);

  // Update note
  const handleUpdateNote = useCallback(() => {
    if (!editingNote || !newNoteText.trim()) return;

    const updatedNotes = notes.map(note =>
      note.id === editingNote.id
        ? { ...note, text: newNoteText.trim(), importance: newNoteImportance, updatedAt: Date.now() }
        : note
    );
    setNotes(updatedNotes);
    saveNotes(updatedNotes);

    setEditingNote(null);
    setNewNoteText('');
    setNewNoteImportance('normal');
    setShowAddModal(false);
  }, [editingNote, newNoteText, newNoteImportance, notes, saveNotes]);

  // Delete note
  const handleDeleteNote = useCallback((noteId: string) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('inspection.deleteNoteConfirm', 'Delete this note?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            const updatedNotes = notes.filter(note => note.id !== noteId);
            setNotes(updatedNotes);
            saveNotes(updatedNotes);
          },
        },
      ]
    );
  }, [notes, saveNotes, t]);

  // Edit note
  const handleEditNote = useCallback((note: QuickNote) => {
    setEditingNote(note);
    setNewNoteText(note.text);
    setNewNoteImportance(note.importance);
    setShowListModal(false);
    setShowAddModal(true);
  }, []);

  // Export notes
  const handleExportNotes = useCallback(() => {
    const exportText = notes.map(note => {
      const importance = note.importance === 'important' ? '[IMPORTANT] ' : note.importance === 'info' ? '[INFO] ' : '';
      const question = note.questionText ? `\nQuestion: ${note.questionText}` : '';
      return `${importance}${note.text}${question}`;
    }).join('\n\n---\n\n');

    Alert.alert(
      t('inspection.notesExport', 'Notes Export'),
      exportText || t('inspection.noNotes', 'No notes to export'),
      [{ text: 'OK' }]
    );
  }, [notes, t]);

  // Get filtered notes
  const filteredNotes = filterImportance === 'all'
    ? notes
    : notes.filter(note => note.importance === filterImportance);

  // Count by importance
  const importanceCounts = {
    important: notes.filter(n => n.importance === 'important').length,
    normal: notes.filter(n => n.importance === 'normal').length,
    info: notes.filter(n => n.importance === 'info').length,
  };

  // Render importance selector
  const renderImportanceSelector = () => (
    <View style={styles.importanceSelector}>
      {(['normal', 'important', 'info'] as NoteImportance[]).map(imp => (
        <TouchableOpacity
          key={imp}
          style={[
            styles.importanceOption,
            { backgroundColor: IMPORTANCE_COLORS[imp].background },
            newNoteImportance === imp && styles.importanceOptionSelected,
            newNoteImportance === imp && { borderColor: IMPORTANCE_COLORS[imp].border },
          ]}
          onPress={() => setNewNoteImportance(imp)}
        >
          <Text style={[styles.importanceIcon, { color: IMPORTANCE_COLORS[imp].icon }]}>
            {imp === 'important' ? '!' : imp === 'info' ? 'i' : '-'}
          </Text>
          <Text style={[styles.importanceLabel, { color: IMPORTANCE_COLORS[imp].text }]}>
            {t(`inspection.note_${imp}`, imp.charAt(0).toUpperCase() + imp.slice(1))}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (!showFloatingButton) return null;

  return (
    <>
      {/* Floating Button */}
      <Animated.View
        style={[
          styles.floatingButton,
          {
            transform: [
              { translateX: position.x },
              { translateY: position.y },
              { scale: pulseAnim },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Quick action buttons when expanded */}
        {isExpanded && (
          <Animated.View
            style={[
              styles.quickActions,
              {
                transform: [{ scale: expandAnim }],
                opacity: expandAnim,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: IMPORTANCE_COLORS.normal.background }]}
              onPress={() => {
                setNewNoteImportance('normal');
                setShowAddModal(true);
                setIsExpanded(false);
              }}
            >
              <Text style={styles.quickActionIcon}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#E8F5E9' }]}
              onPress={() => {
                setShowListModal(true);
                setIsExpanded(false);
              }}
            >
              <Text style={styles.quickActionIcon}>&#x1F4CB;</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Main button */}
        <TouchableOpacity
          style={[
            styles.mainButton,
            notes.length > 0 && styles.mainButtonWithNotes,
            importanceCounts.important > 0 && styles.mainButtonImportant,
          ]}
          onPress={toggleExpanded}
          onLongPress={() => {
            setShowAddModal(true);
            Vibration.vibrate(50);
          }}
        >
          <Text style={styles.mainButtonIcon}>&#x1F4DD;</Text>
          {notes.length > 0 && (
            <View style={[
              styles.badge,
              importanceCounts.important > 0 && styles.badgeImportant,
            ]}>
              <Text style={styles.badgeText}>{notes.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Add/Edit Note Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddModal(false);
          setEditingNote(null);
          setNewNoteText('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingNote
                  ? t('inspection.editNote', 'Edit Note')
                  : t('inspection.addNote', 'Add Quick Note')}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowAddModal(false);
                  setEditingNote(null);
                  setNewNoteText('');
                }}
              >
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            {/* Question context */}
            {currentQuestionText && !editingNote && (
              <View style={styles.questionContext}>
                <Text style={styles.questionContextLabel}>
                  {t('inspection.forQuestion', 'For question')}:
                </Text>
                <Text style={styles.questionContextText} numberOfLines={2}>
                  {currentQuestionText}
                </Text>
              </View>
            )}

            {/* Importance selector */}
            {renderImportanceSelector()}

            {/* Note input */}
            <TextInput
              style={[
                styles.noteInput,
                { borderColor: IMPORTANCE_COLORS[newNoteImportance].border },
              ]}
              value={newNoteText}
              onChangeText={setNewNoteText}
              placeholder={t('inspection.noteText', 'Enter your note...')}
              multiline
              numberOfLines={4}
              autoFocus
            />

            {/* Action buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  setEditingNote(null);
                  setNewNoteText('');
                }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: IMPORTANCE_COLORS[newNoteImportance].border },
                  !newNoteText.trim() && styles.buttonDisabled,
                ]}
                onPress={editingNote ? handleUpdateNote : handleAddNote}
                disabled={!newNoteText.trim()}
              >
                <Text style={styles.saveButtonText}>
                  {editingNote ? t('common.save', 'Save') : t('common.add', 'Add')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Notes List Modal */}
      <Modal
        visible={showListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowListModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.listModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('inspection.allNotes', 'All Notes')} ({notes.length})
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowListModal(false)}
              >
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            {/* Filter chips */}
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, filterImportance === 'all' && styles.filterChipActive]}
                onPress={() => setFilterImportance('all')}
              >
                <Text style={[styles.filterChipText, filterImportance === 'all' && styles.filterChipTextActive]}>
                  {t('common.all', 'All')}
                </Text>
              </TouchableOpacity>
              {(['important', 'normal', 'info'] as NoteImportance[]).map(imp => (
                <TouchableOpacity
                  key={imp}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filterImportance === imp ? IMPORTANCE_COLORS[imp].border : IMPORTANCE_COLORS[imp].background },
                  ]}
                  onPress={() => setFilterImportance(imp)}
                >
                  <Text style={[
                    styles.filterChipText,
                    { color: filterImportance === imp ? '#fff' : IMPORTANCE_COLORS[imp].text },
                  ]}>
                    {importanceCounts[imp]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes list */}
            <ScrollView style={styles.notesList}>
              {filteredNotes.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    {t('inspection.noNotes', 'No notes yet')}
                  </Text>
                </View>
              ) : (
                filteredNotes.map(note => (
                  <View
                    key={note.id}
                    style={[
                      styles.noteCard,
                      { backgroundColor: IMPORTANCE_COLORS[note.importance].background },
                      { borderLeftColor: IMPORTANCE_COLORS[note.importance].border },
                    ]}
                  >
                    <View style={styles.noteHeader}>
                      <View style={[
                        styles.noteBadge,
                        { backgroundColor: IMPORTANCE_COLORS[note.importance].border },
                      ]}>
                        <Text style={styles.noteBadgeText}>
                          {note.importance === 'important' ? '!' : note.importance === 'info' ? 'i' : '-'}
                        </Text>
                      </View>
                      <View style={styles.noteActions}>
                        <TouchableOpacity
                          style={styles.noteActionButton}
                          onPress={() => handleEditNote(note)}
                        >
                          <Text style={styles.noteActionText}>&#x270E;</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.noteActionButton}
                          onPress={() => handleDeleteNote(note.id)}
                        >
                          <Text style={[styles.noteActionText, { color: '#EF5350' }]}>&#x1F5D1;</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[styles.noteText, { color: IMPORTANCE_COLORS[note.importance].text }]}>
                      {note.text}
                    </Text>
                    {note.questionText && (
                      <View style={styles.noteQuestion}>
                        <Text style={styles.noteQuestionLabel}>Q:</Text>
                        <Text style={styles.noteQuestionText} numberOfLines={1}>
                          {note.questionText}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.noteTime}>
                      {new Date(note.createdAt).toLocaleTimeString()}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Footer actions */}
            <View style={styles.listFooter}>
              <TouchableOpacity
                style={styles.footerButton}
                onPress={() => {
                  setShowListModal(false);
                  setShowAddModal(true);
                }}
              >
                <Text style={styles.footerButtonText}>+ {t('inspection.addNote', 'Add Note')}</Text>
              </TouchableOpacity>
              {notes.length > 0 && (
                <TouchableOpacity
                  style={[styles.footerButton, styles.footerButtonSecondary]}
                  onPress={handleExportNotes}
                >
                  <Text style={[styles.footerButtonText, styles.footerButtonTextSecondary]}>
                    {t('inspection.exportNotes', 'Export')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    zIndex: 1000,
  },
  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFDE7',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: '#FDD835',
  },
  mainButtonWithNotes: {
    borderWidth: 3,
  },
  mainButtonImportant: {
    borderColor: '#EF5350',
    backgroundColor: '#FFEBEE',
  },
  mainButtonIcon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FDD835',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeImportant: {
    backgroundColor: '#EF5350',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  quickActions: {
    position: 'absolute',
    bottom: 65,
    alignItems: 'center',
    gap: 8,
  },
  quickActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  quickActionIcon: {
    fontSize: 18,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  listModalContent: {
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#616161',
  },
  questionContext: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  questionContextLabel: {
    fontSize: 11,
    color: '#616161',
    marginBottom: 4,
  },
  questionContextText: {
    fontSize: 13,
    color: '#212121',
  },
  importanceSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  importanceOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  importanceOptionSelected: {
    borderWidth: 2,
  },
  importanceIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  importanceLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
    color: '#212121',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#616161',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // List modal styles
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  filterChipActive: {
    backgroundColor: '#1976D2',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  notesList: {
    flex: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  noteCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  noteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  noteActionButton: {
    padding: 4,
  },
  noteActionText: {
    fontSize: 16,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  noteQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  noteQuestionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#616161',
  },
  noteQuestionText: {
    fontSize: 10,
    color: '#616161',
    flex: 1,
  },
  noteTime: {
    fontSize: 10,
    color: '#9E9E9E',
    textAlign: 'right',
  },
  listFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerButton: {
    flex: 1,
    backgroundColor: '#1976D2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  footerButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1976D2',
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  footerButtonTextSecondary: {
    color: '#1976D2',
  },
});

export default QuickNotes;
