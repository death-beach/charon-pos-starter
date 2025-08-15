export type PaymentStatus = "PENDING" | "PAID";

export interface CreatePaymentBody {
  orderId: string;
  amount: number; // decimal units (e.g., 12.50)
  merchantPubkey?: string; // base58 public key of merchant wallet
  usdcMint?: string; // base58 public key of USDC mint
}

export interface OrderRecord {
  orderId: string;
  amount: number; // as above
  createdAt: number;
  status: PaymentStatus;
  reference: string; // base58 public key acting as reference
  merchantPubkey: string; // base58 public key of merchant wallet
  usdcMint: string; // base58 public key of USDC mint
  lastCheckAt?: number; // ms timestamp of last RPC attempt
  backoffMs?: number; // current backoff (starts low, doubles on 429)
  isChecking?: boolean; // guard against concurrent RPC calls
  lastSeenSig?: string; // newest signature we've already parsed
}

export interface QuickNodeWebhookPayload {
  block: {
    blockTime: number;
  };
  transactions: Array<{
    raw: {
      meta: {
        postTokenBalances?: Array<{
          mint: string;
          owner: string;
          uiTokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number;
            uiAmountString: string;
          };
        }>;
        preTokenBalances?: Array<{
          mint: string;
          owner: string;
          uiTokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number;
            uiAmountString: string;
          };
        }>;
      };
      transaction: {
        signatures: string[];
      };
    };
  }>;
}