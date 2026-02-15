/**
 * useLocation Hook
 * Auto GPS location tagging for inspections
 * Provides current coordinates, address, and auto-tagging functionality
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';

// Types for location data
export interface LocationCoords {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface LocationData {
  coords: LocationCoords;
  timestamp: number;
  address?: string;
}

export interface UseLocationOptions {
  /** Enable continuous tracking (default: false) */
  enableTracking?: boolean;
  /** Auto-request permission on mount (default: true) */
  autoRequest?: boolean;
  /** High accuracy mode - uses GPS (default: true) */
  highAccuracy?: boolean;
  /** Update interval in ms for tracking (default: 10000) */
  trackingInterval?: number;
  /** Distance filter in meters for tracking updates (default: 10) */
  distanceFilter?: number;
}

export interface UseLocationReturn {
  /** Current location data */
  location: LocationData | null;
  /** Whether location is being fetched */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether permission is granted */
  hasPermission: boolean;
  /** Manually request current location */
  getCurrentLocation: () => Promise<LocationData | null>;
  /** Request location permission */
  requestPermission: () => Promise<boolean>;
  /** Open device settings for location */
  openSettings: () => void;
  /** Whether tracking is active */
  isTracking: boolean;
  /** Start continuous tracking */
  startTracking: () => void;
  /** Stop continuous tracking */
  stopTracking: () => void;
}

let Location: any = null;

// Try to import expo-location
try {
  Location = require('expo-location');
} catch {
  // expo-location not installed
}

export function useLocation(options: UseLocationOptions = {}): UseLocationReturn {
  const {
    enableTracking = false,
    autoRequest = true,
    highAccuracy = true,
    trackingInterval = 10000,
    distanceFilter = 10,
  } = options;

  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const subscriptionRef = useRef<any>(null);
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!Location) {
      setError('Location services not available');
      return false;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setHasPermission(granted);

      if (!granted) {
        setError('Location permission denied');
      } else {
        setError(null);
      }

      return granted;
    } catch (err) {
      setError('Failed to request location permission');
      return false;
    }
  }, []);

  const reverseGeocode = useCallback(async (coords: LocationCoords): Promise<string | undefined> => {
    if (!Location) return undefined;

    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

      if (results && results.length > 0) {
        const place = results[0];
        const parts = [
          place.name,
          place.street,
          place.city,
          place.region,
          place.country,
        ].filter(Boolean);
        return parts.join(', ');
      }
    } catch {
      // Geocoding failed silently
    }
    return undefined;
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<LocationData | null> => {
    if (!Location) {
      setError('Location services not available');
      return null;
    }

    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: highAccuracy
          ? Location.Accuracy.High
          : Location.Accuracy.Balanced,
      });

      const address = await reverseGeocode(loc.coords);

      const locationData: LocationData = {
        coords: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude,
          accuracy: loc.coords.accuracy,
          heading: loc.coords.heading,
          speed: loc.coords.speed,
        },
        timestamp: loc.timestamp,
        address,
      };

      setLocation(locationData);
      setIsLoading(false);
      return locationData;
    } catch (err: any) {
      const message = err?.message || 'Failed to get location';
      setError(message);
      setIsLoading(false);
      return null;
    }
  }, [hasPermission, highAccuracy, requestPermission, reverseGeocode]);

  const startTracking = useCallback(() => {
    if (!Location || isTracking) return;

    setIsTracking(true);

    // Use interval-based polling for compatibility
    getCurrentLocation();
    trackingIntervalRef.current = setInterval(() => {
      getCurrentLocation();
    }, trackingInterval);
  }, [getCurrentLocation, isTracking, trackingInterval]);

  const stopTracking = useCallback(() => {
    setIsTracking(false);

    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }

    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  }, []);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  // Auto-request permission and get initial location
  useEffect(() => {
    if (autoRequest && Location) {
      requestPermission().then((granted) => {
        if (granted) {
          getCurrentLocation();
        }
      });
    }
  }, []);

  // Auto-start tracking if enabled
  useEffect(() => {
    if (enableTracking && hasPermission) {
      startTracking();
    }

    return () => {
      stopTracking();
    };
  }, [enableTracking, hasPermission]);

  return {
    location,
    isLoading,
    error,
    hasPermission,
    getCurrentLocation,
    requestPermission,
    openSettings,
    isTracking,
    startTracking,
    stopTracking,
  };
}

export default useLocation;
