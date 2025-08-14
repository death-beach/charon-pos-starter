import express, { type Request, type Response } from "express";
import cors from "cors";
import { ENV } from "./env";
import { buildSolanaPayUrl, createOrder, getOrder, checkAndUpdateStatus } from "./payments";
import { merchantPubkey, usdcMint } from "./solana";
import { toDataUrl } from "./qr";
import type { CreatePaymentBody } from "./types";

const app = express();
app.use(express.json());
app.use(cors({ origin: ENV.CORS_ORIGIN }));

// Create payment (soft-fail)
app.post("/payments", async (req: Request, res: Response) => {
  console.log("POST /payments called with body:", req.body);
  try {
    const body = req.body as CreatePaymentBody;
    if (!body?.orderId || typeof body.amount !== "number") {
      console.log("Invalid request body:", body);
      return res.status(400).json({ error: "orderId and amount required" });
    }
    console.log(`Creating order ${body.orderId} for amount ${body.amount}`);
    const order = createOrder(body);
    const { PublicKey } = await import("@solana/web3.js");
    const solanaPayUrl = buildSolanaPayUrl(
      merchantPubkey,
      order.amount,
      new PublicKey(order.reference),
      "Charon POS",
      `Order ${order.orderId}`,
      `order:${order.orderId}`,
      usdcMint
    );
    const qrDataUrl = await toDataUrl(solanaPayUrl);
    res.json({ orderId: order.orderId, solanaPayUrl, qrDataUrl });
  } catch (err) {
    console.error("Error in POST /payments:", err);
    res.json({ error: String(err) }); // never kill client flow
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
  try {
    console.log(`Checking status for order ${req.params.orderId}, current status: ${order.status}`);
    const status = await checkAndUpdateStatus(order); // guaranteed no-throw
    console.log(`Status check complete for ${req.params.orderId}: ${status}`);
    res.json({ status, backoffMs: order.backoffMs ?? 0 });
  } catch (err) {
    console.error("GET /payments/:orderId/status (soft):", err);
    res.json({ status: order.status, rateLimited: true, backoffMs: order.backoffMs ?? 0 });
  }
});

// Refund stub
app.post("/refunds", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not Implemented", policy: "V1 refund requires merchant approval and available float." });
});

app.listen(ENV.PORT, () => {
  console.log(`Server listening on http://localhost:${ENV.PORT}`);
});
