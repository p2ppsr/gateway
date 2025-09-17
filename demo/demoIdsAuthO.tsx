// demo/demoIdsAuth.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { WalletClient } from "@bsv/sdk";
import { initializeIds } from "../src/utils/initializeIds";
import { loadClientConfig } from "../src/utils/clientConfig";
import { PORTS } from "../src/utils/constants";

declare global {
  interface Window {
    CONFIG?: { WALLET_ORIGIN?: string };
  }
}

async function tryBind(mode: "auto" | "http", origin: string) {
  console.log("[demo/demoIdsAuth] tryBind:", { mode, origin });
  const w = new WalletClient(mode as any, origin);
  await (w as any)?.ready?.();
  try {
    // if this succeeds, the wallet substrate is usable
    const { publicKey } = await w.getPublicKey({ identityKey: true });
    console.log("[demo/demoIdsAuth] bound:", { mode, origin, publicKey });
    return w;
  } catch (e: any) {
    console.warn("[demo/demoIdsAuth] bind failed:", {
      mode,
      origin,
      error: e?.message ?? String(e),
    });
    return null;
  }
}

const App: React.FC = () => {
  const [wallet, setWallet] = React.useState<WalletClient | null>(null);
  const [status, setStatus] = React.useState("Wallet: initializing…");
  const [lastId, setLastId] = React.useState<string>("");

  React.useEffect(() => {
    (async () => {
      try {
        const cfg = await loadClientConfig();
        const base =
          window.CONFIG?.WALLET_ORIGIN ||
          `http://localhost:${cfg.walletLocalPorts?.[0] ?? PORTS.WALLET_PRIMARY}`;

        console.log("[demo/demoIdsAuth] base from config:", base);

        // Some wallet bridges mount under a subpath. Try a few.
        const origins = [
          base, // e.g. http://localhost:3321
          `${base}/wallet`, // common
          `${base}/rpc`, // sometimes RPC lives here
          `${base}/v1`, // versioned
        ];

        let bound: WalletClient | null = null;

        // 1) Prefer backup behavior: AUTO first
        for (const origin of origins) {
          bound = await tryBind("auto", origin);
          if (bound) break;
        }

        // 2) If auto can’t find a substrate, force HTTP and retry
        if (!bound) {
          for (const origin of origins) {
            bound = await tryBind("http", origin);
            if (bound) break;
          }
        }

        if (!bound) {
          throw new Error("No wallet substrate responded (auto/http)");
        }

        setWallet(bound);
        setStatus("Wallet: ready");
      } catch (e: any) {
        console.error("[demo/demoIdsAuth] wallet init failed", e);
        setStatus("Wallet: failed — " + (e?.message ?? String(e)));
      }
    })();
  }, []);

  const run = async (type: "payment" | "button") => {
    if (!wallet) {
      setStatus("Wallet not ready");
      return;
    }
    setStatus(`Initializing ${type}Id… (signed)`);
    const res = await initializeIds(
      type,
      wallet,
      undefined,
      undefined,
      setLastId,
    );
    setStatus(
      res.status === "success"
        ? `✅ ${type}Id initialized: ${res.id}`
        : `❌ ${res.message ?? "Unknown error"}`,
    );
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", lineHeight: 1.45 }}>
      <h3 style={{ marginTop: 0 }}>
        Initialize IDs (signed via auth middleware)
      </h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => run("button")} disabled={!wallet}>
          Init Button ID
        </button>
        <button onClick={() => run("payment")} disabled={!wallet}>
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
  if (!el) return console.error("Missing #root element in HTML");
  createRoot(el).render(<App />);
});
