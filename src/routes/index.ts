/**
 * @file src/routes/index.ts
 * @description Aggregates all API route handlers for the Gateway application.
 *
 * This file exports an array of route objects that are registered by the server.
 *
 * Version: v1.1 (Updated 11Aug2025_1045 BST to include initializeIds route)
 * Change Log:
 * - 04Aug2025_1038 BST (v1.0): Reverted to working state, initial aggregation of core routes.
 * - 11Aug2025_1045 BST (v1.1): Added initializeIds route to support pre-population of ids table on startup.
 */
import createButton from "./createButton";
import buttonCode from "./buttonCode";
import acknowledgePayment from "./acknowledgePayment";
import getStatus from "./getStatus";
import invoice from "./invoice";
import listButtons from "./listButtons";
import listPayments from "./listPayments";
import pay from "./pay";
import initializeIds from "./initializeIds";
import cleanupIds from "./cleanupIds";

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
  cleanupIds,
];
