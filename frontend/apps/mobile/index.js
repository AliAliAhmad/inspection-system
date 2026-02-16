import { Platform } from 'react-native';
if (Platform.OS !== 'web') {
  require('react-native-reanimated');
}
import 'intl-pluralrules';
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
