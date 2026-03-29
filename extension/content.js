(() => {
  const BADGE_ID = "convoglide-badge";
  const DEBUG_EVENT = "__convoglide_debug";

  function ensureBadge() {
    if (!document.body) {
      return null;
    }

    let badge = document.getElementById(BADGE_ID);
    if (badge) {
      return badge;
    }

    badge = document.createElement("aside");
    badge.id = BADGE_ID;
    badge.innerHTML = [
      "<strong>ConvoGlide</strong>",
      '<span class="convoglide-line" data-role="phase">phase: content-script</span>',
      '<span class="convoglide-line" data-role="detail">detail: booting</span>',
      '<span class="convoglide-line" data-role="url">url: pending</span>',
    ].join("");
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge(detail = {}) {
    const badge = ensureBadge();
    if (!badge) {
      return;
    }

    const phaseEl = badge.querySelector('[data-role="phase"]');
    const detailEl = badge.querySelector('[data-role="detail"]');
    const urlEl = badge.querySelector('[data-role="url"]');

    const phase = detail.phase || detail.event || "content-script";
    const text = detail.summary || JSON.stringify(detail).slice(0, 140);
    const url = detail.url || location.pathname;

    if (phaseEl) phaseEl.textContent = `phase: ${phase}`;
    if (detailEl) detailEl.textContent = `detail: ${text}`;
    if (urlEl) urlEl.textContent = `url: ${url}`;
  }

  function writeState(detail = {}) {
    try {
      document.documentElement.dataset.convoglidePhase = detail.phase || detail.event || "content-script";
      document.documentElement.dataset.convoglideSummary = (detail.summary || "").slice(0, 120);
    } catch {}
    updateBadge(detail);
  }

  function boot() {
    const badge = ensureBadge();
    if (!badge) {
      return false;
    }

    writeState({
      phase: "content-script",
      summary: "badge-mounted",
      url: location.pathname,
    });

    window.addEventListener(DEBUG_EVENT, (event) => {
      writeState(event.detail || {});
    });

    return true;
  }

  if (boot()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (boot()) {
      observer.disconnect();
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
  });
})();
