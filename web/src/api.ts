const BASE = "http://localhost:3001";

export async function createPayment(orderId: string, amount: number) {
  const r = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, amount }),
  });
  let data: any = {};
  try { data = await r.json(); } catch {}
  if (!("orderId" in data)) throw new Error(data?.error || "createPayment failed");
  return data;
}

export async function getStatus(orderId: string) {
  const r = await fetch(`${BASE}/payments/${orderId}/status`);
  let data: any = { status: "PENDING" };
  try { data = await r.json(); } catch {}
  return data; // soft response even if server had issues
}
