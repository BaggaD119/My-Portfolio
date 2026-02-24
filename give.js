function setSupportStatus(message, isError = false) {
  const status = document.getElementById("supportStatus");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.toggle("is-success", !isError);
}

function checkPaymentCallback() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");
  if (reference) {
    setSupportStatus(`Payment received. Reference: ${reference}`, false);
  }
}

async function handleSupportSubmit(event) {
  event.preventDefault();

  const email = document.getElementById("supportEmail")?.value.trim() || "";
  const amountValue = document.getElementById("supportAmount")?.value || "";
  const name = document.getElementById("supportName")?.value.trim() || "";
  const message = document.getElementById("supportMessage")?.value.trim() || "";
  const submitBtn = document.getElementById("supportSubmit");

  const amount = Number(amountValue);
  if (!email || !Number.isFinite(amount) || amount <= 0) {
    setSupportStatus("Enter a valid email and amount.", true);
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  setSupportStatus("Creating secure checkout...", false);

  try {
    const response = await fetch("/api/paystack-initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount, name, message })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to create payment session.");
    }

    if (!payload?.authorization_url) {
      throw new Error("Missing Paystack authorization URL.");
    }

    window.location.href = payload.authorization_url;
  } catch (error) {
    setSupportStatus(error.message || "Unable to start checkout.", true);
    if (submitBtn) submitBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  checkPaymentCallback();
  document.getElementById("supportForm")?.addEventListener("submit", handleSupportSubmit);
});
