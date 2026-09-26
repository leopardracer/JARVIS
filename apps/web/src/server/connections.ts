import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { RobinhoodChainProvider, syncBrokerAccounts, type SecretBox } from "@jarvis/broker";
import { schema, type Database } from "@jarvis/db";
import type { MemoryService } from "@jarvis/memory";
import { walletConnectionSchema } from "@jarvis/types";
import { HttpError } from "./errors";
import { ensureAsset } from "./theses";

type Deps = { db: Database; memory: MemoryService; secrets: SecretBox };
type WalletCredentials = { address: `0x${string}`; network: "mainnet" | "testnet" };

const { brokerConnections, users } = schema;

/** Connections as the browser may see them: never the sealed credentials. */
export async function listConnections(db: Database, userId: string) {
  const safeColumns = Object.fromEntries(Object.entries(getTableColumns(brokerConnections)).filter(([k]) => k !== "encryptedCredentials")) as Omit<ReturnType<typeof getTableColumns<typeof brokerConnections>>, "encryptedCredentials">;
  return db.select(safeColumns).from(brokerConnections).where(eq(brokerConnections.userId, userId)).orderBy(desc(brokerConnections.createdAt));
}

async function requireLive(db: Database, userId: string) {
  const [u] = await db.select({ mode: users.mode }).from(users).where(eq(users.id, userId));
  if (u?.mode !== "live") throw new HttpError(403, "The demo workspace cannot connect real accounts, so demo and live data never mix. Create an account to connect one.");
}

export async function addWalletConnection(deps: Deps, userId: string, raw: unknown) {
  await requireLive(deps.db, userId);
  const input = walletConnectionSchema.parse(raw);
  const credentials: WalletCredentials = { address: input.address as `0x${string}`, network: input.network };
  const [row] = await deps.db
    .insert(brokerConnections)
    .values({
      userId,
      provider: "robinhood-chain",
      label: input.label || `Robinhood Chain ${input.network}`,
      encryptedCredentials: deps.secrets.seal(credentials),
      metadata: { address: `${input.address.slice(0, 6)}…${input.address.slice(-4)}`, network: input.network, readOnly: true },
      dataMode: "live",
    })
    .returning();
  await deps.memory.recordActivity(userId, "connection_added", "connection", row.id, `Connected ${row.label} (read-only)`);
  return row.id;
}

export async function removeConnection(deps: Deps, userId: string, id: string) {
  const rows = await deps.db.delete(brokerConnections).where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId))).returning();
  if (!rows.length) throw new HttpError(404, "Connection not found");
  await deps.memory.recordActivity(userId, "connection_removed", "connection", null, `Disconnected ${rows[0].label}`);
}

/** Read balances through the connection and store them as live positions. */
export async function syncConnection(deps: Deps, userId: string, id: string, opts: { client?: ConstructorParameters<typeof RobinhoodChainProvider>[2] } = {}) {
  const [conn] = await deps.db.select().from(brokerConnections).where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)));
  if (!conn) throw new HttpError(404, "Connection not found");
  if (conn.provider !== "robinhood-chain") throw new HttpError(422, `Syncing ${conn.provider} is not available`);
  const creds = deps.secrets.open<WalletCredentials>(conn.encryptedCredentials);
  const provider = new RobinhoodChainProvider(creds.address, creds.network, opts.client);
  try {
    const [result] = await syncBrokerAccounts({
      db: deps.db,
      userId,
      provider,
      resolveAsset: async (a) => (await ensureAsset(deps.memory, userId, a.symbol, a.name)).id,
    });
    await deps.db.update(brokerConnections).set({ status: "active", lastError: null, lastSyncedAt: new Date(), portfolioId: result.portfolioId }).where(eq(brokerConnections.id, id));
    await deps.memory.recordActivity(userId, "portfolio_synced", "portfolio", result.portfolioId, `Synced ${conn.label}: ${result.positions} position${result.positions === 1 ? "" : "s"}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0].slice(0, 300) : "Unknown error";
    await deps.db.update(brokerConnections).set({ status: "error", lastError: message }).where(eq(brokerConnections.id, id));
    throw new HttpError(502, `Could not read the wallet: ${message}`);
  }
}
