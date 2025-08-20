/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MERCHANT_WALLET_ADDRESS: string
  readonly VITE_USDC_MINT: string
  readonly VITE_SERVER_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}