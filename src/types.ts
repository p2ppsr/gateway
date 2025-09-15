/**
 * Reference to a specific UTXO by transaction ID and output index.
 *
 * @property {string} txid - The transaction ID.
 * @property {number} outputIndex - The index of the output within the transaction.
 */
export interface UTXOReference {
  txid: string
  outputIndex: number
}

/**
 * A record representing a payment attempt within the Gateway system.
 *
 * @property {string} txid - Transaction ID where the payment is recorded.
 * @property {number} outputIndex - Output index in the transaction.
 * @property {string} payerIdentityKey - Identity key of the paying user.
 * @property {string} merchantId - Merchant’s unique identifier.
 * @property {number} amount - Amount paid in the transaction.
 * @property {string} currency - Currency type (e.g. "BSV").
 * @property {string} buttonId - ID of the payment button used.
 * @property {string} derivationPrefix - BRC29 derivation prefix.
 * @property {string} derivationSuffix - BRC29 derivation suffix.
 * @property {string} status - Current status of the payment.
 * @property {Date} createdAt - Timestamp when the record was created.
 * @property {string} searchableAttributes - Serialized string for overlay indexing.
 */
export interface GatewayRecord {
  txid: string
  outputIndex: number
  payerIdentityKey: string
  merchantId: string
  amount: number
  currency: string
  buttonId: string
  derivationPrefix: string
  derivationSuffix: string
  status: string
  createdAt: Date
  searchableAttributes: string
}

/**
 * Optional filter attributes for querying Gateway records.
 *
 * @property {string} [payerIdentityKey] - Filter by payer identity.
 * @property {string} [merchantId] - Filter by merchant ID.
 * @property {number} [amount] - Filter by amount paid.
 * @property {string} [currency] - Filter by currency type.
 * @property {string} [buttonId] - Filter by button ID.
 * @property {string} [derivationPrefix] - BRC29 derivation prefix.
 * @property {string} [derivationSuffix] - BRC29 derivation suffix.
 * @property {string} [status] - Filter by payment status.
 */
export interface GatewayAttributes {
  payerIdentityKey?: string
  merchantId?: string
  amount?: number
  currency?: string
  buttonId?: string
  derivationPrefix?: string
  derivationSuffix?: string
  status?: string
}

/**
 * Advanced query format using logical AND operations.
 *
 * @property {Array<Object>} $and - List of conditions to match.
 */
export interface GatewayQuery {
  $and: Array<{ [key: string]: any }>
}

// Overlay-compatible structured lookup query types

/**
 * Lookup query to find all payments for a specific merchant ID.
 *
 * @property {'findByMerchantId'} type - Query type.
 * @property {{ merchantId: string }} value - Merchant ID to match.
 */
export interface FindByMerchantIdQuery {
  type: 'findByMerchantId'
  value: { merchantId: string }
}

/**
 * Lookup query to find a payment by its payment ID.
 *
 * @property {'findByPaymentId'} type - Query type.
 * @property {{ paymentId: string }} value - Payment ID to match.
 */
export interface FindByPaymentIdQuery {
  type: 'findByPaymentId'
  value: { paymentId: string }
}

/**
 * Lookup query to find payments using a button ID.
 *
 * @property {'findByButtonId'} type - Query type.
 * @property {{ buttonId: string }} value - Button ID to match.
 */
export interface FindByButtonIdQuery {
  type: 'findByButtonId'
  value: { buttonId: string }
}

/**
 * Lookup query to find payments by derivation prefix.
 *
 * @property {'findByDerivationPrefix'} type - Query type.
 * @property {{ derivationPrefix: string }} value - derivation prefix to match.
 */
export interface FindByDerivationPrefixQuery {
  type: 'findByDerivationPrefix'
  value: { derivationPrefix: string }
}

/**
 * Lookup query to find payments by derivation suffix.
 *
 * @property {'findByDerivationSuffix'} type - Query type.
 * @property {{ derivationSuffix: string }} value - derivation suffix to match.
 */
export interface FindByDerivationSuffixQuery {
  type: 'findByDerivationSuffix'
  value: { derivationSuffix: string }
}

// /**
//  * Lookup query to find payments by transaction ID.
//  *
//  * @property {'findByTransactionId'} type - Query type.
//  * @property {{ transactionId: string }} value - Transaction ID to match.
//  */
// export interface FindByTransactionIdQuery {
//   type: 'findByTransactionId'
//   value: { transactionId: string }
// }

/**
 * Lookup query to find payments by amount.
 *
 * @property {'findByAmount'} type - Query type.
 * @property {{ amount: number }} value - Amount to match.
 */
export interface FindByAmountQuery {
  type: 'findByAmount'
  value: { amount: number }
}

/**
 * Query to find all records, with optional filters.
 *
 * @property {'findAll'} type - Query type.
 * @property {Object} [value] - Optional filters for narrowing the result set.
 * @property {string} [value.derivastionPrefix] - Filter by derivastion prefix.
 * @property {string} [value.derivastionSuffix] - Filter by derivastion suffix.
 * @property {string} [value.merchantId] - Filter by merchant ID.
 */
export interface FindAllQuery {
  type: 'findAll'
  value?: {
    derivationPrefix?: string
    derivationSuffix?: string
    merchantId?: string
  }
}

/**
 * Union type encompassing all valid overlay lookup queries for Gateway.
 */
export type GatewayLookupQuery =
  | FindByMerchantIdQuery
  | FindByPaymentIdQuery
  | FindByButtonIdQuery
  | FindByDerivationPrefixQuery
  | FindByDerivationSuffixQuery
  | FindByAmountQuery
  | FindAllQuery
