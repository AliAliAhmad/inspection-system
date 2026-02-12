import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Dimensions,
} from 'react-native';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface FABAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
}

interface FloatingActionButtonProps {
  actions: FABAction[];
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  mainIcon?: string;
  mainColor?: string;
}

export default function FloatingActionButton({
  actions,
  position = 'bottom-right',
  mainIcon = '⚡',
  mainColor = '#1677ff',
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const animValue = useRef(new Animated.Value(0)).current;
  const rotateValue = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    Vibration.vibrate(30);
    const toValue = isOpen ? 0 : 1;

    Animated.parallel([
      Animated.spring(animValue, {
        toValue,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateValue, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    setIsOpen(!isOpen);
  };

  const handleAction = (action: FABAction) => {
    Vibration.vibrate(30);
    toggleMenu();
    action.onPress();
  };

  const rotation = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const positionStyle = {
    'bottom-right': { right: 20, alignItems: 'flex-end' as const },
    'bottom-left': { left: 20, alignItems: 'flex-start' as const },
    'bottom-center': { left: SCREEN_WIDTH / 2 - 32, alignItems: 'center' as const },
  }[position];

  return (
    <View style={[styles.container, positionStyle]} pointerEvents="box-none">
      {/* Action items */}
      {actions.map((action, index) => {
        const translateY = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -(70 * (index + 1))],
        });
        const scale = animValue.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 0.5, 1],
        });
        const opacity = animValue;

        return (
          <Animated.View
            key={action.id}
            style={[
              styles.actionContainer,
              {
                transform: [{ translateY }, { scale }],
                opacity,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.actionLabelContainer}
              onPress={() => handleAction(action)}
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: action.color }]}
              onPress={() => handleAction(action)}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      {/* Main FAB */}
      <TouchableOpacity
        style={[styles.mainButton, { backgroundColor: mainColor }]}
        onPress={toggleMenu}
        activeOpacity={0.8}
      >
        <Animated.Text
          style={[styles.mainIcon, { transform: [{ rotate: rotation }] }]}
        >
          {isOpen ? '✕' : mainIcon}
        </Animated.Text>
      </TouchableOpacity>

      {/* Backdrop */}
      {isOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={toggleMenu}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    zIndex: 999,
  },
  mainButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mainIcon: {
    fontSize: 28,
    color: '#fff',
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginLeft: 8,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabelContainer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  backdrop: {
    position: 'absolute',
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -100,
    zIndex: -1,
  },
});
