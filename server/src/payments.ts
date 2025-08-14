import { Keypair, PublicKey } from "@solana/web3.js";
import { connection, merchantPubkey, usdcMint } from "./solana";
import type { CreatePaymentBody, OrderRecord, PaymentStatus } from "./types";

// In-memory demo store
const ORDERS = new Map<string, OrderRecord>();

// Global parse concurrency (keep very small on public RPC)
const MAX_PARSE_CONCURRENCY = 2;
let parseInFlight = 0;

// Utility: small jitter (±300ms)
function jitter(ms: number) {
  const j = Math.floor(Math.random() * 600) - 300;
  return Math.max(0, ms + j);
}

export function buildSolanaPayUrl(
  recipient: PublicKey,
  amount: number,
  reference: PublicKey,
  label: string,
  message: string,
  memo: string,
  splToken: PublicKey
): string {
  const url = new URL(`solana:${recipient.toBase58()}`);
  url.searchParams.set("amount", amount.toFixed(2));
  url.searchParams.set("reference", reference.toBase58());
  url.searchParams.set("label", label);
  url.searchParams.set("message", message);
  url.searchParams.set("memo", memo);
  url.searchParams.set("spl-token", splToken.toBase58());
  return url.toString();
}

export function createOrder({ orderId, amount, merchantPubkey: merchantPubkeyStr, usdcMint: usdcMintStr }: CreatePaymentBody & { merchantPubkey?: string, usdcMint?: string }) {
  if (ORDERS.has(orderId)) return ORDERS.get(orderId)!;
  const reference = Keypair.generate().publicKey;
  const rec: OrderRecord = {
    orderId,
    amount,
    createdAt: Date.now(),
    status: "PENDING",
    reference: reference.toBase58(),
    lastCheckAt: 0,
    backoffMs: 1000,
    isChecking: false,
    lastSeenSig: undefined,
    merchantPubkey: merchantPubkeyStr || merchantPubkey.toBase58(),
    usdcMint: usdcMintStr || usdcMint.toBase58(),
  };
  ORDERS.set(orderId, rec);
  return rec;
}

export function getOrder(orderId: string) {
  return ORDERS.get(orderId);
}

export async function checkAndUpdateStatus({ amount, merchantPubkey: merchantPubkeyStr, usdcMint: usdcMintStr }: { amount: number, merchantPubkey: string, usdcMint: string }): Promise<PaymentStatus> {
  // Find the most recent pending order matching the amount
  let matchingOrder: OrderRecord | undefined;
  for (const order of ORDERS.values()) {
    if (
      order.status === "PENDING" &&
      order.amount >= amount - 0.01 &&
      order.amount <= amount + 0.01 &&
      order.merchantPubkey === merchantPubkeyStr &&
      order.usdcMint === usdcMintStr
    ) {
      // Prioritize the most recent order
      if (!matchingOrder || order.createdAt > matchingOrder.createdAt) {
        matchingOrder = order;
      }
    }
  }

  if (!matchingOrder) {
    console.log(`No pending order found matching amount ${amount}, merchant ${merchantPubkeyStr}, mint ${usdcMintStr}`);
    return "PENDING";
  }

  console.log(`[${matchingOrder.orderId}] checkAndUpdateStatus called for webhook, amount: ${amount}, status: ${matchingOrder.status}`);
  
  if (matchingOrder.status === "PAID") {
    console.log(`[${matchingOrder.orderId}] Already PAID, returning`);
    return "PAID";
  }

  // Mark the matching order as PAID
  matchingOrder.status = "PAID";
  matchingOrder.backoffMs = 1000;
  ORDERS.set(matchingOrder.orderId, matchingOrder);
  console.log(`[${matchingOrder.orderId}] Matching USDC transfer found (${amount} USDC), marking as PAID`);
  return "PAID";
}