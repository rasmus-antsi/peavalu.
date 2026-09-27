/* Peavalu — progressive enhancement. Everything works without this file;
   it adds swipe-synced steps, live intensity readout, one-tap fills,
   sheets and desktop keyboard shortcuts. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTyping = (el) =>
    el && (el.isContentEditable || (el.tagName === "INPUT" && !["range", "checkbox", "radio", "button", "submit"].includes(el.type)) || el.tagName === "TEXTAREA");
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------------------------------------------------------------- dialogs */

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-dialog-open]");
    if (opener) {
      e.preventDefault();
      openDialog(document.getElementById(opener.dataset.dialogOpen));
      return;
    }
    if (e.target.closest("[data-dialog-close]")) {
      e.target.closest("dialog")?.close();
      return;
    }
    // Tap on the backdrop closes a sheet
    if (e.target instanceof HTMLDialogElement) e.target.close();

    // Close the account menu when tapping elsewhere
    $$("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });

  /* ------------------------------------------------------- busy on submit */

  $$("[data-busy-form]").forEach((form) => {
    form.addEventListener("submit", () => {
      $$('button[type="submit"]', form).forEach((b) => b.setAttribute("aria-busy", "true"));
    });
  });

  /* ------------------------------------------------------ password toggle */

  const toggle = $("[data-password-toggle]");
  if (toggle) {
    const input = $("[data-password]");
    toggle.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute("aria-label", show ? "Peida parool" : "Näita parooli");
      input.focus({ preventScroll: true });
    });
  }

  /* ------------------------------------------------------------ entry form */

  const form = $("[data-entry-form]");
  if (form) initEntryForm(form);

  function initEntryForm(form) {
    const track = $("[data-track]", form);
    const steps = $$("[data-step]", track);
    const tabs = $$("[data-step-tab]", form);
    const stepsNav = $(".steps", form);
    const next = $("[data-step-next]", form);
    let current = -1;

    const stepWidth = () => track.clientWidth || 1;
    const isStepping = () => track.scrollWidth > track.clientWidth + 4;

    function setActive(i) {
      if (i === current) return;
      current = i;
      tabs.forEach((t, j) => t.classList.toggle("is-active", j === i));
      next.hidden = i >= steps.length - 1;
    }

    function goTo(i, smooth = true) {
      i = Math.max(0, Math.min(steps.length - 1, i));
      if (isStepping()) {
        track.scrollTo({ left: i * stepWidth(), behavior: smooth && !reducedMotion ? "smooth" : "auto" });
      } else {
        steps[i].scrollIntoView({ block: "nearest", behavior: smooth && !reducedMotion ? "smooth" : "auto" });
      }
      setActive(i);
    }

    // The ink underline follows the finger 1:1 while swiping
    let raf = 0;
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = track.scrollLeft / stepWidth();
        stepsNav.style.setProperty("--p", p.toFixed(3));
        setActive(Math.round(p));
      });
    }, { passive: true });

    tabs.forEach((tab) => tab.addEventListener("click", () => goTo(+tab.dataset.stepTab)));
    next.addEventListener("click", () => goTo(current + 1));

    // Tabbing into a field on another step keeps the underline in sync
    track.addEventListener("focusin", (e) => {
      const i = steps.indexOf(e.target.closest("[data-step]"));
      if (i >= 0 && isStepping() && Math.round(track.scrollLeft / stepWidth()) !== i) goTo(i, false);
    });

    const openIndex = Math.max(0, steps.findIndex((s) => s.id === `step-${form.dataset.openStep}`));
    requestAnimationFrame(() => goTo(openIndex, false));

    /* intensity */
    const pain = $("[data-pain]", form);
    const range = $('input[type="range"]', pain);
    const num = $("[data-pain-num]", pain);
    const word = $("[data-pain-word]", pain);
    const words = JSON.parse($("#intensity-words").textContent);
    const ticks = $$("[data-pain-set]", pain);

    function renderPain() {
      const v = +range.value;
      if (num.textContent !== String(v)) {
        num.textContent = v;
        if (!reducedMotion) {
          num.classList.remove("is-bump");
          void num.offsetWidth;
          num.classList.add("is-bump");
        }
      }
      word.textContent = words[v];
      pain.style.setProperty("--lvl", v);
      range.setAttribute("aria-valuetext", `${v} – ${words[v]}`);
      ticks.forEach((t) => t.classList.toggle("is-active", +t.dataset.painSet === v));
    }
    range.addEventListener("input", renderPain);
    ticks.forEach((t) => t.addEventListener("click", () => { range.value = t.dataset.painSet; renderPain(); }));
    renderPain();

    /* date: Täna / Eile shortcuts over the native picker */
    const dateInput = $('input[name="date"]', form);
    const dateOpts = $$("[data-set-date]", form);
    const dateField = dateInput.closest(".seg__opt");
    function renderDate() {
      let matched = false;
      dateOpts.forEach((b) => {
        const on = b.dataset.setDate === dateInput.value;
        b.classList.toggle("is-active", on);
        matched ||= on;
      });
      dateField.classList.toggle("is-active", !matched && !!dateInput.value);
    }
    dateOpts.forEach((b) => b.addEventListener("click", () => { dateInput.value = b.dataset.setDate; renderDate(); }));
    dateInput.addEventListener("change", renderDate);
    renderDate();

    /* time: "Praegu" */
    const timeInput = $('input[name="start_time"]', form);
    $("[data-set-now]", form)?.addEventListener("click", () => {
      const now = new Date();
      timeInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    });

    /* one-tap medication + dose from her own history */
    const medInput = $('input[name="medication_name"]', form);
    const doseInput = $('input[name="dose_mg"]', form);
    const medChips = $$("[data-fill-med]", form);
    function renderMeds() {
      medChips.forEach((c) => c.classList.toggle("is-active",
        c.dataset.fillMed === medInput.value.trim() && (c.dataset.fillDose || "") === doseInput.value));
    }
    medChips.forEach((c) => c.addEventListener("click", () => {
      const already = c.classList.contains("is-active");
      medInput.value = already ? "" : c.dataset.fillMed;
      doseInput.value = already ? "" : c.dataset.fillDose;
      renderMeds();
    }));
    medInput.addEventListener("input", renderMeds);
    doseInput.addEventListener("input", renderMeds);
    renderMeds();

    /* triggers: tap to add, tap again to remove */
    const trigInput = $('input[name="trigger_factor"]', form);
    const trigChips = $$("[data-fill-trigger]", form);
    const trigParts = () => trigInput.value.split(",").map((s) => s.trim()).filter(Boolean);
    function renderTriggers() {
      const parts = trigParts();
      trigChips.forEach((c) => c.classList.toggle("is-active", parts.includes(c.dataset.fillTrigger)));
    }
    trigChips.forEach((c) => c.addEventListener("click", () => {
      const parts = trigParts();
      const t = c.dataset.fillTrigger;
      trigInput.value = (parts.includes(t) ? parts.filter((p) => p !== t) : [...parts, t]).join(", ");
      renderTriggers();
    }));
    trigInput?.addEventListener("input", renderTriggers);
    renderTriggers();

    /* keyboard */
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        form.requestSubmit();
        return;
      }
      if (e.key === "Escape" && !$("dialog[open]")) {
        if (isTyping(document.activeElement)) { document.activeElement.blur(); return; }
        const cancel = $("[data-shortcut-cancel]");
        if (cancel) location.href = cancel.href;
        return;
      }
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey || $("dialog[open]")) return;
      if (/^[0-9]$/.test(e.key)) {
        range.value = e.key === "0" ? 10 : e.key;
        renderPain();
        e.preventDefault();
      }
    });
  }

  /* ---------------------------------------------------- log: shortcuts */

  const list = $(".shell--list");
  if (list) {
    const entries = () => $$(".entry", list);
    let sel = -1;

    function select(i) {
      const all = entries();
      if (!all.length) return;
      sel = Math.max(0, Math.min(all.length - 1, i));
      all.forEach((el, j) => el.classList.toggle("is-selected", j === sel));
      all[sel].scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    }

    const monthLink = (dir) => $(`.month__nav a[aria-label="${dir === -1 ? "Eelmine kuu" : "Järgmine kuu"}"]`, list);

    document.addEventListener("keydown", (e) => {
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey || $("dialog[open]")) return;
      const k = e.key;
      if (k === "n" || k === "N") { location.href = $(".add", list).href; }
      else if (k === "ArrowLeft" || k === "h") { const a = monthLink(-1); if (a) location.href = a.href; }
      else if (k === "ArrowRight" || k === "l") { const a = monthLink(1); if (a) location.href = a.href; }
      else if (k === "t") { location.href = location.pathname; }
      else if (k === "j" || k === "ArrowDown") { e.preventDefault(); select(sel + 1); }
      else if (k === "k" || k === "ArrowUp") { e.preventDefault(); select(sel - 1); }
      else if (k === "Enter" && sel >= 0) { location.href = entries()[sel].href; }
      else if (k === "?") { openDialog($("#keys")); }
      else return;
    });
  }

  /* "?" also works on the form */
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !list && !isTyping(document.activeElement)) openDialog($("#keys"));
  });
})();
