import { Keypair, PublicKey } from "@solana/web3.js";
import { merchantPubkey, usdcMint } from "./solana";
import type { CreatePaymentBody, OrderRecord, PaymentStatus } from "./types";

// In-memory demo store
const ORDERS = new Map<string, OrderRecord>();

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
    merchantPubkey: merchantPubkey.toBase58(),
    usdcMint: usdcMint.toBase58(),
  };
  ORDERS.set(orderId, rec);
  return rec;
}

export function getOrder(orderId: string) {
  return ORDERS.get(orderId);
}

export async function checkAndUpdateStatus({ amount, merchantPubkey: merchantPubkeyStr, usdcMint: usdcMintStr, signature }: { amount: number, merchantPubkey: string, usdcMint: string, signature: string }): Promise<PaymentStatus> {
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
      console.log("Stored order:", order);
    }
  }

  if (!matchingOrder) {
    console.log(`No pending order found matching amount ${amount}, merchant ${merchantPubkeyStr}, mint ${usdcMintStr}, signature ${signature.slice(0, 8)}...`);
    return "PENDING";
  }

  console.log(`[${matchingOrder.orderId}] checkAndUpdateStatus called for webhook, amount: ${amount}, signature: ${signature.slice(0, 8)}..., status: ${matchingOrder.status}`);
  
  if (matchingOrder.status === "PAID") {
    console.log(`[${matchingOrder.orderId}] Already PAID, returning`);
    return "PAID";
  }

  // Mark the matching order as PAID
  matchingOrder.status = "PAID";
  matchingOrder.backoffMs = 1000;
  matchingOrder.lastSeenSig = signature;
  ORDERS.set(matchingOrder.orderId, matchingOrder);
  console.log(`[${matchingOrder.orderId}] Matching USDC transfer found (${amount} USDC), marking as PAID`);
  return "PAID";
}