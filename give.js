function setSupportStatus(message, isError = false) {
  const status = document.getElementById("supportStatus");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.toggle("is-success", !isError);
}

function setPresetAmount(amount) {
  const amountInput = document.getElementById("supportAmount");
  if (!amountInput) return;
  amountInput.value = String(amount);
}

function bindPresetButtons() {
  const presetButtons = document.querySelectorAll(".preset-btn");
  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Number(button.getAttribute("data-amount"));
      if (!Number.isFinite(amount) || amount <= 0) return;
      setPresetAmount(amount);
      presetButtons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });
}

async function checkPaymentCallback() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");
  if (!reference) return;

  setSupportStatus("Verifying payment status...", false);

  try {
    const response = await fetch(`/api/paystack-verify?reference=${encodeURIComponent(reference)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to verify payment.");
    }

    if (payload?.paid) {
      setSupportStatus(`Payment confirmed. Reference: ${reference}`, false);
    } else {
      setSupportStatus(`Payment not completed yet. Reference: ${reference}`, true);
    }
  } catch (error) {
    setSupportStatus(error.message || "Unable to verify payment right now.", true);
  } finally {
    const cleanedUrl = `${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanedUrl);
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setSupportStatus("Enter a valid email address.", true);
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    setSupportStatus("Enter a valid amount greater than 0.", true);
    return;
  }

  if (amount > 1000000) {
    setSupportStatus("Amount is too high. Please enter a smaller amount.", true);
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

  bindPresetButtons();
  checkPaymentCallback();
  document.getElementById("supportForm")?.addEventListener("submit", handleSupportSubmit);
});
