import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { logWithTimestamp } from './utils/logging';

// Clear all specific localStorage flags before app mounts with debug logging
const allKeys = Object.keys(localStorage);
logWithTimestamp('index', `All localStorage keys before clear: ${allKeys.join(', ')}`);
const clearedKeys: string[] = [];
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('idsInitialized_') || key === 'idsInitialized_all') {
    clearedKeys.push(key);
    localStorage.removeItem(key);
  }
});
const allKeysAfter = Object.keys(localStorage);
logWithTimestamp('index', `All localStorage keys after clear: ${allKeysAfter.join(', ')}`);
if (clearedKeys.length > 0) {
  logWithTimestamp('index', `LocalStorage cleared keys: ${clearedKeys.join(', ')}`);
} else {
  logWithTimestamp('index', 'LocalStorage cleared for all IDs initialization (no keys found)');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('❌ Root element not found');
}
ReactDOM.render(<App />, rootElement); // Match your provided file