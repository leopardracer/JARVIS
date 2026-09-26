import { hmac, safeEqual } from "./secrets";
import type { BrokerDataMode } from "./types";

/** The order a user approved, field for field. */
export type OrderTicket = {
  actionId: string;
  approvalId: string;
  userId: string;
  side: "buy" | "sell";
  symbol: string;
  quantity: string;
  /** Limit price, or for paper orders the illustrative fill price. */
  price: string | null;
  provider: string;
  dataMode: BrokerDataMode;
  approvedAt: string;
  expiresAt: string;
};

/**
 * An order the user explicitly approved. Only `ApprovalSigner.sign` produces
 * one, and every order-capable provider verifies it before doing anything, so
 * there is no path from a model response (or any other code) to a broker
 * order without a recorded user approval.
 */
export type ApprovedAction = OrderTicket & { readonly signature: string };

const canonical = (t: OrderTicket) =>
  [t.actionId, t.approvalId, t.userId, t.side, t.symbol, t.quantity, t.price ?? "", t.provider, t.dataMode, t.approvedAt, t.expiresAt].join("|");

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export class ApprovalSigner {
  constructor(private readonly master: Buffer) {}

  sign(ticket: OrderTicket): ApprovedAction {
    return { ...ticket, signature: hmac(this.master, "approvals", canonical(ticket)) };
  }

  /** Throws unless the action is untouched since approval and still inside its window. */
  verify(action: ApprovedAction, expect: { provider: string; dataMode: BrokerDataMode }, now = new Date()): void {
    const { signature, ...ticket } = action;
    if (!signature || !safeEqual(signature, hmac(this.master, "approvals", canonical(ticket)))) {
      throw new ApprovalError("Order is not backed by a valid user approval");
    }
    if (ticket.provider !== expect.provider) throw new ApprovalError(`Order was approved for ${ticket.provider}, not ${expect.provider}`);
    if (ticket.dataMode !== expect.dataMode) throw new ApprovalError(`A ${ticket.dataMode} order cannot go to a ${expect.dataMode} brokerage`);
    if (now > new Date(ticket.expiresAt)) throw new ApprovalError("The approval has expired; review and approve again");
  }
}
