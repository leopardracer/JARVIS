import { syncBrokerAccounts } from "@jarvis/broker";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle } from "@/server/http";
import { ensureAsset } from "@/server/theses";

/**
 * Sync the demo brokerage. Everything it returns is fictional and stored with
 * data_mode = demo. Live brokerages sync through their own connection (Phase 3).
 */
export const POST = handle(async () => {
  const user = await requireUser();
  const { db, memory, insights, demoBroker } = await services();
  const results = await syncBrokerAccounts({
    db,
    userId: user.id,
    provider: demoBroker,
    resolveAsset: async (a) => (await ensureAsset(memory, user.id, a.symbol, a.name)).id,
    positionsFromLedger: true,
  });
  const added = results.reduce((s, r) => s + r.transactionsAdded, 0);
  await memory.recordActivity(user.id, "portfolio_synced", "portfolio", results[0]?.portfolioId ?? null, `Synced ${demoBroker.name} brokerage: ${added} new transactions`);
  await audit(user.id, "portfolio.sync", { provider: demoBroker.name, dataMode: demoBroker.dataMode, added });
  const run = await insights.run(user.id);
  return Response.json({ added, positions: results.reduce((s, r) => s + r.positions, 0), insights: run.created.length });
});
