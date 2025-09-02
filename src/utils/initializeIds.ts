/**
 * @file src/utils/initializeIds.ts
 * @description Utility function to validate and register a single payment or button ID in the database.
 * Provides a reusable function to validate a unique ID via the /api/initializeIds endpoint.
 * @version 1.67 (Updated 01Sep2025_2350 BST to fix runtime error with invalid id and ensure cache robustness)
 * @author xAI (Grok 3)
 * @dependencies
 * - @bsv/sdk: For WalletClient
 * - ../utils/logging: For logging
 * - ../utils/general: For fetchWithTimeout, isBase58, generateBase58
 * @changelog
 * - 01Sep2025_2350 BST (v1.67): Added cache clearing for corrupted states and improved logging for invalid id handling.
 * - 01Sep2025_2345 BST (v1.66): Restored cache-first behavior from v1.61, moved id validation after cache check, and added new ID generation for invalid input id.
 * - 01Sep2025_2220 BST (v1.64): Added handling for invalid cache state and early id validation.
 * - 01Sep2025_2100 BST (v1.63): Added local ID generation for invalid newId and validated buttonId.
 * - 01Sep2025_2030 BST (v1.62): Improved error handling, added type validation, and standardized logging.
 * - 24Aug2025_1800 BST (v1.60): Added force parameter and removed retries.
 * - 24Aug2025_2330 BST (v1.61): Added retry logic for 409 responses.
 */
import { logWithTimestamp } from './logging';
import { fetchWithTimeout, generateBase58, isBase58 } from './general';
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
  id?: string,
  merchantId?: string,
  setId?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_fixed?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_variable?: Dispatch<SetStateAction<string>>,
  buttonId?: string,
  force: boolean = false
): Promise<InitializeIdsResponse> => {
  // Validate type
  if (!['payment', 'button'].includes(type)) {
    const errorMsg = `Invalid type: ${type}. Must be 'payment' or 'button'`;
    logWithTimestamp(F, errorMsg);
    toast.error(errorMsg);
    return { status: 'error', message: errorMsg };
  }

  // Validate buttonId if provided
  if (type === 'payment' && buttonId && !isBase58(buttonId, 12)) {
    const errorMsg = 'Invalid 12-character Base58 buttonId provided';
    logWithTimestamp(F, errorMsg);
    toast.error(errorMsg);
    return { status: 'error', message: errorMsg };
  }

  // Determine effectiveMerchantId
  let effectiveMerchantId: string;
  try {
    effectiveMerchantId = merchantId || (await wallet.getPublicKey({ identityKey: true })).publicKey;
    if (!effectiveMerchantId) {
      throw new Error('Merchant ID is undefined');
    }
  } catch (walletErr) {
    const error = walletErr as Error;
    const errorMsg = `Failed to get merchant ID: ${error.message}`;
    logWithTimestamp(F, errorMsg);
    toast.error(errorMsg);
    return { status: 'error', message: errorMsg };
  }

  const isInitializedKey = `idsInitialized${type}_${effectiveMerchantId}`;
  const storedIdKey = `${type === 'button' ? 'buttonId' : 'paymentId'}_${effectiveMerchantId}`;
  const isInitialized = localStorage.getItem(isInitializedKey);
  const storedId = localStorage.getItem(storedIdKey);
  logWithTimestamp(
    F,
    `initializeIds: Checking localStorage for ${type}Id with merchantId ${effectiveMerchantId} - isInitialized: ${!!isInitialized}, storedId: ${storedId}, force: ${force}, inputId: ${id}`
  );

  // Use cached ID if available
  if (!force && isInitialized && storedId) {
    logWithTimestamp(
      F,
      `initializeIds: ${type}Id already initialized for merchant ${effectiveMerchantId}, using cached ID: ${storedId}`
    );
    if (setId) setId(storedId);
    if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
      const description = `Payment using ${type}Id: ${storedId}`;
      setSpendingDescription_fixed(description);
      setSpendingDescription_variable(description);
      logWithTimestamp(F, `initializeIds: Updated spending descriptions with ${type}Id: ${storedId}`);
    }
    return { status: 'success', id: storedId };
  }

  // Handle invalid cache state
  let currentId = id;
  if (!force && isInitialized && !storedId) {
    logWithTimestamp(
      F,
      `initializeIds: Invalid cache state for ${type}Id with merchantId ${effectiveMerchantId}, clearing cache and generating new ID`
    );
    localStorage.removeItem(isInitializedKey); // Clear corrupted cache
    currentId = generateBase58(12);
    logWithTimestamp(F, `initializeIds: Generated new ${type}Id: ${currentId}`);
  } else if (!id || !isBase58(id, 12)) {
    logWithTimestamp(
      F,
      `initializeIds: Invalid or missing ${type}Id provided, generating new ID`
    );
    currentId = generateBase58(12);
    logWithTimestamp(F, `initializeIds: Generated new ${type}Id: ${currentId}`);
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const defaultDescription = `Payment using ${type}Id: ${currentId}`;
      const requestBody = JSON.stringify({
        [type === 'payment' ? 'paymentId' : 'buttonId']: currentId,
        merchantId: effectiveMerchantId,
        description: type === 'payment' ? defaultDescription : `Payment using buttonId: ${currentId}`,
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
        logWithTimestamp(F, `initializeIds: Response for ${type}Id:`, {
          status: response.status,
          data,
          merchantId: effectiveMerchantId,
        });

        if (response.status === 200 && data.status === 'success') {
          const validatedId = data.id || currentId;
          if (setId) setId(validatedId);
          if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
            setSpendingDescription_fixed(defaultDescription);
            setSpendingDescription_variable(defaultDescription);
            logWithTimestamp(F, `initializeIds: Updated spending descriptions with ${type}Id: ${validatedId}`);
          }
          localStorage.setItem(isInitializedKey, 'true');
          localStorage.setItem(storedIdKey, validatedId);
          logWithTimestamp(
            F,
            `initializeIds: ${type}Id ${validatedId} validated successfully for merchant ${effectiveMerchantId}`
          );
          return { status: 'success', id: validatedId };
        } else if (response.status === 409) {
          attempts++;
          if (data.newId && isBase58(data.newId, 12)) {
            currentId = data.newId;
            logWithTimestamp(F, `initializeIds: Duplicate ${type}Id detected, retrying with new ID: ${currentId}`, {
              attempt: attempts,
            });
          } else {
            currentId = generateBase58(12);
            logWithTimestamp(F, `initializeIds: Duplicate ${type}Id detected, no valid newId provided, generated new ID: ${currentId}`, {
              attempt: attempts,
            });
          }
          continue;
        } else {
          throw new Error(
            `Failed to validate ${type}Id: ${data.message || 'No success status'} (Status: ${response.status})`
          );
        }
      } catch (fetchErr) {
        const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error';
        logWithTimestamp(F, `initializeIds: Fetch error for ${type}Id: ${currentId}`, { error: errorMessage });
        throw fetchErr;
      }
    }
    throw new Error(`Failed to validate ${type}Id after ${maxAttempts} attempts`);
  } catch (err) {
    const error = err as Error;
    const errorMsg = error.message;
    logWithTimestamp(F, `initializeIds: Error validating ${type}Id ${currentId} for merchant ${effectiveMerchantId}:`, {
      error: errorMsg,
      stack: error.stack,
      merchantId: effectiveMerchantId,
    });
    toast.error(errorMsg);
    return { status: 'error', message: errorMsg };
  }
};
