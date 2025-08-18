import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { logWithTimestamp } from './utils/logging';

const F = 'index';
logWithTimestamp(F, 'All localStorage keys at startup:', Object.keys(localStorage));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('❌ Root element not found');
}
ReactDOM.render(<App />, rootElement);
