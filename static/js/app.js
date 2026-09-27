/* Peavalu — progressive enhancement. Everything works without this file
   (and without htmx); this adds the step flow, the iOS-style entry sheet,
   live intensity readout, one-tap fills, motion and keyboard shortcuts. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const html = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const wide = matchMedia("(min-width: 960px)");
  const pad = (n) => String(n).padStart(2, "0");
  const isTextField = (el) =>
    !!el && (el.tagName === "TEXTAREA" || el.isContentEditable ||
      (el.tagName === "INPUT" && !["range", "checkbox", "radio", "button", "submit"].includes(el.type)));
  const topDialog = () => $$("dialog[open]").pop();
  const springOut = "cubic-bezier(.22, 1.2, .36, 1)";   // slight overshoot, iOS-ish

  /* Follow a link through htmx (boosted) when available */
  function navigate(url) {
    const a = document.createElement("a");
    a.href = url;
    a.hidden = true;
    document.body.append(a);
    window.htmx?.process(a);
    a.click();
    a.remove();
  }

  /* ---------------------------------------------------------------- dialogs */

  const openDialog = (d) => { if (d && !d.open) d.showModal(); };

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
    // Backdrop tap: entry sheets ask first, other sheets just close
    if (e.target instanceof HTMLDialogElement) {
      if (e.target.classList.contains("entry-modal")) sheetCtl?.requestClose();
      else e.target.close();
    }
    $$("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });

  /* "Loobud muudatustest?" — one shared confirm, resolves true when discarding */
  function confirmDiscard() {
    const sheet = $("#discard-sheet");
    if (!sheet) return Promise.resolve(true);
    return new Promise((resolve) => {
      const yes = $("[data-discard-confirm]", sheet);
      const onYes = () => { sheet.close("discard"); };
      yes.addEventListener("click", onYes, { once: true });
      sheet.addEventListener("close", () => {
        yes.removeEventListener("click", onYes);
        resolve(sheet.returnValue === "discard");
        sheet.returnValue = "";
      }, { once: true });
      openDialog(sheet);
    });
  }

  /* ------------------------------------------------------------ entry form */

  let formCtl = null;    // whichever entry form is live (page or sheet)
  let sheetCtl = null;   // the open entry sheet, if any

  function initEntryForm(form, { onClose } = {}) {
    const track = $("[data-track]", form);
    const steps = $$("[data-step]", track);
    const segs = $$("[data-step-tab]", form);
    const back = $("[data-step-back]", form);
    const next = $("[data-step-next]", form);
    const save = $("[data-step-save]", form);
    const last = steps.length - 1;
    let current = 0;
    let dirty = false;

    const width = () => track.clientWidth || 1;

    function render(i, animate) {
      const changed = i !== current;
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
      if (animate && changed && !reducedMotion.matches) {
        const step = steps[i];
        step.classList.remove("is-entering");
        void step.offsetWidth;
        step.classList.add("is-entering");
      }
    }

    function goTo(i, { smooth = true, focus = true } = {}) {
      i = Math.max(0, Math.min(last, i));
      track.scrollTo({ left: i * width(), behavior: smooth && !reducedMotion.matches ? "smooth" : "auto" });
      render(i, smooth);
      if (focus) $(".step__title", steps[i]).focus({ preventScroll: true });
    }

    // Swiping on the phone: settle on whichever step the snap lands on
    let settle = 0;
    track.addEventListener("scroll", () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const i = Math.round(track.scrollLeft / width());
        if (i !== current) render(i, true);
      }, 90);
    }, { passive: true });
    const onResize = () => { track.scrollLeft = current * width(); };
    addEventListener("resize", onResize);

    segs.forEach((s) => s.addEventListener("click", () => goTo(+s.dataset.stepTab)));
    back.addEventListener("click", () => goTo(current - 1));
    next.addEventListener("click", () => goTo(current + 1));

    const openIndex = Math.max(0, steps.findIndex((s) => s.id === `step-${form.dataset.openStep}`));
    render(openIndex, false);
    requestAnimationFrame(() => { track.scrollLeft = openIndex * width(); });

    /* intensity: number and word roll in the direction you slide */
    const pain = $("[data-pain]", form);
    const range = $('input[type="range"]', pain);
    const num = $("[data-pain-num]", pain);
    const word = $("[data-pain-word]", pain);
    const words = JSON.parse($("#intensity-words", form).textContent);
    const ticks = $$("[data-pain-set]", pain);
    let shown = +range.value;

    function roll(el, text, dir) {
      el.textContent = text;
      if (reducedMotion.matches) return;
      el.animate(
        [
          { transform: `translateY(${dir * 34}%)`, opacity: 0, filter: "blur(3px)" },
          { transform: "none", opacity: 1, filter: "blur(0)" },
        ],
        { duration: 280, easing: springOut },
      );
    }
    function renderPain() {
      const v = +range.value;
      if (v !== shown) {
        const dir = v > shown ? 1 : -1;
        roll(num, v, dir);
        if (word.textContent !== words[v]) roll(word, words[v], dir);
        shown = v;
      } else {
        num.textContent = v;
        word.textContent = words[v];
      }
      pain.dataset.lvl = v;
      range.setAttribute("aria-valuetext", `${v} – ${words[v]}`);
      ticks.forEach((t) => t.classList.toggle("is-active", +t.dataset.painSet === v));
    }
    const setPain = (v) => { range.value = v; renderPain(); dirty = true; };
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
    dateOpts.forEach((b) => b.addEventListener("click", () => { dateInput.value = b.dataset.setDate; renderDate(); dirty = true; }));
    dateInput.addEventListener("change", renderDate);
    renderDate();

    /* time: "Praegu" */
    const timeInput = $('input[name="start_time"]', form);
    $("[data-set-now]", form)?.addEventListener("click", () => {
      const now = new Date();
      timeInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      dirty = true;
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
      dirty = true;
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
      dirty = true;
    }));
    trigInput.addEventListener("input", renderTriggers);
    renderTriggers();

    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("change", () => { dirty = true; });

    /* Enter = next step (never an early submit), Shift+Enter = back */
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.isComposing) return;
      if (e.target.closest("button, a, textarea")) return;
      e.preventDefault();
      if (e.shiftKey) goTo(current - 1);
      else if (current < last) goTo(current + 1);
      else form.requestSubmit();
    });

    /* submit: button shows it's working; nothing to confirm after this */
    form.addEventListener("submit", () => {
      dirty = false;
      $$('button[type="submit"]', form).forEach((b) => b.setAttribute("aria-busy", "true"));
    });

    /* close: sheets ask before throwing answers away */
    const closeLink = $("[data-form-close]", form);
    async function requestClose() {
      if (dirty && !(await confirmDiscard())) return;
      dirty = false;
      if (onClose) onClose();
      else navigate(closeLink.href);
    }
    closeLink.addEventListener("click", (e) => { e.preventDefault(); requestClose(); });

    // Chip pop only for taps, not for chips that load already checked
    requestAnimationFrame(() => form.classList.add("is-ready"));

    formCtl = {
      form,
      next: () => (current < last ? goTo(current + 1) : form.requestSubmit()),
      back: () => goTo(current - 1),
      setPain,
      onFirstStep: () => current === 0,
      requestClose,
      destroy: () => removeEventListener("resize", onResize),
    };
    return formCtl;
  }

  /* ----------------------------------------------- entry sheet / modal */

  const cache = new Map();
  function load(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url, { credentials: "same-origin" }).then((r) => {
        if (!r.ok || r.redirected) throw new Error("fallback");
        return r.text();
      }).catch((err) => { cache.delete(url); throw err; }));
    }
    return cache.get(url);
  }

  async function openEntrySheet(url) {
    if (topDialog()) return;
    let text;
    try { text = await load(url); } catch { navigate(url); return; }
    cache.delete(url);   // fresh next time (csrf token, suggestions)

    const src = $("[data-modal-src]", new DOMParser().parseFromString(text, "text/html"));
    if (!src) { navigate(url); return; }

    const dialog = document.createElement("dialog");
    dialog.className = "sheet entry-modal";
    dialog.setAttribute("aria-label", "Peavalu kirje");
    dialog.append(...src.childNodes);
    document.body.append(dialog);
    window.htmx?.process(dialog);       // the form submits through htmx like everything else

    const form = $("[data-entry-form]", dialog);
    form.classList.add("is-modal");

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      html.classList.remove("has-sheet");
      dialog.close();
    };
    dialog.addEventListener("close", () => {
      formCtl?.destroy();
      formCtl = pageFormCtl;
      sheetCtl = null;
      html.classList.remove("has-sheet");
      $$("dialog", dialog).forEach((d) => d.remove());
      setTimeout(() => dialog.remove(), 400);
    });
    // Esc: ask first if there are answers
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); sheetCtl?.requestClose(); });

    const ctl = initEntryForm(form, { onClose: close });
    sheetCtl = ctl;

    dialog.showModal();
    html.classList.add("has-sheet");
    $(".step__title", dialog)?.focus({ preventScroll: true });
    enableSwipeDown(dialog, ctl);
  }

  /* Drag the sheet down by its header to dismiss (phones). A quick flick
     counts even if the distance is short. */
  function enableSwipeDown(dialog, ctl) {
    const handle = $(".bar", dialog);
    let startY = 0, dy = 0, t0 = 0, dragging = false;

    handle.addEventListener("pointerdown", (e) => {
      if (wide.matches || e.target.closest("a, button") || e.button !== 0) return;
      dragging = true;
      startY = e.clientY;
      t0 = performance.now();
      dy = 0;
      handle.setPointerCapture(e.pointerId);
      dialog.style.transition = "none";
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const raw = e.clientY - startY;
      dy = raw > 0 ? raw : raw / 6;                       // resist dragging up
      dialog.style.transform = `translateY(${dy}px)`;
    });
    const end = async () => {
      if (!dragging) return;
      dragging = false;
      const velocity = dy / Math.max(1, performance.now() - t0);
      dialog.style.transition = "";
      dialog.style.transform = "";
      if (dy > 140 || velocity > 0.6) ctl.requestClose();
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  /* ---------------------------------------------------------- page setup */

  let pageFormCtl = null;
  let selected = -1;

  function initPage() {
    selected = -1;

    // Just saved: bring it into view, then tidy the URL
    const fresh = $(".entry.is-new");
    if (fresh) {
      fresh.scrollIntoView({ block: "center", behavior: "auto" });
      const url = new URL(location.href);
      url.searchParams.delete("uus");
      history.replaceState(history.state, "", url);
    }
    pageFormCtl = null;
    formCtl = null;

    const pageForm = $("#page [data-entry-form]");
    if (pageForm) pageFormCtl = formCtl = initEntryForm(pageForm);

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
  }

  document.addEventListener("DOMContentLoaded", initPage);
  document.addEventListener("htmx:afterSettle", (e) => { if (e.target === document.body) initPage(); });

  // Before htmx swaps the page: close any sheet, remember slide direction
  document.addEventListener("htmx:beforeRequest", (e) => {
    html.dataset.nav = e.detail.elt?.dataset?.nav || "";
  });
  document.addEventListener("htmx:beforeSwap", (e) => {
    if (e.detail.target !== document.body) return;
    html.classList.remove("has-sheet");
    formCtl?.destroy();
    $$("dialog[open]").forEach((d) => d.close());
  });

  /* Log: entries and the add button open the sheet instead of a new page */
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".shell--list a.add, .shell--list a.entry");
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();          // keep htmx's boost from also navigating
    openEntrySheet(link.href);
  }, true);

  // Warm the cache on hover / first touch so the sheet opens instantly
  const warm = (e) => {
    const link = e.target.closest?.(".shell--list a.add, .shell--list a.entry");
    if (link) load(link.href).catch(() => {});
  };
  document.addEventListener("pointerover", warm);
  document.addEventListener("touchstart", warm, { passive: true });

  /* ------------------------------------------------------------ keyboard */

  function selectEntry(i) {
    const all = $$(".shell--list .entry");
    if (!all.length) return;
    selected = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((el, j) => el.classList.toggle("is-selected", j === selected));
    all[selected].scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const typing = isTextField(active);
    const mod = e.metaKey || e.ctrlKey || e.altKey;

    // Entry form (page or sheet) — unless another sheet sits on top of it
    if (formCtl && !(topDialog() && !topDialog().contains(formCtl.form))) {
      const f = formCtl;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); f.form.requestSubmit(); return; }
      if (e.key === "Escape") {
        e.preventDefault();
        if (typing) active.blur();
        else f.requestClose();
        return;
      }
      if (!typing && !mod && /^[0-9]$/.test(e.key) && f.onFirstStep()) {
        e.preventDefault();
        f.setPain(e.key === "0" ? 10 : +e.key);
      }
      return;
    }

    if (topDialog() || typing || mod) return;
    const list = $(".shell--list");
    if (e.key === "?") { openDialog($("#keys")); return; }
    if (!list) return;

    const k = e.key.toLowerCase();
    const click = (el) => el && el.click();
    if (k === "n") { e.preventDefault(); openEntrySheet($(".add", list).href); }
    else if (k === "arrowleft" || k === "h") click($('[data-month="prev"]', list));
    else if (k === "arrowright" || k === "l") click($('[data-month="next"]', list));
    else if (k === "t") click($(".wordmark", list));
    else if (k === "j" || k === "arrowdown") { e.preventDefault(); selectEntry(selected + 1); }
    else if (k === "k" || k === "arrowup") { e.preventDefault(); selectEntry(selected - 1); }
    else if (k === "enter" && selected >= 0) { e.preventDefault(); openEntrySheet($$(".entry", list)[selected].href); }
  });
})();
