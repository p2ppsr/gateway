/**
 * @file src/utils/initializeIds.ts
 * @description Utility function to validate and register a single payment or button ID in the database.
 * This module provides a reusable function to validate a unique ID (paymentId or buttonId)
 * in the ids table via the /api/initializeIds endpoint, returning success or failure.
 * @author [Your Name or Team]
 * @date 2025-08-18
 * @version 1.46
 */
import { logWithTimestamp } from './logging';
import { fetchWithTimeout } from './general';
import { toast } from 'react-toastify';
import { WalletClient } from '@bsv/sdk';
import type { Dispatch, SetStateAction } from 'react';

const F = 'utils/initializeIds';

interface InitializeIdsResponse {
  status: 'success' | 'error';
  message?: string;
}

export const initializeIds = async (
  type: 'payment' | 'button',
  wallet: WalletClient,
  id: string,
  merchantId?: string,
  setId?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_fixed?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_variable?: Dispatch<SetStateAction<string>>,
  authToken?: string,
  silent: boolean = false
): Promise<InitializeIdsResponse> => {
  const maxRetries = 3;
  let retryCount = 0;
  let delay = 1000; // Initial delay in ms
  let isCircuitBreakerOpen = false;

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
    `initializeIds: Checking localStorage for ${type} ID with merchantId ${effectiveMerchantId} - isInitialized: ${!!isInitialized}, storedId: ${storedId}`
  );

  if (isInitialized && storedId) {
    logWithTimestamp(F, `initializeIds: ${type} ID already initialized for merchant ${effectiveMerchantId}, using cached ID: ${storedId}`);
    if (setId) setId(storedId);
    if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
      const description = `Payment using paymentId: ${storedId}`;
      setSpendingDescription_fixed(description);
      setSpendingDescription_variable(description);
      logWithTimestamp(F, `initializeIds: Updated spending descriptions with ${type} ID: ${storedId}`);
    }
    return { status: 'success' };
  }

  const attemptInitialize = async (): Promise<InitializeIdsResponse> => {
    if (isCircuitBreakerOpen) {
      logWithTimestamp(F, `initializeIds: Circuit breaker open, aborting ${type} ID initialization`);
      return { status: 'error', message: `Circuit breaker open for ${type} ID initialization` };
    }
    try {
      if (!id || id.length !== 12) throw new Error('Invalid 12-character ID provided');
      logWithTimestamp(F, `initializeIds: Validating ${type} ID: ${id} for merchant ${effectiveMerchantId}`);
      // Test wallet connectivity
      try {
        await wallet.getPublicKey({ identityKey: true });
      } catch (walletErr) {
        const error = walletErr as Error;
        throw new Error(`Wallet unavailable: ${error.message}`);
      }
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      };
      const requestBody = JSON.stringify({
        [type === 'payment' ? 'paymentId' : 'buttonId']: id,
        merchantId: effectiveMerchantId,
      });
      logWithTimestamp(F, '[initializeIds] Sending request to /api/initializeIds:', { body: requestBody, headers });
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
        const errorText = await response.text();
        logWithTimestamp(F, `❌ [initializeIds] Server response for failed request:`, { status: response.status, text: errorText });
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const responseText = await response.text();
      const data = responseText ? JSON.parse(responseText) : {};
      logWithTimestamp(F, `initializeIds: Response for ${type} ID:`, { status: response.status, data, merchantId: effectiveMerchantId });
      if (data.status === 'success') {
        if (setId) setId(id);
        if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
          const description = `Payment using paymentId: ${id}`;
          setSpendingDescription_fixed(description);
          setSpendingDescription_variable(description);
          logWithTimestamp(F, `initializeIds: Updated spending descriptions with ${type} ID: ${id}`);
        }
        localStorage.setItem(isInitializedKey, 'true');
        localStorage.setItem(storedIdKey, id);
        logWithTimestamp(F, `initializeIds: ${type} ID ${id} validated successfully for merchant ${effectiveMerchantId}`);
        return { status: 'success' };
      } else {
        throw new Error(`Failed to validate ${type} ID: ${data.message || 'No success status'} (Status: ${response.status})`);
      }
    } catch (err) {
      const error = err as Error;
      logWithTimestamp(F, `❌ initializeIds: Error validating ${type} ID ${id} for merchant ${effectiveMerchantId}:`, {
        error: error.message,
        stack: error.stack,
        merchantId: effectiveMerchantId,
      });
      if (retryCount < maxRetries && (error.message.includes('Session not found') || error.message.includes('ECONNREFUSED') || error.message.includes('Wallet unavailable'))) {
        retryCount++;
        delay *= 2; // Exponential backoff
        logWithTimestamp(F, `initializeIds: Retrying ${type} ID initialization, attempt ${retryCount}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptInitialize();
      }
      isCircuitBreakerOpen = true;
      logWithTimestamp(F, `initializeIds: Max retries reached or unrelated error, circuit breaker opened for ${type} ID`);
      if (!silent) {
        toast.error(`Failed to validate ${type} ID: ${error.message}`);
      }
      // Fallback to temporary ID
      if (setId) setId(id);
      if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
        const description = `Payment using paymentId: ${id}`;
        setSpendingDescription_fixed(description);
        setSpendingDescription_variable(description);
        localStorage.setItem(`spendingDescription_fixed_${effectiveMerchantId}`, description);
        localStorage.setItem(`spendingDescription_variable_${effectiveMerchantId}`, description);
      }
      localStorage.setItem(isInitializedKey, 'true');
      localStorage.setItem(storedIdKey, id);
      logWithTimestamp(F, `initializeIds: Using temporary ${type} ID due to failure: ${id}`);
      return { status: 'success' }; // Treat as success to avoid blocking
    }
  };

  return await attemptInitialize();
};