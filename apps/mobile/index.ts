// Must be the first import in the app: react-native-gesture-handler installs
// its native event listeners at module-load time, before anything else touches
// the touch responder system.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
