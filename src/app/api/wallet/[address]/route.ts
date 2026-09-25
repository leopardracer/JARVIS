import { getNativeBalance, parseAddress, type Network } from "@/lib/chain";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/wallet/[address]">,
) {
  const { address: raw } = await ctx.params;
  const address = parseAddress(raw);
  if (!address) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }

  const param = new URL(request.url).searchParams.get("network");
  const network: Network = param === "testnet" ? "testnet" : "mainnet";

  try {
    return Response.json(await getNativeBalance(network, address));
  } catch (error) {
    console.error("RPC error", error);
    return Response.json(
      { error: "Could not reach Robinhood Chain RPC" },
      { status: 502 },
    );
  }
}
