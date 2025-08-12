/**
 * @file src/inject.tsx
 *
 * Injects Gateway payment buttons into third-party websites.
 *
 * This script does two main things:
 * 1. Defines a global `window.PayButton.render()` method to render a single payment button inside a given DOM element.
 * 2. Automatically scans the page on `window.load` for any element with `class="gateway-paybutton"` and renders a button into it
 * using any `data-*` attributes as props, fetching paymentId via API for dynamic rendering or relying on <style> tag for copy-paste.
 *
 * This file is included via a <script> tag (pay.js) on external sites.
 * Updated to fix TypeScript error for dataset property.
 * - All amounts are handled as integer sats internally for precision.
 * - Updated to use paymentId exclusively instead of buttonId, aligning with database schema change (04Aug2025_2350 BST).
 * - Updated to use data-paymentId attribute instead of parsing data-description (05Aug2025_0255 BST).
 * - Fixed paymentId mapping issue to ensure data-paymentid is correctly assigned (05Aug2025_0230 BST).
 * - Added debugging to trace paymentId assignment failure (05Aug2025_0240 BST).
 * - Fixed case sensitivity issue in paymentId mapping by adjusting conversion order (05Aug2025_0300 BST).
 * - Enforced data-paymentId camelCase convention and corrected mapping logic (05Aug2025_0310 BST).
 * - Simplified attribute mapping to directly handle data-paymentId with case-insensitive check (05Aug2025_0320 BST).
 * - Updated logging to reflect intended paymentId convention (05Aug2025_0340 BST).
 * - Added support for data-button-id to pass original buttonId (10Aug2025_1640 BST).
 * - Integrated client-side ID generation and /api/initializeIds call during button creation (10Aug2025_1732 BST).
 * - Removed inline ID generation, relying on initializeIds utility for consistency (11Aug2025_1110 BST).
 * - Reordered ID initialization to prioritize buttonId before paymentId (11Aug2025_1215 BST).
 * - Fixed fetch consistency by using fetchWithTimeout with wallet, and corrected initial props definition (11Aug2025_1220 BST).
 * - Moved wallet to global scope for server calls and fixed fetchWithTimeout arguments (11Aug2025_1235 BST).
 * - Corrected import for initializeIds, added type annotations for callbacks, and fixed fetchWithTimeout syntax (11Aug2025_1240 BST).
 * - Ensured correct props for fetchWithTimeout and resolved syntax error (11Aug2025_1245 BST).
 * - Re-verified fetchWithTimeout props to ensure wallet argument is correctly passed (11Aug2025_1255 BST).
 *
 * Version: v2.37 (Updated 11Aug2025_1255 BST to fix fetchWithTimeout wallet argument)
 */
const F = 'inject';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PayButton, { PayButtonProps } from './components/PayButton';
import console from 'console-browserify';
import { logWithTimestamp } from './utils/logging';
import { initializeIds } from './utils/initializeIds';
import { fetchWithTimeout } from './utils/general';
import { WalletClient, AuthFetch } from '@bsv/sdk';
import { CONFIG } from './utils/constants';
const WALLET_ORIGIN = CONFIG.WALLET_ORIGIN
const wallet = new WalletClient('auto', WALLET_ORIGIN); // Global wallet instance

interface ButtonCodeResponse {
  status: string;
  payment_id: string;
  code: string;
}

if (typeof window !== 'object') {
  throw new Error('❌ Window must be defined in order to use the Gateway inject script');
}

declare global {
  interface Window {
    PayButton: {
      render: (elementID: string, props: PayButtonProps) => void;
    };
  }
}

window.PayButton = window.PayButton || {};
window.PayButton.render = (elementID: string, props: PayButtonProps): void => {
  logWithTimestamp(F, '🔍 [Step 1] Inject props (sats):', { props });
  const element = document.getElementById(elementID);
  if (!element) {
    console.error(`❌ Failed to render PayButton: Element with ID ${elementID} not found`);
    return;
  }
  const root = createRoot(element);
  root.render(<PayButton {...props} />);
  logWithTimestamp(F, `✅ Rendered PayButton for ID: ${elementID}`);
};

const bootstrapPayButtons = async (): Promise<void> => {
  const buttons = document.getElementsByClassName('gateway-paybutton');
  logWithTimestamp(F, '🔍 Gateway: Found', buttons.length, buttons.length === 1 ? 'PayButton' : 'PayButtons', 'on this page.');
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons.item(i);
    if (!button) continue;
    const buttonID = `pay-${Math.floor(Math.random() * 100000)}`;
    button.id = buttonID;
    button.setAttribute('id', buttonID);
    const props: Partial<PayButtonProps> = { amount: 0, merchant: '', server: '', variable: false, paymentId: '', buttonId: '' };
    logWithTimestamp(F, '🔍 [inject] Initial props:', { ...props }); // Debug initial state
    if (button.hasAttributes()) {
      const attrs = button.attributes;
      for (let j = attrs.length - 1; j >= 0; j--) {
        if (!attrs[j].name.startsWith('data-')) continue;
        let propName = attrs[j].name.substring(5); // Extract as-is
        const value = attrs[j].value;
        logWithTimestamp(F, '🔍 [inject] Processing attribute (raw):', { propName: attrs[j].name, value }); // Log raw attribute name
        if (propName.toLowerCase() === 'paymentid' || propName.toLowerCase() === 'paymentId') {
          propName = 'paymentId'; // Force camelCase
          props[propName] = value;
          logWithTimestamp(F, '🔍 [inject] Assigned paymentId:', value); // Debug paymentId assignment
        } else if (propName.toLowerCase() === 'buttonid' || propName.toLowerCase() === 'buttonId') {
          propName = 'buttonId'; // Force camelCase
          props[propName] = value; // Store original buttonId
          logWithTimestamp(F, '🔍 [inject] Assigned buttonId:', value); // Debug buttonId assignment
        } else if (propName === 'amount') {
          props[propName] = Number(value);
        } else {
          propName = propName.replace(/-(.)/g, (_, char) => char.toUpperCase());
          props[propName] = value;
        }
      }
      logWithTimestamp(F, '🔍 [inject] Props after mapping:', { ...props }); // Debug final props
    }
    // Initialize only missing IDs using the utility function, button before payment
    if (!props.buttonId) {
      try {
        await initializeIds('button', wallet, (id: string) => { props.buttonId = id; }, () => {}, () => {});
      } catch (err) {
        logWithTimestamp(F, `❌ [inject] Failed to initialize buttonId:`, err);
        continue; // Skip this button if initialization fails
      }
    }
    if (!props.paymentId) {
      try {
        await initializeIds('payment', wallet, (id: string) => { props.paymentId = id; }, () => {}, () => {});
      } catch (err) {
        logWithTimestamp(F, `❌ [inject] Failed to initialize paymentId:`, err);
        continue; // Skip this button if initialization fails
      }
    }
    if (props.server) {
      try {
        let response = await fetchWithTimeout(
          `${props.server}/api/createButton`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              paymentId: props.paymentId,
              buttonId: props.buttonId,
              merchantId: props.merchant || '0282f7effd932d9d2a3774c287eacb9ace3728a753a0339e2f16998153e5d65963',
              amount: props.amount || 5,
              currency: props.currency || 'BSV',
              variable_amount: props.variable || false,
              multi_use: false,
              description: `Payment using paymentId: ${props.paymentId}`,
              customCSS: '<style>.gateway-paybutton { background: #8484FA; color: white; }</style>',
            })
          },
          wallet, // Third argument: wallet
          15000 // Fourth argument: timeout in milliseconds
        );
        if (!response.ok) throw new Error(`HTTP error! status: ${response.ok}`);
        const createData = await response.json();
        if (createData.status === 'success') {
          logWithTimestamp(F, '✅ [inject] Button created successfully:', createData.id);
          props.paymentId = createData.id; // Use server-confirmed paymentId
          props.buttonId = createData.id; // Update buttonId if server provides a new ID
        } else {
          throw new Error('Failed to create button');
        }
      } catch (err) {
        console.error('❌ [inject] Failed to create button:', err);
      }
    }
    // Ensure all required props are present before rendering
    const finalProps: PayButtonProps = {
      ...props,
      paymentId: props.paymentId || '',
      buttonId: props.buttonId || '',
      amount: props.amount || 5,
      merchant: props.merchant || '',
      server: props.server || 'http://localhost:3000',
    };
    window.PayButton.render(buttonID, finalProps);
  }
};
window.addEventListener('load', () => {
  bootstrapPayButtons().catch(err => console.error('❌ Error bootstrapping pay buttons:', err));
});
export {};