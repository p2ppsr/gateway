/**
 * @file src/routes/pay.ts
 * @description POST route to complete a payment by submitting a transaction, validating paymentId and buttonId, transaction format, and locking script, then updating the payments table.
 * @version 4.27.0 (Updated 03Sep2025_0013 BST to standardize header comment)
 * @author xAI (Grok 3)
 * @dependencies
 * - knex: For database operations
 * - express: For Request and Response types
 * - @bsv/sdk: For transaction validation and cryptographic operations
 * - ../utils/logging: For logWithTimestamp
 * @changelog
 * - 03Sep2025_0013 BST (v4.27.0): Updated header comment to follow standardized template.
 */
const F = "routes/pay";
import knex, { Knex } from "knex";
import knexConfig from "../knexfile";
import {
  Hash,
  P2PKH,
  PrivateKey,
  PublicKey,
  Transaction,
  Utils,
} from "@bsv/sdk";
import { Request, Response } from "express";
import { logWithTimestamp } from "../utils/logging";
const db: Knex = knex(knexConfig);
let payment: Payment | undefined; // Declare payment outside try block for broader scope
interface Payment {
  payment_id: string;
  button_id: string;
  payer_id: string | null;
  merchant_id: string;
  amount: number;
  completed: boolean;
  derivation_prefix: string;
  derivation_suffix: string;
  txid: string | null;
}
interface RequestBody {
  paymentId: string; // Client-passed paymentId referencing ids.id with type='payment'
  buttonId: string; // Client-passed buttonId referencing ids.id with type='button'
  transaction: {
    txid: string;
    atomicBeefTx: string;
  };
  lockingScript?: string;
  amount?: number; // Added to support variable button amount
}
interface AuthRequest extends Request {
  auth: {
    identityKey: string;
  };
}
export default {
  type: "post" as const,
  path: "/pay",
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp(F, "🔍 [pay] Received pay request:", req.body);
    const {
      paymentId,
      buttonId,
      transaction,
      lockingScript,
      amount,
    }: RequestBody = req.body;
    logWithTimestamp(F, "🔍 [pay] Received paymentId and buttonId:", {
      paymentId,
      buttonId,
    });
    try {
      // Validate that paymentId exists in ids with type='payment'
      const paymentIdRecord = await db("ids")
        .where({ id: paymentId, type: "payment" })
        .first();
      if (!paymentIdRecord) {
        logWithTimestamp(
          F,
          "❌ [pay] Invalid paymentId: not found in ids with type=payment:",
          { paymentId },
        );
        res.status(400).json({
          status: "error",
          message:
            "Invalid paymentId: must reference an existing ids record with type=payment",
        });
        return;
      }
      // Validate that buttonId exists in ids with type='button'
      const buttonIdRecord = await db("ids")
        .where({ id: buttonId, type: "button" })
        .first();
      if (!buttonIdRecord) {
        logWithTimestamp(
          F,
          "❌ [pay] Invalid buttonId: not found in ids with type=button:",
          { buttonId },
        );
        res.status(400).json({
          status: "error",
          message:
            "Invalid buttonId: must reference an existing ids record with type=button",
        });
        return;
      }
      // Assign payment from database query
      payment = await db("payments")
        .where({
          payment_id: paymentId,
          button_id: buttonId,
          completed: false,
        })
        .first();
      if (!payment) {
        logWithTimestamp(
          F,
          "❌ [pay] Payment not found or already completed:",
          { paymentId, buttonId },
        );
        res.status(404).json({
          status: "error",
          message: "Payment not found or already completed",
        });
        return;
      }
      const paymentRec: Payment = payment as Payment; // Local non-undefined alias
      logWithTimestamp(F, "🔍 [pay] Retrieved payment record:", paymentRec);
      if (paymentRec.merchant_id !== req.auth.identityKey) {
        logWithTimestamp(
          F,
          "❌ [pay] Payment not originated by the same user:",
          {
            merchant_id: paymentRec.merchant_id,
            identityKey: req.auth.identityKey,
          },
        );
        res.status(401).json({
          status: "error",
          message: "Payment not originated by the same user",
        });
        return;
      }
      const { txid, atomicBeefTx } = transaction;
      if (
        !txid ||
        !atomicBeefTx ||
        typeof atomicBeefTx !== "string" ||
        !/^[0-9a-fA-F]+$/.test(atomicBeefTx)
      ) {
        throw new Error(
          "❌ Invalid transaction: txid or atomicBeefTx missing or invalid",
        );
      }
      let bsvtx: Transaction;
      try {
        const txArray: number[] = Utils.toArray(atomicBeefTx, "hex");
        bsvtx = Transaction.fromAtomicBEEF(txArray);
      } catch (e: unknown) {
        throw new Error(
          "❌ Invalid transaction format: unable to parse atomicBeefTx",
        );
      }
      if (!bsvtx.outputs || bsvtx.outputs.length === 0) {
        throw new Error("❌ Invalid transaction: no outputs available");
      }
      if (bsvtx.id("hex") !== txid) {
        throw new Error("❌ Transaction ID mismatch");
      }
      if (!lockingScript) {
        throw new Error("❌ Missing lockingScript in request");
      }
      logWithTimestamp(
        F,
        "🔍 [pay] Using client-provided lockingScript:",
        lockingScript,
      );
      // BRC29
      const senderPrivateKey: PrivateKey = paymentRec.payer_id
        ? new PrivateKey(paymentRec.payer_id, "hex")
        : new PrivateKey(
            "0000000000000000000000000000000000000000000000000000000000000001",
            "hex",
          ); // Fallback if payer_id is null
      const recipientPublicKey: PublicKey = PublicKey.fromString(
        paymentRec.merchant_id,
      );
      const invoiceNumber: string = `2-3241645161d8-${paymentRec.derivation_prefix} ${paymentRec.derivation_suffix}`;
      const senderPrivateKeyString: string = senderPrivateKey.toString();
      const recipientPublicKeyString: string = recipientPublicKey.toString();
      const combined: number[] = Utils.toArray(
        `${senderPrivateKeyString}${recipientPublicKeyString}${invoiceNumber}`,
        "utf8",
      );
      const derivedHash: number[] = Array.from(
        Hash.sha256(Hash.sha256(combined)),
      );
      const derivedPriv: PrivateKey = new PrivateKey(
        Utils.toHex(derivedHash),
        "hex",
      );
      const derivedPublicKey: string = derivedPriv.toPublicKey().toString();
      const pkh: P2PKH = new P2PKH();
      const derivedScript: string = pkh
        .lock(PublicKey.fromString(derivedPublicKey).toHash())
        .toHex();
      const button = await db("payment_buttons")
        .where({ button_id: buttonId })
        .first();
      if (!button) {
        logWithTimestamp(F, "❌ [pay] Button not found:", { buttonId });
        res.status(404).json({
          status: "error",
          message: "Button not found in payment_buttons",
        });
        return;
      }
      // Validate lockingScript
      if (lockingScript !== derivedScript) {
        logWithTimestamp(F, "❌ [pay] Locking script mismatch:", {
          client: lockingScript,
          server: derivedScript,
        });
        res
          .status(400)
          .json({
            status: "error",
            message:
              "Invalid lockingScript: does not match server-derived script",
          });
        return;
      }
      // Validate transaction output
      // Line above: logWithTimestamp(F, '🔍 [pay] Using client-provided lockingScript:', lockingScript)
      const expectedAmount = button.variable_amount
        ? Number(req.body.amount) || paymentRec.amount
        : button.amount;
      logWithTimestamp(F, "🔍 [pay] Expected amount (sats):", {
        expectedAmount,
        providedAmount: req.body.amount,
        paymentAmount: paymentRec.amount,
      });
      // Line below: if (expectedAmount <= 0)
      if (expectedAmount <= 0) {
        logWithTimestamp(F, "❌ [pay] Invalid amount from transaction:", {
          expectedAmount,
        });
        res.status(400).json({
          status: "error",
          message: "Invalid amount in transaction",
        });
        return;
      }
      logWithTimestamp(F, "🔍 [pay] Derived locking script:", derivedScript);
      logWithTimestamp(F, "🔍 [pay] Expected amount (sats):", expectedAmount);
      const matchingOutput = bsvtx.outputs.find(
        (x: Transaction["outputs"][number]): boolean =>
          x.lockingScript.toHex() === lockingScript &&
          x.satoshis === expectedAmount,
      );
      if (!matchingOutput) {
        bsvtx.outputs.forEach(
          (out: Transaction["outputs"][number], i: number): void => {
            logWithTimestamp(
              F,
              `🔍 Output ${i} script:`,
              out.lockingScript.toHex(),
            );
            logWithTimestamp(F, `🔍 Output ${i} sats:`, out.satoshis);
          },
        );
        res.status(400).json({
          status: "error",
          message:
            "The transaction does not satisfy the invoice or amount mismatch",
        });
        return;
      }
      logWithTimestamp(F, "✅ [pay] Matching output found:", {
        script: matchingOutput.lockingScript.toHex(),
        satoshis: expectedAmount,
      });
      await db.transaction(async (trx: Knex.Transaction) => {
        const existingPayment = await trx("payments")
          .where({ payment_id: paymentId, button_id: buttonId })
          .first();
        if (!existingPayment) {
          logWithTimestamp(F, "❌ [pay] Payment record not found:", {
            paymentId,
            buttonId,
          });
          res
            .status(404)
            .json({ status: "error", message: "Payment record not found" });
          return;
        }
        if (existingPayment.completed) {
          logWithTimestamp(F, "❌ [pay] Payment already completed:", {
            paymentId,
            buttonId,
          });
          res
            .status(400)
            .json({ status: "error", message: "Payment already completed" });
          return;
        }
        const button = await trx("payment_buttons")
          .where({ button_id: buttonId })
          .first();
        if (!button) {
          logWithTimestamp(F, "❌ [pay] Button not found:", { buttonId });
          res
            .status(404)
            .json({ status: "error", message: "Button not found" });
          return;
        }
        await trx("payments")
          .where({ payment_id: paymentId, button_id: buttonId })
          .update({
            completed: true,
            blockchain_transaction: JSON.stringify({ txid, atomicBeefTx }),
            txid: txid,
            amount: expectedAmount,
            updated_at: trx.fn.now(),
          });
        if (!button.multi_use) {
          await trx("payment_buttons")
            .where({ button_id: buttonId })
            .update({ used: true, updated_at: trx.fn.now() });
          logWithTimestamp(F, "✅ [pay] Marked single-use button as used:", {
            buttonId,
          });
        }
        logWithTimestamp(F, "✅ [pay] Updated payment:", {
          paymentId,
          buttonId,
          multi_use: button.multi_use,
        });
      });
      logWithTimestamp(F, `✅ [pay] Payment successful. TXID: ${txid}`);
      const responseData = {
        status: "success",
        message: "Payment completed successfully",
        txid,
      };
      logWithTimestamp(F, "🔍 [pay] Response data:", responseData);
      res.status(200).json(responseData);
      return;
    } catch (error: unknown) {
      const derivationForLog =
        payment &&
        "derivation_prefix" in payment &&
        "derivation_suffix" in payment
          ? `${payment.derivation_prefix} ${payment.derivation_suffix}`
          : "N/A";
      logWithTimestamp(F, "❌ [pay] Error processing payment:", {
        message: error instanceof Error ? error.message : "❌ Unknown error",
        stack: error instanceof Error ? error.stack : "❌ No stack trace",
        requestBody: req.body,
        derivation_prefix: payment?.derivation_prefix,
        derivation_suffix: payment?.derivation_suffix,
      });
      res.status(500).json({
        status: "error",
        message: `❌ Internal server error: ${error instanceof Error ? error.message : "Unknown error"} (derivations: ${derivationForLog})`,
      });
      return;
    }
  },
};
