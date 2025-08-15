import express, { type Request, type Response } from "express";
import cors from "cors";
import { ENV } from "./env";
import { buildSolanaPayUrl, createOrder, getOrder, checkAndUpdateStatus } from "./payments";
import { merchantPubkey, usdcMint } from "./solana";
import { toDataUrl } from "./qr";
import type { CreatePaymentBody, QuickNodeWebhookPayload } from "./types";

const app = express();
app.use(express.json());
app.use(cors({ origin: ENV.CORS_ORIGIN }));

// Create payment (soft-fail)
app.post("/payments", async (req: Request, res: Response) => {
  console.log("POST /payments called with body:", req.body);
  try {
    const body = req.body as CreatePaymentBody & { merchantPubkey: string, usdcMint: string };
    if (!body?.orderId || typeof body.amount !== "number" || !body.merchantPubkey || !body.usdcMint) {
      console.log("Invalid request body:", body);
      return res.status(400).json({ error: "orderId, amount, merchantPubkey, and usdcMint required" });
    }
    console.log(`Creating order ${body.orderId} for amount ${body.amount}`);
    const order = createOrder(body);
    const { PublicKey } = await import("@solana/web3.js");
    const solanaPayUrl = buildSolanaPayUrl(
      new PublicKey(body.merchantPubkey),
      order.amount,
      new PublicKey(order.reference),
      "Charon POS",
      `Order ${order.orderId}`,
      `order:${order.orderId}`,
      new PublicKey(body.usdcMint)
    );
    const qrDataUrl = await toDataUrl(solanaPayUrl);
    res.json({ orderId: order.orderId, solanaPayUrl, qrDataUrl });
  } catch (err) {
    console.error("Error in POST /payments:", err);
    res.json({ error: String(err) });
  }
});

// Status (NEVER 500)
app.get("/payments/:orderId/status", async (req: Request, res: Response) => {
  console.log(`GET /payments/${req.params.orderId}/status called`);
  const order = getOrder(req.params.orderId);
  if (!order) {
    console.log(`Order ${req.params.orderId} not found`);
    return res.json({ status: "PENDING", notFound: true });
  }
  console.log(`Status check complete for ${req.params.orderId}: ${order.status}`);
  res.json({ status: order.status });
});

// Webhook for USDC transfers
app.post("/webhook", async (req: Request, res: Response) => {
  console.log("POST /webhook called with body:", JSON.stringify(req.body, null, 2));
  try {
    const events = req.body as QuickNodeWebhookPayload[];
    if (!Array.isArray(events) || !events.length) {
      console.log("Invalid webhook payload: no events");
      return res.status(400).json({ error: "Invalid webhook payload" });
    }
    for (const event of events) {
      if (!event.transactions || !event.transactions.length) {
        console.log("Skipping event with no transactions");
        continue;
      }
      for (const tx of event.transactions) {
        const tokenTransfers = tx.raw?.meta?.postTokenBalances?.map((post, i) => {
          const pre = tx.raw?.meta?.preTokenBalances?.[i];
          if (
            post?.mint === usdcMint.toBase58() &&
            post?.owner === merchantPubkey.toBase58() &&
            pre?.mint === post.mint &&
            pre?.owner === post.owner
          ) {
            const amount = Number(post.uiTokenAmount.uiAmount) - Number(pre.uiTokenAmount.uiAmount);
            return { mint: post.mint, to: post.owner, amount: amount.toString() };
          }
          return null;
        }).filter((t): t is { mint: string, to: string, amount: string } => t !== null) || [];
        for (const transfer of tokenTransfers) {
          if (
            transfer.mint === usdcMint.toBase58() &&
            transfer.to === merchantPubkey.toBase58() &&
            Number(transfer.amount) > 0
          ) {
            const amount = Number(transfer.amount); // Already in UI units (USDC)
            console.log(`Detected USDC transfer of ${amount} to ${merchantPubkey.toBase58()}${event.block.blockTime ? ` at ${new Date(event.block.blockTime * 1000).toISOString()}` : ""}`);
            await checkAndUpdateStatus({
              amount,
              merchantPubkey: merchantPubkey.toBase58(),
              usdcMint: usdcMint.toBase58(),
              signature: tx.raw.transaction.signatures[0],
            });
          }
        }
      }
    }
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Error in POST /webhook:", err);
    res.status(500).json({ error: String(err) });
  }
});

// Refund stub
app.post("/refunds", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not Implemented", policy: "V1 refund requires merchant approval and available float." });
});

app.listen(ENV.PORT, () => {
  console.log(`Server listening on http://localhost:${ENV.PORT}`);
});