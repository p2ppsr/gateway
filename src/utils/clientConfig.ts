// // src/utils/clientConfig.ts
import { PORTS, CONFIG } from "./constants";
import { logWithTimestamp } from "./logging";

export interface ClientConfig {
  walletLocalPorts: number[];
  apiBase: string;
  routingPrefix: string;
  wellKnownPath: string;
  payJsUrl?: string;
  walletBase: string;
  serverIdentityKey: string;
}

export async function loadClientConfig(): Promise<ClientConfig> {
  const config: ClientConfig = {
    walletLocalPorts: [PORTS.WALLET_PRIMARY],
    apiBase: CONFIG.API_BASE,
    routingPrefix: "/api",
    wellKnownPath: "/.well-known/auth",
    payJsUrl: `${CONFIG.PAY_BASE}/pay.js`,
    walletBase: CONFIG.WALLET_ORIGIN,
    serverIdentityKey: CONFIG.SERVER_IDENTITY_KEY,
  };

  logWithTimestamp("clientConfig", "loadClientConfig result", config);
  return config;
}
