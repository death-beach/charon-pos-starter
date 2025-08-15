import { Connection, PublicKey } from "@solana/web3.js";
import { ENV } from "./env";

export const connection = new Connection(ENV.SOLANA_RPC, "confirmed");
export const merchantPubkey = new PublicKey(ENV.MERCHANT_WALLET_ADDRESS);
export const usdcMint = new PublicKey(ENV.USDC_MINT);