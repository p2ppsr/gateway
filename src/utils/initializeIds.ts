/**
 * @file src/utils/initializeIds.ts
 * @description Utility function to initialize a single payment or button ID in the database.
 * This module provides a reusable function to generate and register a unique ID (paymentId or buttonId)
 * in the ids table via the /api/initializeIds endpoint, ensuring consistency across the application.
 * @author [Your Name or Team]
 * @date 2025-08-11
 * @version 1.31
 */
import { logWithTimestamp } from './logging';
import { fetchWithTimeout, generateBase58 } from './general';
import { toast } from 'react-toastify';
import { WalletClient } from '@bsv/sdk';
const F = 'utils/initializeIds';

export const initializeIds = async (
  type: 'payment' | 'button',
  wallet: WalletClient,
  setId: (id: string) => void,
  setSpendingDescription_fixed?: (desc: string) => void,
  setSpendingDescription_variable?: (desc: string) => void,
  authToken?: string
): Promise<boolean> => {
  let merchantId: string;
  try {
    const { publicKey } = await wallet.getPublicKey({ identityKey: true });
    merchantId = publicKey;
    logWithTimestamp(F, `[initializeIds] Client wallet derived:`, { walletPublicKey: merchantId });
  } catch (err) {
    logWithTimestamp(F, `❌ Error retrieving merchantId: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
  const isInitializedKey = `idsInitialized_${type}_${merchantId}`;
  const isInitialized = localStorage.getItem(isInitializedKey);
  logWithTimestamp(F, `initializeIds: Checking localStorage for ${type} ID with merchantId ${merchantId} - isInitialized: ${!!isInitialized}`);
  if (isInitialized) {
    logWithTimestamp(F, `initializeIds: ${type} ID already initialized for merchant ${merchantId}, skipping API call`);
    return false; // Return false if skipped
  }
  try {
    const newId = generateBase58(12);
    if (!newId) throw new Error('❌ Failed to generate ID');
    logWithTimestamp(F, `initializeIds: Attempting to initialize ${type} ID: ${newId} for merchant ${merchantId}`);
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken && { Authorization: `Bearer ${authToken}` })
    };
    const requestBody = JSON.stringify({ 
      [type === 'payment' ? 'paymentId' : 'buttonId']: newId,
      merchantId: merchantId // Added to send with the request
    });
    logWithTimestamp(F, `[initializeIds] Sending request to /api/initializeIds:`, { body: requestBody, headers });
    const response = await fetchWithTimeout(
      `${location.protocol}//${location.host}/api/initializeIds`,
      {
        method: 'POST',
        headers,
        body: requestBody,
      },
      wallet,
      30000
    );
    if (!response.ok) {
      const errorText = await response.text(); // Capture error response
      logWithTimestamp(F, `❌ [initializeIds] Server response for failed request:`, { status: response.status, text: errorText });
      throw new Error(`❌ HTTP error! Status: ${response.status}`);
    }
    const responseText = await response.text();
    const data = responseText ? JSON.parse(responseText) : {};
    logWithTimestamp(F, `initializeIds: Response for ${type} ID:`, { status: response.status, data, merchantId });
    if (data.status === 'success') {
      setId(newId);
      if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
        const description = `Payment using paymentId: ${newId}`;
        setSpendingDescription_fixed(description);
        setSpendingDescription_variable(description);
      }
      localStorage.setItem(isInitializedKey, 'true');
      logWithTimestamp(F, `initializeIds: ${type} ID initialized successfully: ${newId} for merchant ${merchantId}`);
      return true; // Return true on success
    } else {
      throw new Error(`❌ Failed to initialize ${type} ID: ${data.message || 'No success status'} (Status: ${response.status})`);
    }
  } catch (err) {
    const error = err as Error;
    logWithTimestamp(F, `❌ initializeIds: Error initializing ${type} ID for merchant ${merchantId}:`, { error: error.message, stack: error.stack, merchantId });
    toast.error(`❌ Failed to initialize ${type} ID: ${error.message}`);
    return false; // Return false on error
  }
};