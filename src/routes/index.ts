/**
 * @file src/routes/index.ts
 * @description Aggregates all API route handlers for the Gateway application.
 *
 * This file exports an array of route objects that are registered by the server.
 *
 * Version: v1.0 (Reverted to working state, 04Aug2025_1038 BST)
 */

import createButton from './createButton'
import buttonCode from './buttonCode'
import acknowledgePayment from './acknowledgePayment'
import getStatus from './getStatus'
import invoice from './invoice'
import listButtons from './listButtons'
import listPayments from './listPayments'
import pay from './pay'

export default [createButton, buttonCode, acknowledgePayment, getStatus, invoice, listButtons, listPayments, pay]
