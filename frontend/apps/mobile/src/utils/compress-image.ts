import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.65;

/**
 * Compress and resize an image before upload.
 * Returns the URI of the compressed image.
 */
export async function compressImage(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: JPEG_QUALITY, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch (err) {
    // If manipulation fails, return original URI as fallback
    if (__DEV__) console.warn('Image compression failed, using original:', err);
    return uri;
  }
}
