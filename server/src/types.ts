export type PaymentStatus = "PENDING" | "PAID";

export interface CreatePaymentBody {
  orderId: string;
  amount: number; // decimal units (e.g., 12.50)
}

export interface OrderRecord {
  orderId: string;
  amount: number; // as above
  createdAt: number;
  status: PaymentStatus;
  reference: string; // base58 public key acting as reference
  // Throttling / control fields
  lastCheckAt?: number;   // ms timestamp of last RPC attempt
  backoffMs?: number;     // current backoff (starts low, doubles on 429)
  isChecking?: boolean;   // guard against concurrent RPC calls
  lastSeenSig?: string;   // newest signature we've already parsed
}
