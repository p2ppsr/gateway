/**
 * @file src/utils/initializeIds.ts
 * @description Utility function to validate and register a single payment or button ID in the database.
 * Provides a reusable function to validate a unique ID via the /api/initializeIds endpoint.
 * @version 1.61 (Updated 24Aug2025_2330 BST to add retry logic for 409 responses)
 * @author xAI (Grok 3)
 * @dependencies
 * - @bsv/sdk: For WalletClient
 * - ../utils/logging: For logging
 * - ../utils/general: For fetchWithTimeout
 * @changelog
 * - 24Aug2025_1800 BST (v1.60): Added force parameter and removed retries.
 * - 24Aug2025_2330 BST (v1.61): Added retry logic for 409 responses with newId to handle duplicate IDs.
 */
import { logWithTimestamp } from './logging';
import { fetchWithTimeout, generateBase58 } from './general';
import { toast } from 'react-toastify';
import { WalletClient } from '@bsv/sdk';
import type { Dispatch, SetStateAction } from 'react';
const F = 'utils/initializeIds';
export type InitializeIdsResponse = {
  status: 'success' | 'error';
  message?: string;
  id?: string;
};
export const initializeIds = async (
  type: 'payment' | 'button',
  wallet: WalletClient,
  id: string,
  merchantId?: string,
  setId?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_fixed?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_variable?: Dispatch<SetStateAction<string>>,
  buttonId?: string,
  force: boolean = false
): Promise<InitializeIdsResponse> => {
  let effectiveMerchantId: string;
  try {
    effectiveMerchantId = merchantId || (await wallet.getPublicKey({ identityKey: true })).publicKey;
  } catch (walletErr) {
    const error = walletErr as Error;
    logWithTimestamp(F, `initializeIds: Failed to get merchant ID: ${error.message}`);
    effectiveMerchantId = merchantId || '';
  }
  const isInitializedKey = `idsInitialized${type}_${effectiveMerchantId}`;
  const storedIdKey = `${type === 'button' ? 'buttonID' : 'paymentID'}_${effectiveMerchantId}`;
  const isInitialized = localStorage.getItem(isInitializedKey);
  const storedId = localStorage.getItem(storedIdKey);
  logWithTimestamp(
    F,
    `initializeIds: Checking localStorage for ${type} ID with merchantId ${effectiveMerchantId} - isInitialized: ${!!isInitialized}, storedId: ${storedId}, force: ${force}`
  );
  if (!force && isInitialized && storedId) {
    logWithTimestamp(F, `initializeIds: ${type} ID already initialized for merchant ${effectiveMerchantId}, using cached ID: ${storedId}`);
    if (setId) setId(storedId);
    if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
      const description = `Payment using paymentId: ${storedId}`;
      setSpendingDescription_fixed(description);
      setSpendingDescription_variable(description);
      logWithTimestamp(F, `initializeIds: Updated spending descriptions with ${type} ID: ${storedId}`);
    }
    return { status: 'success', id: storedId };
  }
  try {
    if (!id || id.length !== 12) throw new Error('Invalid 12-character ID provided');
    logWithTimestamp(F, `initializeIds: Validating ${type} ID: ${id} for merchant ${effectiveMerchantId}`);
    try {
      await wallet.getPublicKey({ identityKey: true });
    } catch (walletErr) {
      const error = walletErr as Error;
      throw new Error(`Wallet unavailable: ${error.message}`);
    }
    const headers = {
      'Content-Type': 'application/json',
    };
    let currentId = id;
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      const defaultDescription = `Payment using ${type}Id: ${currentId}`;
      const requestBody = JSON.stringify({
        [type === 'payment' ? 'paymentId' : 'buttonId']: currentId,
        merchantId: effectiveMerchantId,
        description: type === 'payment' ? defaultDescription : `Payment using button ID: ${currentId}`,
        ...(type === 'payment' && buttonId ? { buttonId } : {}),
      });
      logWithTimestamp(F, 'initializeIds: Sending request to /api/initializeIds:', { body: requestBody, headers });
      try {
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
        const responseText = await response.text();
        const data = responseText ? JSON.parse(responseText) : {};
        logWithTimestamp(F, `initializeIds: Response for ${type} ID:`, { status: response.status, data, merchantId: effectiveMerchantId });
        if (response.status === 200 && data.status === 'success') {
          const validatedId = data.id || currentId;
          if (setId) setId(validatedId);
          if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
            setSpendingDescription_fixed(defaultDescription);
            setSpendingDescription_variable(defaultDescription);
            logWithTimestamp(F, `initializeIds: Updated spending descriptions with ${type} ID: ${validatedId}`);
          }
          localStorage.setItem(isInitializedKey, 'true');
          localStorage.setItem(storedIdKey, validatedId);
          logWithTimestamp(F, `initializeIds: ${type} ID ${validatedId} validated successfully for merchant ${effectiveMerchantId}`);
          return { status: 'success', id: validatedId };
        } else if (response.status === 409 && data.newId) {
          attempts++;
          currentId = data.newId;
          logWithTimestamp(F, `initializeIds: Duplicate ${type} ID detected, retrying with new ID: ${currentId}`, { attempt: attempts });
          continue;
        } else {
          throw new Error(`Failed to validate ${type} ID: ${data.message || 'No success status'} (Status: ${response.status})`);
        }
      } catch (fetchErr) {
        const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error';
        logWithTimestamp(F, `initializeIds: Fetch error for ${type} ID: ${currentId}`, { error: errorMessage });
        throw fetchErr;
      }
    }
    throw new Error(`Failed to validate ${type} ID after ${maxAttempts} attempts`);
  } catch (err) {
    const error = err as Error;
    logWithTimestamp(F, `❌ initializeIds: Error validating ${type} ID ${id} for merchant ${effectiveMerchantId}:`, {
      error: error.message,
      stack: error.stack,
      merchantId: effectiveMerchantId,
    });
    if (!force) {
      toast.error(`Failed to validate ${type} ID: ${error.message}`);
    }
    return { status: 'error', message: `Failed to validate ${type} ID: ${error.message}` };
  }
};
