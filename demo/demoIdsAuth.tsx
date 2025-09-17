// demo/demoIdsAuth.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { WalletClient, CreateActionArgs, CreateActionResult } from "@bsv/sdk";
import { initializeIds } from "../src/utils/initializeIds";

const TAG = "[demo/demoIdsAuth]";

const App: React.FC = () => {
  const [wallet, setWallet] = React.useState<WalletClient | null>(null);
  const [status, setStatus] = React.useState<string>("Booting…");
  const [lastId, setLastId] = React.useState<string>("");

  // 1) Create the wallet client exactly like lab-l1 (no params → auto mode)
  React.useEffect(() => {
    const w = new WalletClient();
    setWallet(w);
    setStatus("WalletClient created (auto)");
    console.log(TAG, "WalletClient created (auto). Methods:", {
      hasCreateAction: !!(w as any)?.createAction,
      hasGetPublicKey: !!(w as any)?.getPublicKey,
    });
  }, []);

  // 2) Explicit connect (same spirit as lab; any first RPC will bind)
  const connectWallet = async () => {
    if (!wallet) return;
    setStatus("Connecting to wallet…");
    try {
      const { publicKey } = await wallet.getPublicKey({ identityKey: true });
      setStatus("Connected to wallet");
      console.log(TAG, "Connected. identity publicKey =", publicKey);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setStatus("Connect failed: " + msg);
      console.error(TAG, "Connect failed:", msg);
    }
  };

  // 3) Minimal createAction demo – straight from the lab example
  const createActionDemo = async () => {
    if (!wallet) return;
    setStatus("Creating demo action…");
    try {
      // Same simple locking script & 5-sat output used in the lab example
      const lockingScript =
        "2102aaa7a5a2e386840889732be8d8264d42198f116903ed9f8f2cc9763c0e9958acac0e4d7920666972737420746f6b656e0849276d204d6174744630440220187800c3732512ef3d3ccdf741966b45f4251f879ac933160837a03d1c98a420022064c4d3fb3c07b12c47aae5baef7890e996ffa680e32fb8aa678c7f06ff0d37bd6d75";

      const args: CreateActionArgs = {
        description: "Create a transaction",
        outputs: [
          {
            lockingScript,
            satoshis: 5,
            outputDescription: "Output transaction",
          },
        ],
      };

      const result: CreateActionResult = await wallet.createAction(args);
      console.log(TAG, "createAction result =", result);
      setStatus("Demo action created (check console)");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setStatus("createAction failed: " + msg);
      console.error(TAG, "createAction failed:", msg);
    }
  };

  // 4) Your existing initializeIds flow, now using the lab-style wallet
  const runInit = async (type: "payment" | "button") => {
    if (!wallet) return;
    setStatus(`Initializing ${type}Id…`);
    try {
      const res = await initializeIds(
        type,
        wallet,
        undefined,
        undefined,
        setLastId,
      );
      if (res.status === "success") {
        setStatus(`✅ ${type}Id initialized: ${res.id}`);
      } else {
        setStatus(`❌ ${res.message ?? "Unknown error"}`);
      }
      console.log(TAG, "initializeIds() result", res);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setStatus(`initializeIds failed: ${msg}`);
      console.error(TAG, "initializeIds failed:", msg);
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", lineHeight: 1.45 }}>
      <h3 style={{ marginTop: 0 }}>Initialize IDs (lab-style wallet)</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={connectWallet} disabled={!wallet}>
          Connect Wallet
        </button>
        <button onClick={createActionDemo} disabled={!wallet}>
          Run createAction demo
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => runInit("button")} disabled={!wallet}>
          Init Button ID
        </button>
        <button onClick={() => runInit("payment")} disabled={!wallet}>
          Init Payment ID
        </button>
      </div>

      <div>
        <strong>Status:</strong> {status}
      </div>
      <div style={{ marginTop: 6 }}>
        <strong>Last ID:</strong> <code>{lastId}</code>
      </div>
    </div>
  );
};

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("root");
  if (!el) {
    console.error("Missing #root element in HTML");
    return;
  }
  createRoot(el).render(<App />);
});
