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

```mermaid
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
