/**
 * @file src/routes/initializeIds.ts
 * @description POST route to validate and store client-generated payment or button IDs in the database, ensuring uniqueness and updating descriptions in payment_buttons and payments tables.
 * @version 1.0.0 (Updated 02Sep2025_1933 BST to standardize header comment)
 * @author xAI (Grok 3)
 * @dependencies
 * - knex: For database operations
 * - express: For Request and Response types
 * - express-validator: For request body validation
 * - ../utils/logging: For logWithTimestamp
 * - ../utils/general: For isBase58 and isMerchantId
 * - ../utils/idGenerator: For generateAndValidateUniqueId
 * - ../utils/merchant: For ensureMerchantExists
 * @changelog
 * - 02Sep2025_1933 BST (v1.0.0): Updated header comment to follow standardized template.
 */
import knex, { Knex } from 'knex'
import knexConfig from '../knexfile'
import type { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { logWithTimestamp } from '../utils/logging'
import { isBase58, isMerchantId } from '../utils/general'
import { generateAndValidateUniqueId } from '../utils/idGenerator'
import { ensureMerchantExists } from '../utils/merchant'
const F = 'routes/initializeIds'
const db: Knex = knex(knexConfig)
interface Ids {
  buttonId?: string
  paymentId?: string
  merchantId: string
  description: string // Changed to required
}
export type AuthRequest = Request & {
  auth?: {
    identityKey?: string
  }
}


export default {
  type: 'post',
  path: '/initializeIds',
  middlewares: [
    body('buttonId')
      .optional()
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('buttonId must be a non-empty string')
      .isLength({ min: 12, max: 12 })
      .withMessage('buttonId must be exactly 12 characters')
      .custom((value) => isBase58(value))
      .withMessage('buttonId must be a 12-character Base58 string'),
    body('paymentId')
      .optional()
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('paymentId must be a non-empty string')
      .isLength({ min: 12, max: 12 })
      .withMessage('paymentId must be a 12-character Base58 string')
      .custom((value) => isBase58(value))
      .withMessage('paymentId must be a 12-character Base58 string'),
    body('merchantId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('merchantId must be a non-empty string')
      .custom((value) => isMerchantId(value))
      .withMessage('merchantId must be a 64- or 66-character hex string'),
    body('description')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('description is required')
      .isLength({ max: 80 })
      .withMessage('description exceeds maximum length of 80 characters')
  ],
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp(F, '[initializeIds] Route hit for /initializeIds', {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers
    })
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      const errorDetails = errors
        .array()
        .map((err) => `${err.msg} (type: ${err.type})`)
        .join('; ')
      logWithTimestamp(F, '❌ [initializeIds] Validation failed:', {
        errors: errorDetails,
        body: req.body,
        headers: req.headers
      })
      res.status(400).json({
        status: 'error',
        message: `❌ Validation failed: ${errorDetails}`,
        errors: errors.array(),
        request: { body: req.body, headers: req.headers }
      })
      return
    }

// Start: extract senderIdentityKey once
let senderIdentityKey: string | undefined = (req as any).auth?.identityKey
const serverIdentityKey =
  process.env.SERVER_IDENTITY_KEY || // from env
  (req.app.get('config')?.SERVER_IDENTITY_KEY as string) || // if you have config attached
  ''

// Add fallback to x-bsv-server header if auth identityKey is missing or unknown
const headerServerKey = req.headers['x-bsv-server']
// Always accept server identity if header matches
if (headerServerKey && headerServerKey === serverIdentityKey) {
  senderIdentityKey = serverIdentityKey
  logWithTimestamp(F, '🔑 [initializeIds] Accepted server identity via header', {
    senderIdentityKey,
  })
}

// At this point senderIdentityKey and serverIdentityKey are defined
if (!senderIdentityKey) {
  logWithTimestamp(
    F,
    '❌ [initializeIds] Missing sender identity key from auth context'
  )
  res.status(401).json({
    status: 'error',
    message: '❌ Unauthorized: Missing sender identity',
  })
  return
}
    const { buttonId, paymentId, merchantId, description } = req.body as Ids
    if (!merchantId) {
      logWithTimestamp(
        F,
        '[initializeIds] merchantId not provided in request body',
        {
          body: req.body,
          headers: req.headers
        }
      )
      res.status(400).json({
        status: 'error',
        message: '❌ merchantId is required',
        request: { body: req.body, headers: req.headers }
      })
      return
    }
    if (!isMerchantId(merchantId)) {
      logWithTimestamp(
        F,
        '❌ [initializeIds] Invalid merchant identity format:',
        {
          merchantId,
          body: req.body,
          headers: req.headers
        }
      )
      res.status(400).json({
        status: 'error',
        message: '❌ Invalid merchantId format',
        request: { body: req.body, headers: req.headers }
      })
      return
    }

const isMerchant = senderIdentityKey === merchantId
const isServer = serverIdentityKey && senderIdentityKey === serverIdentityKey

// NEW: check fallback
const allowFallback = process.env.ALLOW_UNAUTH_FALLBACK === 'yes'

if (!isMerchant && !isServer && !allowFallback) {
  logWithTimestamp(
    F,
    '❌ [initializeIds] Sender identity does not match merchantId:',
    {
      senderIdentityKey,
      merchantId,
      serverIdentityKey
    }
  )
  res.status(403).json({
    status: 'error',
    message: 'Sender identity does not match merchantId',
    request: { body: req.body, headers: req.headers }
  })
  return
}

logWithTimestamp(F, '✅ [initializeIds] Merchant/server identity validated', {
  senderIdentityKey,
  merchantId,
  serverIdentityKey,
  isMerchant,
  isServer,
  allowFallback
})

    //* if (senderIdentityKey !== merchantId) {
    //   logWithTimestamp(
    //     F,
    //     '❌ [initializeIds] Sender identity does not match merchantId:',
    //     {
    //       senderIdentityKey,
    //       merchantId
    //     }
    //   )
    //   res.status(403).json({
    //     status: 'error',
    //     message: 'Sender identity does not match merchantId',
    //     request: { body: req.body, headers: req.headers }
    //   })
    //   return
    // }
    await ensureMerchantExists(db, merchantId)
    logWithTimestamp(F, '✅ [initializeIds] MerchantId validated:', {
      merchantId
    })
let initialGenerated =
  paymentId ||
  buttonId ||
  (await generateAndValidateUniqueId(
    merchantId,
    paymentId ? 'payment' : 'button',
    description,
    paymentId
  ))
let id =
  typeof initialGenerated === 'object' && initialGenerated?.id
    ? initialGenerated.id
    : initialGenerated

    //* let id =
    //   paymentId ||
    //   buttonId ||
    //   (await generateAndValidateUniqueId(
    //     merchantId,
    //     paymentId ? 'payment' : 'button',
    //     description,
    //     paymentId
    //   ))
    const targetType = paymentId ? 'payment' : 'button'
    try {
      await db.transaction(async (trx) => {
        let attempts = 0
        let currentId = id // Track the ID being validated (buttonId or paymentId)

        // For paymentId requests with buttonId, verify buttonId exists
        if (paymentId && buttonId) {
          await trx.raw('LOCK TABLES ids READ') // Lock for reading buttonId
          try {
            const existingButton = await trx('ids')
              .where({ id: buttonId, type: 'button', merchant_id: merchantId })
              .first()
            if (!existingButton) {
              logWithTimestamp(
                F,
                '❌ [initializeIds] Button ID does not exist:',
                { buttonId, merchantId }
              )
              res.status(400).json({
                status: 'error',
                message: `Button ID ${buttonId} does not exist`,
                request: { body: req.body, headers: req.headers },
                merchantId
              })
              return
            }
          } finally {
            await trx.raw('UNLOCK TABLES') // Release read lock
          }
        }
        while (attempts < 3) {
          await trx.raw('LOCK TABLES ids WRITE, payments READ') // Lock for insert
          try {
            const existingId = await trx('ids')
              .where({
                id: currentId,
                type: targetType,
                merchant_id: merchantId
              })
              .first()
// Ensure we always pass a string, not an object, into the WHERE clause
const safePaymentId =
  currentId && typeof currentId === 'object' && 'id' in currentId
    ? currentId.id
    : currentId;

const existingPayment =
  targetType === 'payment'
    ? await trx('payments').where({ payment_id: safePaymentId }).first()
    : null;

            //* const existingPayment =
            //   targetType === 'payment'
            //     ? await trx('payments').where({ payment_id: currentId }).first()
            //     : null
            if (!existingId && !existingPayment) {
              await trx('ids').insert({
                id: currentId,
                merchant_id: merchantId,
                type: targetType,
                timestamp: trx.fn.now()
              })
              logWithTimestamp(F, '✅ [initializeIds] ID inserted:', {
                id: currentId,
                merchantId,
                type: targetType
              })
              await trx.raw('UNLOCK TABLES') // Release locks
              res.status(200).json({ status: 'success', id: currentId })
              return
            }
          } catch (dbErr) {
            await trx.raw('UNLOCK TABLES') // Release locks on database error
            const errorMessage =
              dbErr instanceof Error ? dbErr.message : 'Database error'
            if (
              errorMessage.includes('ER_LOCK_DEADLOCK') ||
              errorMessage.includes('ER_QUERY_TIMEOUT')
            ) {
              logWithTimestamp(
                F,
                '⚠️ [initializeIds] Database error (retryable):',
                {
                  error: errorMessage,
                  id: currentId,
                  attempt: attempts + 1
                }
              )
              attempts++
{
  const generated = await generateAndValidateUniqueId(
    merchantId,
    targetType,
    description,
    paymentId
  )
  currentId = typeof generated === 'object' && generated?.id ? generated.id : generated
}
              //* currentId = await generateAndValidateUniqueId(
              //   merchantId,
              //   targetType,
              //   description,
              //   paymentId
              // )
              // continue
            }
            throw dbErr // Non-retryable error
          }
          await trx.raw('UNLOCK TABLES') // Release locks on duplicate
          attempts++
{
  const generated = await generateAndValidateUniqueId(
    merchantId,
    targetType,
    description,
    paymentId
  )
  currentId = typeof generated === 'object' && generated?.id ? generated.id : generated
}
          //* currentId = await generateAndValidateUniqueId(
          //   merchantId,
          //   targetType,
          //   description,
          //   paymentId
          // )
          logWithTimestamp(
            F,
            `⚠️ [initializeIds] Duplicate ${targetType} ID detected, trying new ID:`,
            {
              oldId: id,
              newId: currentId,
              merchantId,
              type: targetType,
              attempt: attempts
            }
          )
          id = currentId // Update id for consistency
        }
        await trx.raw('UNLOCK TABLES') // Ensure locks are released
        logWithTimestamp(
          F,
          '❌ [initializeIds] Failed to generate unique ID after 3 attempts:',
          {
            originalId: id,
            lastAttemptedId: currentId,
            merchantId,
            type: targetType
          }
        )
        res.status(409).json({
          status: 'error',
          message: 'Failed to generate unique ID after 3 attempts',
          newId: currentId, // Suggest new ID for client retry
          request: { body: req.body, headers: req.headers },
          merchantId
        })
      })
    } catch (err) {
      await db.raw('UNLOCK TABLES') // Ensure locks are released on error
      const errorMessage =
        err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ [initializeIds] Error pre-populating ID:', {
        message: errorMessage,
        error: err,
        stack: err instanceof Error ? err.stack : undefined,
        body: req.body,
        headers: req.headers,
        merchantId
      })
      res.status(500).json({
        status: 'error',
        message: `❌ ${errorMessage}`,
        request: { body: req.body, headers: req.headers },
        merchantId
      })
    }
  }
}
