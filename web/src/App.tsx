import { useEffect, useRef, useState } from "react";
import { createPayment, getStatus } from "./api";

export default function App() {
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState(12.5);
  const [qr, setQr] = useState<string | null>(null);
  const [deeplink, setDeeplink] = useState<string | null>(null);
  const [status, setStatus] = useState("IDLE");
  const timer = useRef<number | null>(null);

  async function start() {
    const id = `ord_${Math.random().toString(36).slice(2, 8)}`;
    setOrderId(id);
    const { qrDataUrl, solanaPayUrl } = await createPayment(id, amount);
    setQr(qrDataUrl);
    setDeeplink(solanaPayUrl);
    setStatus("PENDING");
  }

  useEffect(() => {
    if (status !== "PENDING" || !orderId) return;
    timer.current = window.setInterval(async () => {
      try {
        const { status } = await getStatus(orderId);
        if (status === "PAID") {
          setStatus("PAID");
          if (timer.current) window.clearInterval(timer.current);
        }
      } catch {}
    }, 60000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [status, orderId]);

  return (
    <div style={{ maxWidth: 440, margin: "40px auto", fontFamily: "ui-sans-serif" }}>
      <h1>Charon POS (Starter)</h1>
      <label>
        Amount
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value))}
          style={{ marginLeft: 8 }}
        />
      </label>
      <button onClick={start} style={{ marginLeft: 12 }}>Create test order</button>

      {qr && (
        <div style={{ marginTop: 24 }}>
          <img src={qr} alt="Solana Pay QR" style={{ width: 256, height: 256 }} />
          {deeplink && (
            <p style={{ marginTop: 8 }}>
              <a href={deeplink}>Open in wallet</a>
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>Status:</strong> {status}
      </div>

      {status === "PAID" && <div style={{ color: "green", fontWeight: 700 }}>PAID ✅</div>}
    </div>
  );
}