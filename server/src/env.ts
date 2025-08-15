import dotenv from "dotenv";

dotenv.config();

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const ENV = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  SOLANA_RPC: req("QUICKNODE_RPC_URL"), // Use QuickNode RPC URL
  QUICKNODE_WEBHOOK_ID: req("QUICKNODE_WEBHOOK_ID"), // Add webhook ID
  MERCHANT_WALLET_ADDRESS: req("MERCHANT_WALLET_ADDRESS"),
  USDC_MINT: req("USDC_MINT"),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  CONFIRM_POLL_INTERVAL: parseInt(process.env.CONFIRM_POLL_INTERVAL || "5", 10),
  SOLANA_CLUSTER: (process.env.SOLANA_CLUSTER || "mainnet-beta") as
    | "mainnet-beta"
    | "devnet"
    | "testnet",
};