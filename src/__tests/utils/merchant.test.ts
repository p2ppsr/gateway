/**
 * @file src/__tests/utils/merchant.test.ts
 * @description Jest tests for ensureMerchantExists function in utils/merchant.ts.
 * Tests cover merchant insertion, conflict handling, empty merchantId, and error cases.
 * @version 1.0.11 (Updated 02Sep2025_1529 BST to fix Jest crash in error handling test)
 * @author xAI (Grok 3)
 * @dependencies
 * - knex: For database operations
 * - ../utils/logging: For logWithTimestamp
 * @changelog
 * - 02Sep2025_1529 BST (v1.0.11): Fixed Jest crash by using try/catch in error handling test to catch rejection explicitly.
 */
import { ensureMerchantExists } from '../../utils/merchant';
import { logWithTimestamp } from '../../utils/logging';
import { Knex } from 'knex';

// Custom QueryBuilder type to include ignore method
interface CustomQueryBuilder {
  insert: jest.Mock;
  onConflict: jest.Mock;
  ignore: jest.Mock;
}

// Custom Knex type to include required fn properties and table method
interface CustomKnex extends Knex {
  (table: string): CustomQueryBuilder;
  fn: {
    now: jest.Mock;
    uuid: jest.Mock;
    uuidToBin: jest.Mock;
    binToUuid: jest.Mock;
  };
}

// Mock dependencies
jest.mock('../../utils/logging', () => ({
  logWithTimestamp: jest.fn(),
}));
jest.mock('knex', () => ({
  Knex: jest.fn(),
}));

describe('utils/merchant.ts', () => {
  let mockDb: CustomKnex;

  beforeEach(() => {
    jest.clearAllMocks();
    const queryBuilder: CustomQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      ignore: jest.fn().mockResolvedValue(undefined),
    };
    mockDb = jest.fn((table: string) => queryBuilder) as unknown as CustomKnex;
    mockDb.fn = {
      now: jest.fn().mockReturnValue('2025-09-02 15:29:00'),
      uuid: jest.fn(),
      uuidToBin: jest.fn(),
      binToUuid: jest.fn(),
    };
  });

  test('inserts new merchant with valid merchantId', async () => {
    const merchantId = 'merchant123';
    await ensureMerchantExists(mockDb as Knex, merchantId);

    expect(mockDb).toHaveBeenCalledWith('merchants');
    expect(mockDb('merchants').insert).toHaveBeenCalledWith({
      merchant_id: merchantId,
      custom_fee_rate: 0,
      custom_fee: 0,
      welcomed: 0,
      created_at: '2025-09-02 15:29:00',
      updated_at: '2025-09-02 15:29:00',
    });
    expect(mockDb('merchants').onConflict).toHaveBeenCalledWith('merchant_id');
    expect(mockDb('merchants').ignore).toHaveBeenCalled();
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'utils/merchant',
      '✅ Merchant ensured:',
      { merchantId }
    );
  });

  test('ignores insertion for existing merchant', async () => {
    const merchantId = 'merchant123';
    mockDb('merchants').insert.mockReturnThis();
    mockDb('merchants').onConflict.mockReturnThis();
    mockDb('merchants').ignore.mockResolvedValue(undefined);

    await ensureMerchantExists(mockDb as Knex, merchantId);

    expect(mockDb).toHaveBeenCalledWith('merchants');
    expect(mockDb('merchants').insert).toHaveBeenCalled();
    expect(mockDb('merchants').onConflict).toHaveBeenCalledWith('merchant_id');
    expect(mockDb('merchants').ignore).toHaveBeenCalled();
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'utils/merchant',
      '✅ Merchant ensured:',
      { merchantId }
    );
  });

  test('does nothing for empty merchantId', async () => {
    await ensureMerchantExists(mockDb as Knex, '');

    expect(mockDb).not.toHaveBeenCalled();
    expect(mockDb('merchants')?.insert).not.toHaveBeenCalled();
    expect(mockDb('merchants')?.onConflict).not.toHaveBeenCalled();
    expect(mockDb('merchants')?.ignore).not.toHaveBeenCalled();
    expect(logWithTimestamp).not.toHaveBeenCalled();
  });

  test('does nothing for undefined merchantId', async () => {
    await ensureMerchantExists(mockDb as Knex, undefined as any);

    expect(mockDb).not.toHaveBeenCalled();
    expect(mockDb('merchants')?.insert).not.toHaveBeenCalled();
    expect(mockDb('merchants')?.onConflict).not.toHaveBeenCalled();
    expect(mockDb('merchants')?.ignore).not.toHaveBeenCalled();
    expect(logWithTimestamp).not.toHaveBeenCalled();
  });

  test('rejects with database error', async () => {
    const merchantId = 'merchant123';
    const error = new Error('Database error');
    mockDb('merchants').insert.mockImplementation(() => Promise.reject(error));

    let caughtError: unknown;
    try {
      await ensureMerchantExists(mockDb as Knex, merchantId);
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toEqual(error);
    expect(mockDb).toHaveBeenCalledWith('merchants');
    expect(mockDb('merchants').insert).toHaveBeenCalled();
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'utils/merchant',
      '✅ Merchant ensured:',
      { merchantId }
    );
  });
});
