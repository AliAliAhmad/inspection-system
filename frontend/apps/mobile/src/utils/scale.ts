/**
 * Responsive scaling utility for the Inspection System mobile app.
 *
 * Baseline: 375px wide × 812px tall (iPhone 6/7/8 design reference)
 * Wrap StyleSheet values with these functions to scale UI proportionally
 * across all Android/iOS screen sizes.
 *
 * Usage:
 *   import { scale, vscale, mscale, fontScale } from '../../utils/scale';
 *
 *   const styles = StyleSheet.create({
 *     container: { padding: scale(16), marginTop: vscale(24) },
 *     title:     { fontSize: fontScale(18), fontWeight: '600' },
 *     card:      { borderRadius: mscale(12) },
 *   });
 */

import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

const BASE_W = 375;
const BASE_H = 812;

/**
 * Horizontal scale — proportional to screen width.
 * Use for: padding, margin, width, gap, icon sizes
 */
export function scale(size: number): number {
  return Math.round((size / BASE_W) * W);
}

/**
 * Vertical scale — proportional to screen height.
 * Use for: height, vertical padding/margin
 */
export function vscale(size: number): number {
  return Math.round((size / BASE_H) * H);
}

/**
 * Moderate scale — scales less aggressively (factor 0 = none, 1 = full).
 * Default factor 0.5 gives gentle scaling suitable for border radius, shadows.
 */
export function mscale(size: number, factor = 0.5): number {
  return Math.round(size + (scale(size) - size) * factor);
}

/**
 * Font scale — uses moderate scaling with factor 0.4 for readability.
 * Use for ALL fontSize values.
 */
export function fontScale(size: number): number {
  return mscale(size, 0.4);
}

/** Raw screen dimensions for custom calculations */
export const screenDimensions = {
  width: W,
  height: H,
};
