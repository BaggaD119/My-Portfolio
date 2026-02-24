module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const secretKey = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!secretKey) {
    return res.status(500).json({ error: "Paystack is not configured on server." });
  }

  const { email, amount, name, message } = req.body || {};
  const parsedAmount = Number(amount);
  const normalizedEmail = String(email || "").trim();

  if (!normalizedEmail || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Valid email and amount are required." });
  }

  const amountInKobo = Math.round(parsedAmount * 100);
  const host = req.headers.host;
  const protocol =
    req.headers["x-forwarded-proto"] ||
    (host && host.includes("localhost") ? "http" : "https");
  const callbackUrl = `${protocol}://${host}/done.html`;

  try {
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: normalizedEmail,
        amount: amountInKobo,
        callback_url: callbackUrl,
        metadata: {
          custom_fields: [
            { display_name: "Supporter Name", variable_name: "supporter_name", value: String(name || "") },
            { display_name: "Support Message", variable_name: "support_message", value: String(message || "") }
          ]
        }
      })
    });

    const payload = await paystackResponse.json();
    if (!paystackResponse.ok || payload?.status === false) {
      const apiError = payload?.message || "Paystack initialization failed.";
      return res.status(400).json({ error: apiError });
    }

    return res.status(200).json({
      authorization_url: payload?.data?.authorization_url || "",
      reference: payload?.data?.reference || ""
    });
  } catch {
    return res.status(500).json({ error: "Unable to reach Paystack right now." });
  }
};
