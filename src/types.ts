export interface UTXOReference {
  txid: string
  outputIndex: number
}

export interface GatewayRecord {
  txid: string
  outputIndex: number
  payerIdentityKey: string
  merchantId: string
  amount: number
  currency: string
  buttonId: string
  transactionId: string
  status: string
  createdAt: Date
  searchableAttributes: string
}

export interface GatewayAttributes {
  payerIdentityKey?: string
  merchantId?: string
  amount?: number
  currency?: string
  buttonId?: string
  transactionId?: string
  status?: string
}

export interface GatewayQuery {
  $and: Array<{ [key: string]: any }>
}

// Overlay-compatible structured lookup query types

export type FindByMerchantIdQuery = {
  type: 'findByMerchantId'
  value: { merchantId: string }
}

export type FindByPaymentIdQuery = {
  type: 'findByPaymentId'
  value: { paymentId: string }
}

export type FindByButtonIdQuery = {
  type: 'findByButtonId'
  value: { buttonId: string }
}

export type FindByTransactionIdQuery = {
  type: 'findByTransactionId'
  value: { transactionId: string }
}

export type FindByAmountQuery = {
  type: 'findByAmount'
  value: { amount: number }
}

export interface FindAllQuery {
  type: 'findAll'
  value?: {
    transactionId?: string
    merchantId?: string
  }
}

export type GatewayLookupQuery =
  | FindByMerchantIdQuery
  | FindByPaymentIdQuery
  | FindByButtonIdQuery
  | FindByTransactionIdQuery
  | FindByAmountQuery
  | FindAllQuery
