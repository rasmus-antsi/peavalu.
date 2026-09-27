/* Peavalu — progressive enhancement. Everything works without this file;
   it adds the step flow, live intensity readout, one-tap fills, sheets,
   the desktop entry modal and keyboard shortcuts. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = matchMedia("(min-width: 960px) and (hover: hover) and (pointer: fine)");
  const pad = (n) => String(n).padStart(2, "0");
  const isTextField = (el) =>
    !!el && (el.tagName === "TEXTAREA" || el.isContentEditable ||
      (el.tagName === "INPUT" && !["range", "checkbox", "radio", "button", "submit"].includes(el.type)));
  const topDialog = () => $$("dialog[open]").pop();

  /* ---------------------------------------------------------------- dialogs */

  function openDialog(dialog) {
    if (dialog && !dialog.open) dialog.showModal();
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
    if (e.target instanceof HTMLDialogElement) e.target.close();   // backdrop tap
    $$("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });

  function busyOnSubmit(form) {
    form.addEventListener("submit", () => {
      $$('button[type="submit"]', form).forEach((b) => b.setAttribute("aria-busy", "true"));
    });
  }
  $$("[data-busy-form]").forEach(busyOnSubmit);

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

  let activeForm = null;   // the controller keyboard shortcuts talk to

  function initEntryForm(form, { onClose } = {}) {
    const track = $("[data-track]", form);
    const steps = $$("[data-step]", track);
    const segs = $$("[data-step-tab]", form);
    const back = $("[data-step-back]", form);
    const next = $("[data-step-next]", form);
    const save = $("[data-step-save]", form);
    const last = steps.length - 1;
    let current = 0;

    const width = () => track.clientWidth || 1;

    function render(i) {
      current = i;
      segs.forEach((s, j) => {
        s.classList.toggle("is-done", j < i);
        s.classList.toggle("is-active", j === i);
        s.setAttribute("aria-current", j === i ? "step" : "false");
      });
      steps.forEach((s, j) => { s.inert = j !== i; });
      back.hidden = i === 0;
      next.hidden = i === last;
      save.hidden = i !== last;
      form.style.setProperty("--step", i);
    }

    function goTo(i, { smooth = true, focus = true } = {}) {
      i = Math.max(0, Math.min(last, i));
      track.scrollTo({ left: i * width(), behavior: smooth && !reducedMotion ? "smooth" : "auto" });
      render(i);
      // Move focus with the step (for keyboard + screen readers) without popping the phone keyboard
      if (focus) $(".step__title", steps[i]).focus({ preventScroll: true });
    }

    // Swiping on the phone: settle on whichever step the snap lands on
    let settle = 0;
    track.addEventListener("scroll", () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const i = Math.round(track.scrollLeft / width());
        if (i !== current) render(i);
      }, 90);
    }, { passive: true });
    addEventListener("resize", () => track.scrollTo({ left: current * width() }));

    segs.forEach((s) => s.addEventListener("click", () => goTo(+s.dataset.stepTab)));
    back.addEventListener("click", () => goTo(current - 1));
    next.addEventListener("click", () => goTo(current + 1));

    const openIndex = Math.max(0, steps.findIndex((s) => s.id === `step-${form.dataset.openStep}`));
    track.style.scrollBehavior = "auto";
    goTo(openIndex, { smooth: false, focus: false });
    requestAnimationFrame(() => { track.scrollLeft = openIndex * width(); track.style.scrollBehavior = ""; });

    /* intensity */
    const pain = $("[data-pain]", form);
    const range = $('input[type="range"]', pain);
    const num = $("[data-pain-num]", pain);
    const word = $("[data-pain-word]", pain);
    const words = JSON.parse($("#intensity-words", form.parentElement).textContent);
    const ticks = $$("[data-pain-set]", pain);

    function renderPain() {
      const v = +range.value;
      if (num.textContent !== String(v)) {
        num.textContent = v;
        if (!reducedMotion) { num.classList.remove("is-bump"); void num.offsetWidth; num.classList.add("is-bump"); }
      }
      word.textContent = words[v];
      pain.style.setProperty("--lvl", v);
      range.setAttribute("aria-valuetext", `${v} – ${words[v]}`);
      ticks.forEach((t) => t.classList.toggle("is-active", +t.dataset.painSet === v));
    }
    const setPain = (v) => { range.value = v; renderPain(); };
    range.addEventListener("input", renderPain);
    ticks.forEach((t) => t.addEventListener("click", () => setPain(t.dataset.painSet)));
    renderPain();

    /* date: Täna / Eile over the native picker */
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

    /* medication + dose from her own history; tap again to clear */
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
    trigInput.addEventListener("input", renderTriggers);
    renderTriggers();

    /* Enter = next step (never an early submit), Shift+Enter = back */
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.isComposing) return;
      if (e.target.closest("button, a, textarea")) return;
      e.preventDefault();
      if (e.shiftKey) goTo(current - 1);
      else if (current < last) goTo(current + 1);
      else form.requestSubmit();
    });

    /* close: navigate back (page) or close the modal */
    const close = () => (onClose ? onClose() : (location.href = $("[data-form-close]", form).href));
    if (onClose) $("[data-form-close]", form).addEventListener("click", (e) => { e.preventDefault(); onClose(); });

    busyOnSubmit(form);

    activeForm = {
      form,
      next: () => (current < last ? goTo(current + 1) : form.requestSubmit()),
      back: () => goTo(current - 1),
      setPain,
      onFirstStep: () => current === 0,
      close,
    };
    return activeForm;
  }

  const pageForm = $("[data-entry-form]");
  if (pageForm) initEntryForm(pageForm);

  /* ----------------------------------------------- desktop: form as modal */

  const cache = new Map();
  const load = (url) => {
    if (!cache.has(url)) {
      cache.set(url, fetch(url, { credentials: "same-origin" }).then((r) => {
        if (!r.ok || r.redirected) throw new Error("fallback");
        return r.text();
      }).catch((err) => { cache.delete(url); throw err; }));
    }
    return cache.get(url);
  };

  async function openEntryModal(url) {
    if (!desktop.matches || topDialog()) return false;
    let html;
    try { html = await load(url); } catch { location.href = url; return true; }
    cache.delete(url);   // always fresh next time (csrf, suggestions)

    const src = $("[data-modal-src]", new DOMParser().parseFromString(html, "text/html"));
    if (!src) { location.href = url; return true; }

    const dialog = document.createElement("dialog");
    dialog.className = "sheet entry-modal";
    dialog.append(...src.childNodes);
    document.body.append(dialog);

    const returnUrl = location.href;
    history.pushState({ entryModal: true }, "", url);

    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      activeForm = null;
      $$("dialog", dialog).forEach((d) => d.remove());  // nested delete sheet
      setTimeout(() => dialog.remove(), 260);
      if (history.state?.entryModal) history.back();
      else if (location.href !== returnUrl) history.replaceState(null, "", returnUrl);
    };
    dialog.addEventListener("close", finish);
    addEventListener("popstate", () => dialog.open && dialog.close(), { once: true });

    const form = $("[data-entry-form]", dialog);
    form.classList.add("is-modal");
    initEntryForm(form, { onClose: () => dialog.close() });
    dialog.showModal();
    $(".step__title", dialog)?.focus({ preventScroll: true });
    return true;
  }

  /* ---------------------------------------------------------------- log */

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

    const open = (href) => openEntryModal(href).then((handled) => { if (!handled) location.href = href; });

    list.addEventListener("click", (e) => {
      const link = e.target.closest("a.add, a.entry");
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || !desktop.matches) return;
      e.preventDefault();
      open(link.href);
    });
    // Warm the cache on hover so the modal opens instantly
    list.addEventListener("pointerover", (e) => {
      const link = e.target.closest("a.add, a.entry");
      if (link && desktop.matches) load(link.href).catch(() => {});
    });

    const monthLink = (dir) => $(`[data-month="${dir}"]`, list);

    document.addEventListener("keydown", (e) => {
      if (activeForm || topDialog() || isTextField(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") { e.preventDefault(); open($(".add", list).href); }
      else if (k === "arrowleft" || k === "h") { const a = monthLink("prev"); if (a) location.href = a.href; }
      else if (k === "arrowright" || k === "l") { const a = monthLink("next"); if (a) location.href = a.href; }
      else if (k === "t") { location.href = location.pathname; }
      else if (k === "j" || k === "arrowdown") { e.preventDefault(); select(sel + 1); }
      else if (k === "k" || k === "arrowup") { e.preventDefault(); select(sel - 1); }
      else if (k === "enter" && sel >= 0) { e.preventDefault(); open(entries()[sel].href); }
    });
  }

  /* ------------------------------------------------- form shortcuts */

  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !isTextField(document.activeElement) && !activeForm) {
      openDialog($("#keys"));
      return;
    }
    if (!activeForm) return;
    const f = activeForm;
    const inNested = topDialog() && !topDialog().contains(f.form);   // e.g. delete sheet on top
    if (inNested) return;

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      f.form.requestSubmit();
    } else if (e.key === "Escape") {
      if (isTextField(document.activeElement)) { e.preventDefault(); document.activeElement.blur(); return; }
      e.preventDefault();
      f.close();
    } else if (isTextField(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) {
      return;
    } else if (/^[0-9]$/.test(e.key) && f.onFirstStep()) {
      e.preventDefault();
      f.setPain(e.key === "0" ? 10 : +e.key);
    }
  });
})();
