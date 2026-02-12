import { useEffect, useRef, useCallback } from 'react';
import { Vibration } from 'react-native';

interface ShakeDetectorProps {
  onShake: () => void;
  enabled: boolean;
  threshold?: number;
  timeout?: number;
}

/**
 * ShakeDetector - detects phone shake gesture.
 * Uses Accelerometer to detect sudden movement.
 * Falls back to manual button if sensor not available.
 */
export default function ShakeDetector({
  onShake,
  enabled,
  threshold = 3.0,
  timeout = 1000,
}: ShakeDetectorProps) {
  const lastShake = useRef<number>(0);

  const handleShake = useCallback(() => {
    const now = Date.now();
    if (now - lastShake.current < timeout) return;
    lastShake.current = now;
    Vibration.vibrate([0, 100, 50, 100]);
    onShake();
  }, [onShake, timeout]);

  useEffect(() => {
    if (!enabled) return;

    // Expo Sensors - try to use accelerometer
    let subscription: { remove: () => void } | null = null;

    const setupAccelerometer = async () => {
      try {
        const { Accelerometer } = require('expo-sensors');
        Accelerometer.setUpdateInterval(100);

        let lastX = 0;
        let lastY = 0;
        let lastZ = 0;

        subscription = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
          const deltaX = Math.abs(x - lastX);
          const deltaY = Math.abs(y - lastY);
          const deltaZ = Math.abs(z - lastZ);

          if (deltaX + deltaY + deltaZ > threshold) {
            handleShake();
          }

          lastX = x;
          lastY = y;
          lastZ = z;
        });
      } catch {
        // Sensor not available - shake detection disabled
        // User can still use manual buttons
        console.log('Accelerometer not available for shake detection');
      }
    };

    setupAccelerometer();

    return () => {
      subscription?.remove();
    };
  }, [enabled, threshold, handleShake]);

  return null; // No UI - this is a behavior-only component
}
