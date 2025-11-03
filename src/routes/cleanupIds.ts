/**
 * @file src/routes/cleanupIds.ts
 * @description
 * POST route to clean up orphaned IDs from the ids table for a given merchant.
 * Used when createButton fails to ensure no dangling IDs remain.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import { Knex } from "knex";
import type { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { logWithTimestamp } from "../utils/logging";
import knexConfig from "../knexfile";

const F = "routes/cleanupIds";
const db: Knex = require("knex")(knexConfig);

interface RequestBody {
  buttonId: string;
  paymentId: string;
  merchantId: string;
}

// ------------------ cleanupIds route ------------------
export default {
  type: "post",
  path: "/cleanupIds",
  middlewares: [
    body("buttonId")
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage("buttonId must be a non-empty string")
      .isLength({ min: 12, max: 24 })
      .withMessage("buttonId must be between 12 and 24 characters"),
    body("paymentId")
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage("paymentId must be a non-empty string")
      .isLength({ min: 12, max: 24 })
      .withMessage("paymentId must be between 12 and 24 characters"),
    body("merchantId")
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage("merchantId must be a non-empty string")
      .isLength({ min: 1, max: 66 })
      .withMessage("merchantId must be between 1 and 66 characters"),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWithTimestamp(F, "❌ [cleanupIds] Validation errors:", errors.array());
      res.status(400).json({
        status: "error",
        message: "❌ Invalid parameters",
        errors: errors.array(),
      });
      return;
    }

    const { buttonId, paymentId, merchantId }: RequestBody = req.body;
    const allowFallback =
      (process.env.ALLOW_UNAUTH_FALLBACK ?? "").toLowerCase() === "yes";
    logWithTimestamp(F, "⚙️ [cleanupIds] Starting cleanup", {
      buttonId,
      paymentId,
      merchantId,
      allowFallback,
    });

    try {
      await db.transaction(async (trx) => {
        await db("ids")
          .transacting(trx)
          .where({ id: paymentId, type: "payment", merchant_id: merchantId })
          .delete();
        await db("ids")
          .transacting(trx)
          .where({ id: buttonId, type: "button", merchant_id: merchantId })
          .delete();
        logWithTimestamp(F, "✅ [cleanupIds] Cleaned up orphaned IDs:", {
          paymentId,
          buttonId,
          merchantId,
        });
      });

      // In fallback mode, short-circuit success to avoid frontend peer send
      if (allowFallback) {
        logWithTimestamp(
          F,
          "⚠️ [cleanupIds] Skipping peer messaging (ALLOW_UNAUTH_FALLBACK=yes)",
        );
      }

      res.status(200).json({
        status: "success",
        message: "Orphaned IDs cleaned up successfully",
        paymentId,
        buttonId,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "❌ Unknown error";
      logWithTimestamp(F, "❌ [cleanupIds] Error cleaning up IDs:", {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : "❌ No stack trace",
        requestBody: req.body,
      });
      res.status(500).json({ status: "error", message: `❌ ${errorMessage}` });
    }
  },
};
