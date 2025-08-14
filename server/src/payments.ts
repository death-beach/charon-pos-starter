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

export function createOrder({ orderId, amount }: CreatePaymentBody) {
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
  };
  ORDERS.set(orderId, rec);
  return rec;
}

export function getOrder(orderId: string) {
  return ORDERS.get(orderId);
}

export async function checkAndUpdateStatus(order: OrderRecord): Promise<PaymentStatus> {
  console.log(`[${order.orderId}] checkAndUpdateStatus called, current status: ${order.status}`);
  
  if (order.status === "PAID") {
    console.log(`[${order.orderId}] Already PAID, returning`);
    return "PAID";
  }

  // Warm-up: avoid hammering right after create
  if (Date.now() - order.createdAt < 2000) {
    console.log(`[${order.orderId}] In warmup period, skipping check`);
    return order.status;
  }

  const now = Date.now();
  order.backoffMs = order.backoffMs ?? 1000;
  order.lastCheckAt = order.lastCheckAt ?? 0;

  // Respect backoff + jitter
  const backoffTime = jitter(order.backoffMs);
  const timeSinceLastCheck = now - order.lastCheckAt;
  if (timeSinceLastCheck < backoffTime) {
    console.log(`[${order.orderId}] In backoff period: ${timeSinceLastCheck}ms < ${backoffTime}ms, current backoff: ${order.backoffMs}ms`);
    return order.status;
  }

  // De-duplicate overlapping polls
  if (order.isChecking) {
    console.log(`[${order.orderId}] Already checking, skipping`);
    return order.status;
  }
  
  console.log(`[${order.orderId}] Starting RPC check, backoff: ${order.backoffMs}ms`);
  order.isChecking = true;

  try {
    order.lastCheckAt = now;

    // ONE cheap RPC per poll
    const refKey = new PublicKey(order.reference);
    console.log(`[${order.orderId}] Making getSignaturesForAddress call for ${refKey.toBase58()}`);
    let sigInfos;
    try {
      sigInfos = await connection.getSignaturesForAddress(refKey, { limit: 1 });
      console.log(`[${order.orderId}] getSignaturesForAddress success, found ${sigInfos.length} signatures`);
    } catch (e: any) {
      const msg = String(e?.message || e);
      console.error(`[${order.orderId}] getSignaturesForAddress failed: ${msg}`);
      if (msg.includes("429") || msg.toLowerCase().includes("too many requests")) {
        order.backoffMs = Math.min((order.backoffMs || 1000) * 2, 60000);
        console.log(`[${order.orderId}] Rate limited on getSignaturesForAddress, new backoff: ${order.backoffMs}ms`);
        return order.status;
      }
      throw e; 
    }
    const newest = sigInfos[0]?.signature;

    if (!newest) {
      // No signatures at all yet — gentle increase, capped
      order.backoffMs = Math.min(Math.floor(order.backoffMs * 1.25), 15000);
      console.log(`[${order.orderId}] No signatures found, new backoff: ${order.backoffMs}ms`);
      return order.status;
    }

    if (order.lastSeenSig === newest) {
      // Nothing new since last check — keep it cheap
      order.backoffMs = Math.min(order.backoffMs + 250, 15000);
      console.log(`[${order.orderId}] Same signature as last check (${newest.slice(0,8)}...), new backoff: ${order.backoffMs}ms`);
      return order.status;
    }

    // Only parse when we see a NEW signature
    if (parseInFlight >= MAX_PARSE_CONCURRENCY) {
      // Too many parses in flight — skip this round gracefully
      order.backoffMs = Math.min(order.backoffMs + 500, 15000);
      console.log(`[${order.orderId}] Parse concurrency limit hit (${parseInFlight}/${MAX_PARSE_CONCURRENCY}), new backoff: ${order.backoffMs}ms`);
      return order.status;
    }

    console.log(`[${order.orderId}] New signature found (${newest.slice(0,8)}...), parsing transaction`);
    order.lastSeenSig = newest;
    parseInFlight++;
    try {
      let tx;
      try {
        tx = await connection.getParsedTransaction(newest, {
          maxSupportedTransactionVersion: 0,
        });
        console.log(`[${order.orderId}] getParsedTransaction success`);
      } catch (e: any) {
        const msg = String(e?.message || e);
        console.error(`[${order.orderId}] getParsedTransaction failed: ${msg}`);
        if (msg.includes("429") || msg.toLowerCase().includes("too many requests")) {
          order.backoffMs = Math.min((order.backoffMs || 1000) * 2, 60000);
          console.log(`[${order.orderId}] Rate limited on getParsedTransaction, new backoff: ${order.backoffMs}ms`);
          return order.status;
        }
        throw e;
      }
      if (!tx) {
        order.backoffMs = Math.min(order.backoffMs + 1000, 20000);
        return order.status;
      }

      // Extract account keys (version-tolerant)
      const msgAny = tx.transaction.message as any;
      const acctKeys: string[] = (msgAny.accountKeys || []).map((k: any) =>
        typeof k?.pubkey === "string" ? k.pubkey : typeof k?.toBase58 === "function" ? k.toBase58() : String(k)
      );
      if (!acctKeys.includes(merchantPubkey.toBase58())) {
        order.backoffMs = Math.min(order.backoffMs + 500, 15000);
        return order.status;
      }

      // Token delta check (USDC to merchant)
      const post = tx.meta?.postTokenBalances ?? [];
      const pre = tx.meta?.preTokenBalances ?? [];
      const delta = new Map<string, number>();
      for (const b of pre)  if (b.mint === usdcMint.toBase58()) delta.set(b.owner!, (delta.get(b.owner!) || 0) - Number(b.uiTokenAmount.uiAmountString || 0));
      for (const b of post) if (b.mint === usdcMint.toBase58()) delta.set(b.owner!, (delta.get(b.owner!) || 0) + Number(b.uiTokenAmount.uiAmountString || 0));

      const merchantDelta = delta.get(merchantPubkey.toBase58()) || 0;
      if (merchantDelta >= order.amount - 0.001) {
        order.status = "PAID";
        order.backoffMs = 1000; // reset for any future checks
        ORDERS.set(order.orderId, order);
        return "PAID";
      }

      // Not the matching transfer — small increase
      order.backoffMs = Math.min(order.backoffMs + 500, 15000);
      return "PENDING";
    } finally {
      parseInFlight = Math.max(0, parseInFlight - 1);
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(`[${order.orderId}] Outer catch block - Error: ${msg}`);
    // Handle rate limits with exponential backoff, but NEVER throw
    if (msg.includes("429") || msg.toLowerCase().includes("too many requests")) {
      order.backoffMs = Math.min((order.backoffMs || 1000) * 2, 60000);
      console.log(`[${order.orderId}] Rate limited in outer catch, new backoff: ${order.backoffMs}ms`);
      return order.status;
    }
    // Other errors: modest backoff
    order.backoffMs = Math.min((order.backoffMs || 1000) * 1.5, 30000);
    console.log(`[${order.orderId}] Other error in outer catch, new backoff: ${order.backoffMs}ms`);
    return order.status;
  } finally {
    order.isChecking = false;
    order.lastCheckAt = Date.now();
    ORDERS.set(order.orderId, order);
    console.log(`[${order.orderId}] Check completed, final backoff: ${order.backoffMs}ms`);
  }
}
