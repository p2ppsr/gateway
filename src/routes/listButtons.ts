// Line 8: Update version and changelog
/**
 * @file src/routes/listButtons.ts
 *
 * GET route to list payment buttons for a merchant.
 * Retrieves paginated payment buttons from the payment_buttons table, joined with payments,
 * filtered by merchant_id and optional usage/excludeSingleUse parameters.
 *
 * Version: v2.65 (Updated 31Aug2025_1830 BST)
 * Change Log:
 * - 01Sep2025_0215 BST (v3.123): Updated to use derivation_prefix and derivation_suffix instead of transaction_id.
 * - 31Aug2025_1830 BST (v2.65): Confirmed description fallback using 'Payment using paymentId: <payment_id>'.
 * - 28Aug2025_0300 BST (v2.64): Fixed Used computation to rely on completed payments; removed paymentDesc query; kept button_id join.
 * - 28Aug2025_0200 BST (v2.63): Fixed logWithTimestamp syntax error; simplified used computation; removed paymentDesc query; ensured correct button_id join.
 * - 28Aug2025_0130 BST (v2.62): Simplified used computation; removed paymentDesc query; ensured correct button_id join; addressed duplicate entry issue.
 */
import knex, { Knex } from "knex";
import knexConfig from "../knexfile";
import type { Request, Response } from "express";
import { query } from "express-validator";
import { logWithTimestamp } from "../utils/logging";
import { formatId } from "../utils/general";
const F = "routes/listButtons";
const db: Knex = knex(knexConfig);
export default {
  type: "get",
  path: "/listButtons",
  middlewares: [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage("Limit must be an integer between 1 and 1000")
      .toInt(),
    query("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Offset must be a non-negative integer")
      .toInt(),
    query("sort")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort must be either asc or desc"),
    query("usage")
      .optional()
      .isIn(["used", "unused"])
      .withMessage("Usage must be either used or unused"),
    query("excludeSingleUse")
      .optional()
      .isBoolean()
      .withMessage("excludeSingleUse must be a boolean")
      .toBoolean(),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    logWithTimestamp(
      F,
      "🔍 [listButtons] Starting listButtons execution v2.64",
    );
    const errors = (req as any).validationErrors;
    if (errors && errors.length > 0) {
      logWithTimestamp(F, "❌ [listButtons] Validation errors:", errors);
      res.status(400).json({
        status: "error",
        message: "❌ Invalid query parameters",
        errors,
      });
      return;
    }
    const merchantId = (req as any).auth?.identityKey || "unknown";
    const {
      limit = 500,
      offset = 0,
      sort = "desc",
      usage,
      excludeSingleUseRaw,
    } = req.query;
    const excludeSingleUse =
      typeof excludeSingleUseRaw === "boolean"
        ? excludeSingleUseRaw
        : String(excludeSingleUseRaw).toLowerCase() === "true";
    const isUsageDefined = typeof usage === "string";
    let usageValue: "used" | "unused" | undefined;
    if (isUsageDefined) {
      usageValue = usage as "used" | "unused";
    }
    logWithTimestamp(F, "🔍 [listButtons] Fetching buttons for merchant:", {
      merchantId,
      limit,
      offset,
      sort,
      usage: usageValue,
      excludeSingleUse,
    });
    try {
      const logSql = (label: string, qb: Knex.QueryBuilder) => {
        const s = qb.clone().toSQL();
        logWithTimestamp(F, `📜 ${label} SQL:`, {
          sql: s.sql,
          bindings: s.bindings,
        });
      };
      const paymentsAgg = db("payments")
        .select("button_id")
        .sum<{ paidSum: number }>({ paidSum: "amount" })
        .where("completed", 1)
        .groupBy("button_id");
      logSql("paymentsAgg", paymentsAgg);
      let buttonQuery = db({ pb: "payment_buttons" })
        .leftJoin(paymentsAgg.as("pa"), "pb.button_id", "pa.button_id")
        .where("pb.merchant_id", merchantId)
        .whereNotNull("pb.button_id")
        .select(
          "pb.button_id as buttonId",
          "pb.payment_id as paymentId",
          "pb.amount",
          "pb.variable_amount as variableAmount",
          "pb.multi_use as multiUse",
          "pb.used as dbUsed",
          "pb.html_code as htmlCode",
          db.raw('COALESCE(pa.paidSum, 0) as "calculated_total"'),
          db.raw('COALESCE(pb.created_at, CURRENT_TIMESTAMP) as "createdAt"'),
          db.raw(
            'COALESCE(pb.updated_at, pb.created_at, CURRENT_TIMESTAMP) as "updatedAt"',
          ),
        )
        .orderBy("pb.created_at", "desc")
        .limit(500);
      logSql("buttonQuery", buttonQuery);
      if (excludeSingleUse) {
        buttonQuery = buttonQuery.where("pb.multi_use", true);
      }
      if (usageValue === "used") {
        buttonQuery = buttonQuery.whereExists(
          db("payments").where({
            button_id: db.raw("pb.button_id"),
            completed: 1,
          }),
        );
      } else if (usageValue === "unused") {
        buttonQuery = buttonQuery.whereNotExists(
          db("payments").where({
            button_id: db.raw("pb.button_id"),
            completed: 1,
          }),
        );
      }
      const preview = buttonQuery
        .clone()
        .orderBy("pb.created_at", sort as "asc" | "desc")
        .limit(Number(limit))
        .offset(Number(offset));
      logSql("listButtons(final)", preview);
      const rows = await buttonQuery
        .orderBy("pb.created_at", sort as "asc" | "desc")
        .limit(Number(limit))
        .offset(Number(offset));
      logWithTimestamp(F, "📊 [listButtons] Query executed", {
        rowCount: rows.length,
        descriptions: rows.map((row) => ({
          buttonId: row.buttonId,
          description: row.description,
          paymentId: row.paymentId,
        })),
      });
      if (rows.length === 0) {
        logWithTimestamp(
          F,
          "⚠️ [listButtons] No rows returned, checking database",
        );
        const totalCheck = await db("payment_buttons")
          .where("merchant_id", merchantId)
          .count<{ total: number }>("button_id as total")
          .first();
        logWithTimestamp(F, "🔎 [listButtons] Database check:", { totalCheck });
        res.status(200).json({
          status: "success",
          message: "No buttons found",
          title: "Payment Buttons",
          data: [],
          total: Number(totalCheck?.total ?? 0),
        });
        return;
      }
      if (rows[0]) {
        logWithTimestamp(F, "🔎 [listButtons] Sample row[0]:", rows[0]);
      }
      for (const button of rows) {
        const paymentsQuery = db("payments")
          .select(
            "payment_id as paymentId",
            "derivation_prefix as derivationPrefix",
            "derivation_suffix as derivationSuffix",
            "amount",
            "txid",
            "completed as completed",
            "created_at as createdAt",
            "description",
          )
          .where({ button_id: button.buttonId })
          .orderBy("created_at", "desc");
        logSql(`payments for button ${button.buttonId}`, paymentsQuery);
        button.payments = await paymentsQuery;
        const allPayments = await db("payments")
          .where({ button_id: button.buttonId, completed: 1 })
          .count<{ count: number }>("payment_id as count")
          .first();
        const paymentCount = allPayments?.count ?? 0;
        button.used = paymentCount > 0;
        logWithTimestamp(
          F,
          `Computed used field for button ${button.buttonId}:`,
          {
            computedUsed: button.used,
            dbUsed: button.dbUsed,
            calculated_total: button.calculated_total,
            paymentCount,
            payments: button.payments.map((p: any) => ({
              paymentId: p.paymentId,
              amount: p.amount,
              completed: p.completed,
            })),
          },
        );
        logWithTimestamp(F, `buttonId ${button.buttonId}:`, {
          paymentId: button.paymentId,
        });
        logWithTimestamp(F, `Payments for button ${button.buttonId}:`, {
          paymentCount: button.payments.length,
          payments: button.payments,
        });
      }
      const totalRow = await db("payment_buttons")
        .where("merchant_id", merchantId)
        .count<{ total: number }>("button_id as total")
        .first();
      const total = Number(totalRow?.total ?? 0);
      logWithTimestamp(F, "🧮 [listButtons] Total buttons:", { total });
      const safeButtons = rows.map((b: any) => ({
        buttonId: b.buttonId,
        merchantId,
        paymentId: b.paymentId ?? null,
        amount: b.amount ?? 0,
        htmlCode: b.htmlCode ?? "<div>Pay Now</div>",
        variableAmount: !!b.variableAmount,
        multiUse: !!b.multiUse,
        used: b.used,
        calculated_total: Number(b.calculated_total ?? 0),
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        payments: b.payments
          ? b.payments.map((p: any) => ({
              paymentId: p.paymentId,
              derivationPrefix: p.derivationPrefix,
              derivationSuffix: p.derivationSuffix,
              amount: p.amount,
              txid: p.txid ?? null,
              completed: !!p.completed,
              createdAt: p.createdAt,
              description:
                p.description ||
                `Payment using paymentId: ${formatId(p.paymentId)}`,
            }))
          : [],
      }));
      logWithTimestamp(
        F,
        "🔍 [listButtons] Verified calculated_total and payments for buttons:",
        {
          buttons: safeButtons.map((b: any) => ({
            buttonId: b.buttonId,
            calculated_total: b.calculated_total,
            used: b.used,
            multiUse: b.multiUse,
            paymentCount: b.payments.length,
          })),
        },
      );
      const paidSum = safeButtons.reduce(
        (acc: number, x: any) => acc + (Number(x.calculated_total) || 0),
        0,
      );
      logWithTimestamp(F, "💰 [listButtons] Sum calculated_total (page):", {
        paidSum,
      });
      logWithTimestamp(F, "✅ [listButtons] Buttons fetched successfully", {
        total,
        pagePaidSum: paidSum,
      });
      res.status(200).json({
        status: "success",
        message: "Buttons fetched successfully",
        title: "Payment Buttons",
        data: safeButtons,
        total,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logWithTimestamp(F, "❌ [listButtons] Error fetching buttons", {
        message,
        queryParams: req.query,
      });
      res.status(500).json({ status: "error", message: `❌ ${message}` });
    }
  },
};
