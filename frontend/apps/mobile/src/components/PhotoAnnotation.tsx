import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import Svg, {
  Path,
  Circle,
  Rect,
  G,
  Text as SvgText,
} from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Annotation colors
export const ANNOTATION_COLORS = {
  red: '#f5222d',     // Defects
  yellow: '#faad14',  // Warnings
  green: '#52c41a',   // OK areas
  blue: '#1677ff',    // Information
};

// Brush sizes
export const BRUSH_SIZES = {
  thin: 2,
  medium: 4,
  thick: 8,
};

// Tool types
export type AnnotationTool = 'pen' | 'circle' | 'rectangle' | 'text' | 'eraser';
export type AnnotationColor = keyof typeof ANNOTATION_COLORS;
export type BrushSize = keyof typeof BRUSH_SIZES;

// Annotation element types
interface BaseAnnotation {
  id: string;
  color: string;
  strokeWidth: number;
}

interface PathAnnotation extends BaseAnnotation {
  type: 'path';
  path: string;
}

interface CircleAnnotation extends BaseAnnotation {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
}

interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type Annotation = PathAnnotation | CircleAnnotation | RectAnnotation | TextAnnotation;

export interface PhotoAnnotationProps {
  imageUri: string;
  onSave: (annotations: Annotation[], annotatedImageUri?: string) => void;
  onCancel: () => void;
  initialAnnotations?: Annotation[];
  isLoading?: boolean;
}

export function PhotoAnnotation({
  imageUri,
  onSave,
  onCancel,
  initialAnnotations = [],
  isLoading = false,
}: PhotoAnnotationProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  // State
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [selectedTool, setSelectedTool] = useState<AnnotationTool>('pen');
  const [selectedColor, setSelectedColor] = useState<AnnotationColor>('red');
  const [brushSize, setBrushSize] = useState<BrushSize>('medium');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBrushPicker, setShowBrushPicker] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  // Refs for drawing
  const currentPath = useRef<string[]>([]);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  // Shared values for pinch-to-zoom
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Calculate image dimensions to fit container while maintaining aspect ratio
  const displayDimensions = useMemo(() => {
    if (!imageSize || !containerSize) return { width: 0, height: 0, offsetX: 0, offsetY: 0 };

    const containerAspect = containerSize.width / containerSize.height;
    const imageAspect = imageSize.width / imageSize.height;

    let displayWidth: number;
    let displayHeight: number;

    if (imageAspect > containerAspect) {
      // Image is wider than container
      displayWidth = containerSize.width;
      displayHeight = containerSize.width / imageAspect;
    } else {
      // Image is taller than container
      displayHeight = containerSize.height;
      displayWidth = containerSize.height * imageAspect;
    }

    const offsetX = (containerSize.width - displayWidth) / 2;
    const offsetY = (containerSize.height - displayHeight) / 2;

    return { width: displayWidth, height: displayHeight, offsetX, offsetY };
  }, [imageSize, containerSize]);

  // Generate unique ID for annotations
  const generateId = useCallback(() => {
    return `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Save state for undo
  const saveForUndo = useCallback(() => {
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
  }, [annotations]);

  // Undo action
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastState = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, annotations]);
    setAnnotations(lastState);
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, annotations]);

  // Redo action
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, annotations]);
    setAnnotations(nextState);
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack, annotations]);

  // Clear all annotations
  const handleClearAll = useCallback(() => {
    if (annotations.length === 0) return;
    saveForUndo();
    setAnnotations([]);
  }, [annotations, saveForUndo]);

  // Convert touch coordinates to image coordinates
  const toImageCoords = useCallback((touchX: number, touchY: number) => {
    const { offsetX, offsetY, width, height } = displayDimensions;
    const x = (touchX - offsetX) / (scale.value);
    const y = (touchY - offsetY) / (scale.value);
    return { x, y };
  }, [displayDimensions, scale]);

  // Add path point
  const addPathPoint = useCallback((x: number, y: number) => {
    if (currentPath.current.length === 0) {
      currentPath.current.push(`M ${x} ${y}`);
    } else {
      currentPath.current.push(`L ${x} ${y}`);
    }
  }, []);

  // Complete path
  const completePath = useCallback(() => {
    if (currentPath.current.length > 1) {
      saveForUndo();
      const newAnnotation: PathAnnotation = {
        id: generateId(),
        type: 'path',
        path: currentPath.current.join(' '),
        color: ANNOTATION_COLORS[selectedColor],
        strokeWidth: BRUSH_SIZES[brushSize],
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    }
    currentPath.current = [];
  }, [selectedColor, brushSize, generateId, saveForUndo]);

  // Complete shape
  const completeShape = useCallback((endX: number, endY: number) => {
    if (!startPoint.current) return;

    const { x: sx, y: sy } = startPoint.current;
    saveForUndo();

    if (selectedTool === 'circle') {
      const cx = (sx + endX) / 2;
      const cy = (sy + endY) / 2;
      const r = Math.sqrt(Math.pow(endX - sx, 2) + Math.pow(endY - sy, 2)) / 2;

      const newAnnotation: CircleAnnotation = {
        id: generateId(),
        type: 'circle',
        cx,
        cy,
        r,
        color: ANNOTATION_COLORS[selectedColor],
        strokeWidth: BRUSH_SIZES[brushSize],
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    } else if (selectedTool === 'rectangle') {
      const x = Math.min(sx, endX);
      const y = Math.min(sy, endY);
      const width = Math.abs(endX - sx);
      const height = Math.abs(endY - sy);

      const newAnnotation: RectAnnotation = {
        id: generateId(),
        type: 'rect',
        x,
        y,
        width,
        height,
        color: ANNOTATION_COLORS[selectedColor],
        strokeWidth: BRUSH_SIZES[brushSize],
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    }

    startPoint.current = null;
  }, [selectedTool, selectedColor, brushSize, generateId, saveForUndo]);

  // Add text annotation
  const addTextAnnotation = useCallback((x: number, y: number, text: string) => {
    if (!text.trim()) return;

    saveForUndo();
    const newAnnotation: TextAnnotation = {
      id: generateId(),
      type: 'text',
      x,
      y,
      text: text.trim(),
      color: ANNOTATION_COLORS[selectedColor],
      strokeWidth: BRUSH_SIZES[brushSize],
      fontSize: BRUSH_SIZES[brushSize] * 4 + 8,
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    setPendingTextPosition(null);
    setTextInput('');
  }, [selectedColor, brushSize, generateId, saveForUndo]);

  // Handle drawing start
  const handleDrawStart = useCallback((x: number, y: number) => {
    const coords = toImageCoords(x, y);

    if (selectedTool === 'pen') {
      currentPath.current = [];
      addPathPoint(coords.x, coords.y);
    } else if (selectedTool === 'circle' || selectedTool === 'rectangle') {
      startPoint.current = coords;
    } else if (selectedTool === 'text') {
      setPendingTextPosition(coords);
    } else if (selectedTool === 'eraser') {
      // Find and remove annotation at this point
      // Simple implementation - removes annotations near touch point
      const threshold = 20;
      setAnnotations(prev => prev.filter(ann => {
        if (ann.type === 'circle') {
          const dist = Math.sqrt(Math.pow(coords.x - ann.cx, 2) + Math.pow(coords.y - ann.cy, 2));
          return dist > ann.r + threshold;
        } else if (ann.type === 'rect') {
          return !(coords.x >= ann.x - threshold &&
                   coords.x <= ann.x + ann.width + threshold &&
                   coords.y >= ann.y - threshold &&
                   coords.y <= ann.y + ann.height + threshold);
        } else if (ann.type === 'text') {
          const dist = Math.sqrt(Math.pow(coords.x - ann.x, 2) + Math.pow(coords.y - ann.y, 2));
          return dist > threshold * 2;
        }
        return true; // Keep paths for now (more complex to detect)
      }));
    }
  }, [selectedTool, toImageCoords, addPathPoint]);

  // Handle drawing move
  const handleDrawMove = useCallback((x: number, y: number) => {
    const coords = toImageCoords(x, y);

    if (selectedTool === 'pen') {
      addPathPoint(coords.x, coords.y);
      // Force re-render for live drawing
      setAnnotations(prev => [...prev]);
    }
  }, [selectedTool, toImageCoords, addPathPoint]);

  // Handle drawing end
  const handleDrawEnd = useCallback((x: number, y: number) => {
    const coords = toImageCoords(x, y);

    if (selectedTool === 'pen') {
      completePath();
    } else if (selectedTool === 'circle' || selectedTool === 'rectangle') {
      completeShape(coords.x, coords.y);
    }
  }, [selectedTool, toImageCoords, completePath, completeShape]);

  // Pan gesture for drawing
  const panGesture = Gesture.Pan()
    .onStart((e) => {
      if (scale.value > 1) {
        // If zoomed in, allow panning the image
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      } else {
        runOnJS(handleDrawStart)(e.x, e.y);
      }
    })
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        runOnJS(handleDrawMove)(e.x, e.y);
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1) {
        runOnJS(handleDrawEnd)(e.x, e.y);
      }
    });

  // Pinch gesture for zoom
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 4);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  // Double tap to reset zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      } else {
        scale.value = withSpring(2);
      }
    });

  // Combine gestures
  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(doubleTapGesture, panGesture)
  );

  // Animated style for zoom/pan
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Handle save
  const handleSave = useCallback(() => {
    onSave(annotations, imageUri);
  }, [annotations, imageUri, onSave]);

  // Get image size on load
  const handleImageLoad = useCallback(() => {
    Image.getSize(imageUri, (width, height) => {
      setImageSize({ width, height });
    }, (error) => {
      console.error('Failed to get image size:', error);
      // Use default size
      setImageSize({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.6 });
    });
  }, [imageUri]);

  // Handle container layout
  const handleContainerLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  // Render current drawing path (live preview)
  const renderCurrentPath = () => {
    if (currentPath.current.length === 0) return null;
    return (
      <Path
        d={currentPath.current.join(' ')}
        stroke={ANNOTATION_COLORS[selectedColor]}
        strokeWidth={BRUSH_SIZES[brushSize]}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  };

  // Render all annotations
  const renderAnnotations = () => {
    return annotations.map((ann) => {
      switch (ann.type) {
        case 'path':
          return (
            <Path
              key={ann.id}
              d={ann.path}
              stroke={ann.color}
              strokeWidth={ann.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        case 'circle':
          return (
            <Circle
              key={ann.id}
              cx={ann.cx}
              cy={ann.cy}
              r={ann.r}
              stroke={ann.color}
              strokeWidth={ann.strokeWidth}
              fill="none"
            />
          );
        case 'rect':
          return (
            <Rect
              key={ann.id}
              x={ann.x}
              y={ann.y}
              width={ann.width}
              height={ann.height}
              stroke={ann.color}
              strokeWidth={ann.strokeWidth}
              fill="none"
            />
          );
        case 'text':
          return (
            <SvgText
              key={ann.id}
              x={ann.x}
              y={ann.y}
              fill={ann.color}
              fontSize={ann.fontSize}
              fontWeight="bold"
            >
              {ann.text}
            </SvgText>
          );
        default:
          return null;
      }
    });
  };

  // Tool button component
  const ToolButton = ({ tool, icon, label }: { tool: AnnotationTool; icon: string; label: string }) => (
    <TouchableOpacity
      style={[
        styles.toolButton,
        selectedTool === tool && styles.toolButtonActive,
      ]}
      onPress={() => setSelectedTool(tool)}
    >
      <Text style={[
        styles.toolIcon,
        selectedTool === tool && styles.toolIconActive,
      ]}>
        {icon}
      </Text>
      <Text style={[
        styles.toolLabel,
        selectedTool === tool && styles.toolLabelActive,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={onCancel}>
          <Text style={styles.headerButtonText}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {t('annotation.title', 'Annotate Photo')}
        </Text>

        <TouchableOpacity
          style={[styles.headerButton, styles.saveButton]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {t('common.save', 'Save')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Action buttons (Undo/Redo/Clear) */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionButton, undoStack.length === 0 && styles.actionButtonDisabled]}
          onPress={handleUndo}
          disabled={undoStack.length === 0}
        >
          <Text style={styles.actionIcon}>↩</Text>
          <Text style={styles.actionLabel}>{t('annotation.undo', 'Undo')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, redoStack.length === 0 && styles.actionButtonDisabled]}
          onPress={handleRedo}
          disabled={redoStack.length === 0}
        >
          <Text style={styles.actionIcon}>↪</Text>
          <Text style={styles.actionLabel}>{t('annotation.redo', 'Redo')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, annotations.length === 0 && styles.actionButtonDisabled]}
          onPress={handleClearAll}
          disabled={annotations.length === 0}
        >
          <Text style={styles.actionIcon}>🗑</Text>
          <Text style={styles.actionLabel}>{t('annotation.clear', 'Clear')}</Text>
        </TouchableOpacity>
      </View>

      {/* Image canvas area */}
      <View style={styles.canvasContainer} onLayout={handleContainerLayout}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.canvas, animatedStyle]}>
            <Image
              source={{ uri: imageUri }}
              style={[
                styles.image,
                {
                  width: displayDimensions.width,
                  height: displayDimensions.height,
                },
              ]}
              resizeMode="contain"
              onLoad={handleImageLoad}
            />

            {/* SVG overlay for annotations */}
            <Svg
              style={[
                StyleSheet.absoluteFill,
                {
                  marginLeft: displayDimensions.offsetX,
                  marginTop: displayDimensions.offsetY,
                  width: displayDimensions.width,
                  height: displayDimensions.height,
                },
              ]}
              viewBox={`0 0 ${displayDimensions.width} ${displayDimensions.height}`}
            >
              <G>
                {renderAnnotations()}
                {renderCurrentPath()}
              </G>
            </Svg>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Text input modal */}
      {pendingTextPosition && (
        <View style={styles.textInputOverlay}>
          <View style={styles.textInputModal}>
            <Text style={styles.textInputTitle}>
              {t('annotation.enterText', 'Enter Label')}
            </Text>
            <View style={styles.textInputContainer}>
              <View style={[styles.textInputField, { borderColor: ANNOTATION_COLORS[selectedColor] }]}>
                <Text style={styles.textInputPlaceholder}>
                  {textInput || t('annotation.textPlaceholder', 'Type here...')}
                </Text>
              </View>
            </View>
            <View style={styles.quickTextButtons}>
              {[
                { en: 'DEFECT', ar: 'عيب' },
                { en: 'WARNING', ar: 'تحذير' },
                { en: 'OK', ar: 'جيد' },
                { en: 'CHECK', ar: 'فحص' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.en}
                  style={[styles.quickTextButton, { borderColor: ANNOTATION_COLORS[selectedColor] }]}
                  onPress={() => {
                    addTextAnnotation(
                      pendingTextPosition.x,
                      pendingTextPosition.y,
                      isArabic ? item.ar : item.en
                    );
                  }}
                >
                  <Text style={[styles.quickTextButtonText, { color: ANNOTATION_COLORS[selectedColor] }]}>
                    {isArabic ? item.ar : item.en}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.cancelTextButton}
              onPress={() => setPendingTextPosition(null)}
            >
              <Text style={styles.cancelTextButtonText}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tools palette */}
      <View style={styles.toolsContainer}>
        {/* Tool selection row */}
        <View style={styles.toolsRow}>
          <ToolButton tool="pen" icon="✏️" label={t('annotation.pen', 'Pen')} />
          <ToolButton tool="circle" icon="⭕" label={t('annotation.circle', 'Circle')} />
          <ToolButton tool="rectangle" icon="▢" label={t('annotation.rect', 'Rect')} />
          <ToolButton tool="text" icon="T" label={t('annotation.text', 'Text')} />
          <ToolButton tool="eraser" icon="🧹" label={t('annotation.eraser', 'Eraser')} />
        </View>

        {/* Color and brush size row */}
        <View style={styles.optionsRow}>
          {/* Color picker toggle */}
          <TouchableOpacity
            style={styles.colorPickerToggle}
            onPress={() => {
              setShowColorPicker(!showColorPicker);
              setShowBrushPicker(false);
            }}
          >
            <View style={[styles.colorPreview, { backgroundColor: ANNOTATION_COLORS[selectedColor] }]} />
            <Text style={styles.optionLabel}>{t('annotation.color', 'Color')}</Text>
          </TouchableOpacity>

          {/* Brush size toggle */}
          <TouchableOpacity
            style={styles.brushPickerToggle}
            onPress={() => {
              setShowBrushPicker(!showBrushPicker);
              setShowColorPicker(false);
            }}
          >
            <View style={styles.brushPreview}>
              <View
                style={[
                  styles.brushDot,
                  {
                    width: BRUSH_SIZES[brushSize] * 2 + 4,
                    height: BRUSH_SIZES[brushSize] * 2 + 4,
                    backgroundColor: ANNOTATION_COLORS[selectedColor],
                  },
                ]}
              />
            </View>
            <Text style={styles.optionLabel}>{t('annotation.size', 'Size')}</Text>
          </TouchableOpacity>
        </View>

        {/* Color picker dropdown */}
        {showColorPicker && (
          <View style={styles.colorPicker}>
            {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: ANNOTATION_COLORS[color] },
                  selectedColor === color && styles.colorOptionSelected,
                ]}
                onPress={() => {
                  setSelectedColor(color);
                  setShowColorPicker(false);
                }}
              >
                {selectedColor === color && (
                  <Text style={styles.colorCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Brush size picker dropdown */}
        {showBrushPicker && (
          <View style={styles.brushPicker}>
            {(Object.keys(BRUSH_SIZES) as BrushSize[]).map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.brushOption,
                  brushSize === size && styles.brushOptionSelected,
                ]}
                onPress={() => {
                  setBrushSize(size);
                  setShowBrushPicker(false);
                }}
              >
                <View
                  style={[
                    styles.brushSampleDot,
                    {
                      width: BRUSH_SIZES[size] * 3,
                      height: BRUSH_SIZES[size] * 3,
                      backgroundColor: ANNOTATION_COLORS[selectedColor],
                    },
                  ]}
                />
                <Text style={styles.brushOptionLabel}>
                  {size === 'thin'
                    ? t('annotation.thin', 'Thin')
                    : size === 'medium'
                    ? t('annotation.medium', 'Medium')
                    : t('annotation.thick', 'Thick')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#52c41a',
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  actionButton: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    marginTop: 4,
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    backgroundColor: '#333',
  },
  toolsContainer: {
    backgroundColor: '#1a1a1a',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  toolButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  toolButtonActive: {
    backgroundColor: '#1677ff',
  },
  toolIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  toolIconActive: {
    color: '#fff',
  },
  toolLabel: {
    color: '#999',
    fontSize: 11,
  },
  toolLabelActive: {
    color: '#fff',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 12,
  },
  colorPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
  },
  optionLabel: {
    color: '#fff',
    fontSize: 14,
  },
  brushPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brushPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brushDot: {
    borderRadius: 50,
  },
  colorPicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
    backgroundColor: '#252525',
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  colorCheckmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  brushPicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
    backgroundColor: '#252525',
  },
  brushOption: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  brushOptionSelected: {
    backgroundColor: '#1677ff',
  },
  brushSampleDot: {
    borderRadius: 50,
    marginBottom: 4,
  },
  brushOptionLabel: {
    color: '#fff',
    fontSize: 12,
  },
  textInputOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  textInputModal: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 320,
  },
  textInputTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  textInputContainer: {
    marginBottom: 16,
  },
  textInputField: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    minHeight: 44,
  },
  textInputPlaceholder: {
    color: '#666',
    fontSize: 16,
  },
  quickTextButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  quickTextButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  quickTextButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelTextButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelTextButtonText: {
    color: '#999',
    fontSize: 16,
  },
});

export default PhotoAnnotation;
