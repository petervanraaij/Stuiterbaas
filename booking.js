(() => {
  document.querySelectorAll('.mobile-panel a').forEach(link => link.addEventListener('click', () => {
    document.querySelector('.mobile-menu').open = false;
  }));
  const form = document.querySelector("#booking-form");
  if (!form) return;

  const config = window.STUITERBAAS_BOOKING || {};
  const status = document.querySelector("#booking-status");
  const submitButton = form.querySelector(".booking-submit");
  const dateInput = form.elements.date;
  const turnstileContainer = document.querySelector("#turnstile-container");
  let turnstileWidgetId = null;

  const pad = (value) => String(value).padStart(2, "0");
  const today = new Date();
  dateInput.min = [
    today.getFullYear(),
    pad(today.getMonth() + 1),
    pad(today.getDate())
  ].join("-");

  const updateRentalSummary = () => {
    const days = Number(form.elements.rentalDays.value);
    const rent = days === 2 ? 150 : 95;
    let summary = '€' + rent + ' huur + €50 borg = €' + (rent + 50) + ' totaal.';
    document.querySelector('#end-time-label').textContent = days === 2 ? 'Gewenste ophaaltijd op de tweede dag *' : 'Gewenste ophaaltijd *';
    if (days === 2 && dateInput.value) {
      const end = new Date(dateInput.value + 'T12:00:00Z');
      if (!Number.isNaN(end.getTime())) {
        end.setUTCDate(end.getUTCDate() + 1);
        summary += ' Einddatum: ' + end.toLocaleDateString('nl-NL', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}) + '.';
      }
    }
    document.querySelector('#rental-summary').textContent = summary;
  };
  const validateTimes = () => {
    const start = form.elements.startTime.value;
    const end = form.elements.endTime.value;
    form.elements.endTime.setCustomValidity(form.elements.rentalDays.value === '1' && start && end && end <= start
      ? 'Kies een ophaaltijd na de brengtijd.' : '');
  };
  form.elements.rentalDays.addEventListener('change', () => { updateRentalSummary(); validateTimes(); });
  form.elements.startTime.addEventListener('input', validateTimes);
  form.elements.endTime.addEventListener('input', validateTimes);
  dateInput.addEventListener('change', updateRentalSummary);
  form.addEventListener('reset', () => window.setTimeout(() => { updateRentalSummary(); validateTimes(); }, 0));
  updateRentalSummary();

  const showStatus = (message, type) => {
    status.textContent = message;
    status.className = "booking-status is-visible is-" + type;
  };

  const clearStatus = () => {
    status.textContent = "";
    status.className = "booking-status";
  };

  const loadTurnstile = () => {
    if (!config.turnstileSiteKey) return;

    turnstileContainer.hidden = false;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: config.turnstileSiteKey,
        size: turnstileContainer.clientWidth < 300 ? "compact" : "normal",
        theme: "light",
        language: "nl"
      });
    });
    script.addEventListener("error", () => {
      showStatus("De beveiligingscontrole kon niet worden geladen. Vernieuw de pagina en probeer het opnieuw.", "error");
    });
    document.head.appendChild(script);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    clearStatus();
    validateTimes();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (form.elements.website.value) {
      form.reset();
      showStatus("Bedankt. Je aanvraag is ontvangen.", "success");
      return;
    }

    if (!config.endpoint || !config.turnstileSiteKey) {
      showStatus("Het online formulier wordt nog veilig gekoppeld. Gebruik voorlopig ‘Reserveer via WhatsApp’ of mail naar verhuur@stuiterbaas.nl.", "error");
      return;
    }

    const turnstileToken = window.turnstile && turnstileWidgetId !== null
      ? window.turnstile.getResponse(turnstileWidgetId)
      : "";

    if (!turnstileToken) {
      showStatus("Voltooi eerst de beveiligingscontrole en verstuur de aanvraag opnieuw.", "error");
      return;
    }

    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      date: formData.get("date"),
      rentalDays: formData.get("rentalDays"),
      location: formData.get("location"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      notes: formData.get("notes"),
      website: formData.get("website"),
      turnstileToken
    };

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    submitButton.disabled = true;
    submitButton.textContent = "Aanvraag versturen…";

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "De aanvraag kon niet worden verstuurd.");
      }

      form.reset();
      showStatus("Gelukt! Je aanvraag is verstuurd. Stuiterbaas neemt zo snel mogelijk contact met je op om de beschikbaarheid te bevestigen.", "success");
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } catch (error) {
      const message = error.name === "AbortError"
        ? "Het versturen duurde te lang. Controleer je verbinding en probeer het opnieuw."
        : "De aanvraag kon niet worden verstuurd. Probeer het opnieuw of kies ‘Reserveer via WhatsApp’.";
      showStatus(message, "error");
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      window.clearTimeout(timeout);
      submitButton.disabled = false;
      submitButton.textContent = "Verstuur reserveringsaanvraag";
    }
  });

  submitButton.disabled = false;
  loadTurnstile();
})();
