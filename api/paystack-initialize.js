const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 8;
const rateLimitStore = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, startedAt: now };

  if (now - entry.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, startedAt: now });
    return false;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({ error: "Too many requests. Please wait and try again." });
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
          source: "baggad119-portfolio-support",
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
