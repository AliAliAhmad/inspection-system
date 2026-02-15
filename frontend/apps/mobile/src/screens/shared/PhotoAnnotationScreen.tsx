import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Paths, File as ExpoFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
// Note: react-native-view-shot needs to be added to dependencies to use captureRef
// import { captureRef } from 'react-native-view-shot';
import PhotoAnnotation, { Annotation } from '../../components/PhotoAnnotation';

// Type for the screen params
export interface PhotoAnnotationParams {
  imageUri: string;
  returnScreen?: string;
  returnParams?: Record<string, any>;
  onAnnotationComplete?: (annotatedUri: string, annotations: Annotation[]) => void;
}

type RootStackParamList = {
  PhotoAnnotation: PhotoAnnotationParams;
  [key: string]: any;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'PhotoAnnotation'>;

export default function PhotoAnnotationScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();

  const {
    imageUri,
    returnScreen,
    returnParams,
    onAnnotationComplete,
  } = route.params;

  const [isLoading, setIsLoading] = useState(false);

  // Handle cancel - go back without saving
  const handleCancel = useCallback(() => {
    Alert.alert(
      t('annotation.discardTitle', 'Discard Changes?'),
      t('annotation.discardMessage', 'Are you sure you want to discard your annotations?'),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
        {
          text: t('annotation.discard', 'Discard'),
          style: 'destructive',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]
    );
  }, [navigation, t]);

  // Handle save - save annotated image and return
  const handleSave = useCallback(async (annotations: Annotation[], originalUri?: string) => {
    if (annotations.length === 0) {
      // No annotations - just go back with original image
      if (onAnnotationComplete) {
        onAnnotationComplete(imageUri, []);
      }

      if (returnScreen) {
        navigation.navigate(returnScreen, {
          ...returnParams,
          annotatedImageUri: imageUri,
          annotations: [],
        });
      } else {
        navigation.goBack();
      }
      return;
    }

    setIsLoading(true);

    try {
      // Generate a unique filename for the annotated image
      const timestamp = Date.now();
      const annotatedFileName = `annotated_${timestamp}.png`;
      const metadataFileName = `annotations_${timestamp}.json`;

      // Use new API for file operations (faster, native C++)
      const annotatedFile = new ExpoFile(Paths.cache, annotatedFileName);
      const metadataFile = new ExpoFile(Paths.cache, metadataFileName);

      // Save annotations metadata
      const annotationsJson = JSON.stringify(annotations);
      await metadataFile.write(annotationsJson);

      // Copy original image to annotated file
      const sourceFile = new ExpoFile(imageUri);
      await sourceFile.copy(annotatedFile);

      // Use legacy-compatible path for sharing with other screens
      // Other screens use expo-file-system/legacy which expects this format
      const annotatedFilePath = `${FileSystem.cacheDirectory}${annotatedFileName}`;

      setIsLoading(false);

      // Call the callback if provided
      if (onAnnotationComplete) {
        onAnnotationComplete(annotatedFilePath, annotations);
      }

      // Navigate back or to return screen
      if (returnScreen) {
        navigation.navigate(returnScreen, {
          ...returnParams,
          annotatedImageUri: annotatedFilePath,
          annotations,
        });
      } else {
        // Go back and the previous screen should handle the result
        navigation.goBack();
      }

      // Show success message
      Alert.alert(
        t('annotation.saved', 'Saved'),
        t('annotation.savedMessage', 'Annotations saved successfully'),
        [{ text: t('common.ok', 'OK') }]
      );
    } catch (error) {
      console.error('Failed to save annotated image:', error);
      setIsLoading(false);
      Alert.alert(
        t('common.error', 'Error'),
        t('annotation.saveFailed', 'Failed to save annotations. Please try again.')
      );
    }
  }, [imageUri, navigation, onAnnotationComplete, returnParams, returnScreen, t]);

  return (
    <View style={styles.container}>
      <PhotoAnnotation
        imageUri={imageUri}
        onSave={handleSave}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
