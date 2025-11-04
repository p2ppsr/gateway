/**
 * @file src/routes/index.ts
 * @description
 * Aggregates all API route handlers for the Gateway application.
 * This file exports an array of route objects that are registered by the server.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import createButton from './createButton'
import buttonCode from './buttonCode'
import acknowledgePayment from './acknowledgePayment'
import getStatus from './getStatus'
import invoice from './invoice'
import listButtons from './listButtons'
import listPayments from './listPayments'
import pay from './pay'
import initializeIds from './initializeIds'
import cleanupIds from './cleanupIds'

export default [
  createButton,
  buttonCode,
  acknowledgePayment,
  getStatus,
  invoice,
  listButtons,
  listPayments,
  pay,
  initializeIds,
  cleanupIds
]
