# Charon POS Starter (Solana Pay + POS flow)

Accept USDC via Solana Pay from a POS order and mark it PAID on confirmation. Minimal, framework-agnostic starter to show the flow we use with Clover.

## Highlights
- Generate Solana Pay URLs + QR codes for a given orderId/amount
- Confirm on-chain settlement and update order status
- 60–90s demo video: <Loom link>
- Works with any POS that exposes createOrder/updateOrder APIs (Clover shown in demo)

## How it works
1. POS creates an order and POSTs to /payments to request crypto checkout
2. Server returns a Solana Pay URL; client renders QR
3. Customer scans with a wallet (e.g., Phantom) and pays in USDC
4. Server listens for confirmation and updates the order to PAID

# Charon POS Starter

Minimal Solana Pay demo (Node + TS backend, Vite React frontend). No DB/Helius: creates payment URLs, renders QR, and confirms on-chain via RPC polling.

## Quick start
1. Copy `.env.example` to `server/.env` **(place it in /server)** and fill in:
   - `SOLANA_RPC`
   - `MERCHANT_WALLET_ADDRESS`
   - `USDC_MINT`
2. Install & run server:
   ```bash
   cd server && npm i && npm run dev
3. In a new terminal, run web:
   - cd web && npm i && npm run dev
4. Open the web UI (default Vite port) and create a test order. Scan QR with a Solana wallet and pay. Status will flip to PAID when confirmed.

 For demo safety, amounts are in the SPL token defined by USDC_MINT. For devnet, use a devnet USDC mint (e.g., Es9vMFrzaCER... on mainnet is USDT—set the proper mint for your cluster).

## Endpoints:
POST /payments → { orderId, amount } → returns { solanaPayUrl, qrDataUrl, orderId }
GET /payments/:orderId/status → { status: "PENDING" | "PAID" }
POST /refunds → returns 501 Not Implemented (stub)

## Notes:
- In-memory Map holds pending orders for demo.
- Background loop polls recent signatures for merchant address; matches memo/reference+amount.
- No persistence; restart clears state.


sequenceDiagram
  participant POS
  participant Server
  participant Wallet
  POS->>Server: POST /payments {orderId, amount}
  Server-->>POS: solanaPayUrl (for QR)
  POS->>Wallet: Show QR
  Wallet->>Server: On-chain tx (USDC to merchant address)
  Server->>Server: Confirm tx (RPC/WS)
  Server->>POS: PUT /orders/:id status=PAID


### Refunds (v1 policy)
On-chain refunds return to the original payer address.
Merchant maintains a small “refund buffer” in their wallet; refunds blocked if below threshold.
Future option: short escrow window or fiat refund rails.

### Quick start
Requirements: Node 18+, a Solana RPC endpoint, a USDC mint address.
Copy .env.example to .env and set values.
Install: npm i in /server and /web
Run server: npm run dev (port 3000)
Run web: npm run dev (port 5173)
Open http://localhost:5173 and click “Create test order”

### Config
SOLANA_RPC=
MERCHANT_WALLET_ADDRESS=
USDC_MINT=
POS_WEBHOOK_SECRET= (if you secure POS callbacks)

###Notes
This is a demo. Secure your webhooks, validate inputs, and handle idempotency in production.
Privy/Jupiter integrations are referenced but not required here—see links below.

### Links
Solana Pay: https://docs.solanapay.com
USDC on Solana: https://docs.circle.com
Privy: https://www.privy.io/docs
Solana Attestation Service: https://github.com/anza-xyz/solana-attestation-service

### License
MIT 

.env.example:
SOLANA_RPC=
MERCHANT_WALLET_ADDRESS=
USDC_MINT=
POS_WEBHOOK_SECRET=
