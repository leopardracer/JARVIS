import { MockBrokerProvider } from "./mock";
import type { BrokerProvider } from "./types";

export type BrokerEnv = Record<string, string | undefined>;

/** BROKER_PROVIDER=mock (default). Live providers are configured per user connection. */
export function createBrokerProvider(env: BrokerEnv = process.env): BrokerProvider {
  const name = env.BROKER_PROVIDER ?? "mock";
  if (name === "mock") return new MockBrokerProvider();
  throw new Error(`Unknown BROKER_PROVIDER "${name}". Live brokerages are connected per user in Settings.`);
}
