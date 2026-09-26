# Robinhood integration

JARVIS only uses interfaces Robinhood documents publicly. No reverse-engineered
or private endpoints are used anywhere in this project.

| Interface | What it offers | Who can use it | Planned use |
| --- | --- | --- | --- |
| [Crypto Trading API](https://docs.robinhood.com/crypto/trading/) | Crypto accounts, holdings, orders, products, quotes; order placement | Robinhood Crypto customers in the US, with an API key created in account settings | `RobinhoodCryptoProvider` (Phase 3): read accounts, holdings, orders and quotes; submit orders only after an approved action |
| [Agentic Trading MCP](https://robinhood.com/us/en/support/articles/agentic-trading-overview/) (`agent.robinhood.com/mcp/trading`) | Read-only access to positions, balances and history; trading inside a dedicated Agentic account | Eligible US customers | Optional MCP connection (Phase 3+); the approval flow still applies |
| [Robinhood Chain](https://docs.robinhood.com/chain/) (chain ID 4663, testnet 46630) | Public onchain balances, transfers, Stock Token prices through Chainlink feeds | Anyone can read; Stock Tokens are not offered in the US, UK, Canada, Switzerland, Ukraine and other listed jurisdictions | `RobinhoodChainProvider`: read-only wallet positions and transactions |

Exact request paths, headers and signing are taken from the official
documentation when each provider is implemented, and recorded in the provider's
source with a link. Nothing is implemented from memory.

## Status

| Provider | State |
| --- | --- |
| `MockBrokerProvider` | Done. Fictional account; accepts signed paper orders in the demo workspace. |
| `RobinhoodChainProvider` | Done, read-only. Native ETH balance of a wallet address over JSON-RPC. No private keys are ever asked for. |
| `RobinhoodCryptoProvider` | Not implemented. The Crypto Trading API reference (request paths, the signed-request scheme) could not be read from docs.robinhood.com when Phase 3 was built, and third-party catalogs are not an acceptable source. Settings lists it as "Not available yet". |
| Agentic Trading MCP | Not implemented. |

Until an order-capable provider exists, a live approved action is a decision
record: JARVIS keeps the reasoning and the approval, and the user places the
order themselves.

## Provider contract

`BrokerProvider` (see `docs/interfaces.md`) exposes read methods and a single
`submitOrder` method. `submitOrder` accepts only an `ApprovedAction`, a type
that can be constructed solely by the approval service after the user
confirms. There is no code path from a model response to `submitOrder`.

## Development without credentials

`MockBrokerProvider` returns a deterministic fictional account (NVDA, AMD, ETH,
BTC) marked `dataMode: "demo"`. It is the default (`BROKER_PROVIDER=mock`).
