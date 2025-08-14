const BASE = "http://localhost:3001";
import { PublicKey } from "@solana/web3.js";

const merchantPubkey = new PublicKey("5s8eKrWLo2Z3hJKaBjDxCTEHNDuskEk3rNvRMNmoK5bD");
const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function createPayment(orderId: string, amount: number) {
  const r = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      orderId, 
      amount,
      merchantPubkey: merchantPubkey.toBase58(),
      usdcMint: usdcMint.toBase58()
    }),
  });
  let data: any = {};
  try { data = await r.json(); } catch {}
  if (!("orderId" in data)) throw new Error(data?.error || "createPayment failed");
  return data;
}

export async function getStatus(orderId: string) {
  const r = await fetch(`${BASE}/payments/${orderId}/status`);
  let data: any = { status: "PENDING" };
  try { data = await r.json(); } catch {}
  return data; // soft response even if server had issues
}