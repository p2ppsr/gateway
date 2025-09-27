/**
 * @file src/__tests/routes/acknowledgePayment.test.ts
 * @description Jest tests for acknowledgePayment route in routes/acknowledgePayment.ts.
 * Tests cover validation, payment acknowledgment, no rows updated, and error scenarios.
 * @version 1.0.2 (Updated 02Sep2025_2351 BST to fix mock setup for db table queries)
 * @author xAI (Grok 3)
 * @dependencies
 * - knex: For database operations
 * - express: For Request and Response types
 * - ../utils/logging: For logWithTimestamp
 * @changelog
 * - 02Sep2025_2351 BST (v1.0.2): Fixed mock setup to make mockDb callable for information_schema.columns queries, ensuring where method is called.
 * - 02Sep2025_2341 BST (v1.0.1): Fixed mock setup to handle information_schema.columns query on mockDb, ensuring where method is called.
 * - 02Sep2025_2327 BST (v1.0.0): Created initial test suite for acknowledgePayment route.
 */
// Mock dependencies before importing acknowledgePayment
import { Request, Response } from 'express'
import acknowledgePayment from '../../routes/acknowledgePayment'
import { logWithTimestamp } from '../../utils/logging'

const informationSchemaBuilder = {
  where: jest.fn().mockReturnThis(),
  first: jest.fn()
} as any

const paymentsBuilder = {
  where: jest.fn().mockReturnThis(),
  update: jest.fn()
} as any

const mockDb: any = jest.fn((table: string) => {
  if (table === 'information_schema.columns') return informationSchemaBuilder
  if (table === 'payments') return paymentsBuilder
  throw new Error(`Unknown table: ${table}`)
})
mockDb.transaction = jest.fn()
mockDb.raw = jest.fn().mockResolvedValue(undefined)
mockDb.fn = { now: jest.fn().mockReturnValue(new Date()) }

jest.mock('knex', () => ({
  __esModule: true,
  default: jest.fn(() => mockDb)
}))
jest.mock('../../utils/logging', () => ({
  logWithTimestamp: jest.fn()
}))

// Extend Request interface to include body with paymentId
interface CustomRequest extends Request {
  body: {
    paymentId?: string
  }
}

/** Helper: create a callable trx mock that returns per-table builders */
function makeTrxMock() {
  const trx: any = jest.fn((table: string) => {
    if (table === 'information_schema.columns') return informationSchemaBuilder
    if (table === 'payments') return paymentsBuilder
    throw new Error(`Unknown table: ${table}`)
  })
  trx.raw = jest.fn().mockResolvedValue(undefined)
  trx.fn = { now: jest.fn().mockReturnValue(new Date()) }

  return { trx, informationSchemaBuilder, paymentsBuilder }
}

describe('routes/acknowledgePayment.ts', () => {
  let mockReq: Partial<CustomRequest>
  let mockRes: Partial<Response>
  let statusSpy: jest.Mock
  let jsonSpy: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    statusSpy = jest.fn().mockReturnThis()
    jsonSpy = jest.fn()
    mockRes = { status: statusSpy, json: jsonSpy }
    mockReq = { body: {}, headers: {} }
    ;(mockDb.transaction as jest.Mock).mockReset()
  })

  test('rejects missing paymentId', async () => {
    mockReq = {
      body: {},
      headers: {}
    }

    await acknowledgePayment.func(mockReq as CustomRequest, mockRes as Response)

    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'Received request body:',
      expect.any(Object)
    )
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      '❌ Missing paymentId'
    )
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      status: 'error',
      message: '❌ Missing paymentId'
    })
  })

  test('successfully acknowledges payment', async () => {
    mockReq = {
      body: { paymentId: 'validPaymentId' },
      headers: {}
    }

    const { trx } = makeTrxMock()
    informationSchemaBuilder.first.mockResolvedValue({
      column_name: 'is_new',
      data_type: 'boolean'
    })
    paymentsBuilder.update.mockResolvedValue(1) // One row updated

    ;(mockDb.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      await cb(trx)
    })

    await acknowledgePayment.func(mockReq as CustomRequest, mockRes as Response)

    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'Received request body:',
      { paymentId: 'validPaymentId' }
    )
    expect(informationSchemaBuilder.where).toHaveBeenCalledWith({
      table_name: 'payments',
      column_name: 'is_new'
    })
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'is_new column info:',
      { column_name: 'is_new', data_type: 'boolean' }
    )
    expect(mockDb.transaction).toHaveBeenCalled()
    expect(paymentsBuilder.update).toHaveBeenCalledWith({ is_new: false })
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'Update result:',
      1
    )
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      '✅ Payment acknowledged successfully:',
      { paymentId: 'validPaymentId' }
    )
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(jsonSpy).toHaveBeenCalledWith({
      status: 'success',
      message: 'Payment acknowledged successfully'
    })
  })

  test('handles no rows updated', async () => {
    mockReq = {
      body: { paymentId: 'validPaymentId' },
      headers: {}
    }

    const { trx } = makeTrxMock()
    informationSchemaBuilder.first.mockResolvedValue({
      column_name: 'is_new',
      data_type: 'boolean'
    })
    paymentsBuilder.update.mockResolvedValue(0) // No rows updated

    ;(mockDb.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      await cb(trx)
    })

    await acknowledgePayment.func(mockReq as CustomRequest, mockRes as Response)

    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'Received request body:',
      { paymentId: 'validPaymentId' }
    )
    expect(informationSchemaBuilder.where).toHaveBeenCalledWith({
      table_name: 'payments',
      column_name: 'is_new'
    })
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'is_new column info:',
      { column_name: 'is_new', data_type: 'boolean' }
    )
    expect(mockDb.transaction).toHaveBeenCalled()
    expect(paymentsBuilder.update).toHaveBeenCalledWith({ is_new: false })
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'Update result:',
      0
    )
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      '❌ Error in acknowledgePayment:',
      expect.objectContaining({
        message: 'No rows updated'
      })
    )
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      status: 'error',
      message: '❌ Internal server error'
    })
  })

  test('handles transaction error', async () => {
    mockReq = {
      body: { paymentId: 'validPaymentId' },
      headers: {}
    }

    const { trx } = makeTrxMock()
    informationSchemaBuilder.first.mockResolvedValue({
      column_name: 'is_new',
      data_type: 'boolean'
    })
    paymentsBuilder.update.mockRejectedValue(new Error('Database error'))

    ;(mockDb.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      await cb(trx)
    })

    await acknowledgePayment.func(mockReq as CustomRequest, mockRes as Response)

    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'Received request body:',
      { paymentId: 'validPaymentId' }
    )
    expect(informationSchemaBuilder.where).toHaveBeenCalledWith({
      table_name: 'payments',
      column_name: 'is_new'
    })
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      'is_new column info:',
      { column_name: 'is_new', data_type: 'boolean' }
    )
    expect(mockDb.transaction).toHaveBeenCalled()
    expect(paymentsBuilder.update).toHaveBeenCalledWith({ is_new: false })
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'routes/acknowledgePayment',
      '❌ Error in acknowledgePayment:',
      expect.objectContaining({
        message: 'Database error'
      })
    )
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      status: 'error',
      message: '❌ Internal server error'
    })
  })
})
