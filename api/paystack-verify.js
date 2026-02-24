async function saveSupportRecord(record) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const table = String(process.env.SUPABASE_SUPPORT_TABLE || "support_records").trim();

  if (!supabaseUrl || !serviceRoleKey) return;

  await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(record)
  });
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const secretKey = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!secretKey) {
    return res.status(500).json({ error: "Paystack is not configured on server." });
  }

  const reference = String(req.query?.reference || "").trim();
  if (!reference) {
    return res.status(400).json({ error: "Payment reference is required." });
  }

  try {
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const payload = await paystackResponse.json();

    if (!paystackResponse.ok || payload?.status === false) {
      return res.status(400).json({ error: payload?.message || "Unable to verify transaction." });
    }

    const tx = payload?.data || {};
    const paid = tx?.status === "success";

    if (paid) {
      await saveSupportRecord({
        reference: tx.reference,
        email: tx.customer?.email || "",
        amount: Number(tx.amount || 0) / 100,
        currency: tx.currency || "GHS",
        status: tx.status || "success",
        paid_at: tx.paid_at || new Date().toISOString(),
        metadata: tx.metadata || {}
      });
    }

    return res.status(200).json({
      paid,
      reference: tx.reference || reference,
      status: tx.status || "unknown",
      amount: Number(tx.amount || 0) / 100,
      currency: tx.currency || "GHS"
    });
  } catch {
    return res.status(500).json({ error: "Unable to verify payment right now." });
  }
};
