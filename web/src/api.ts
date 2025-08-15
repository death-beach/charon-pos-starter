import { PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config({ path: "server/.env" });

const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : "http://localhost:3000";
const merchantPubkey = new PublicKey(process.env.MERCHANT_WALLET_ADDRESS || "");
const usdcMint = new PublicKey(process.env.USDC_MINT || "");

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