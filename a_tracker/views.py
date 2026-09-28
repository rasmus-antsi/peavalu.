import datetime

from django.contrib import messages
from django.db.models import Count, Max
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone

from .export import export_context, render_pdf
from .forms import ExportRangeForm, HeadacheEntryForm
from .models import INTENSITY_WORDS, HeadacheEntry
from .summary import month_days, summarize


def _month_from_request(request, today):
    try:
        year, month = map(int, request.GET.get("kuu", "").split("-"))
        return datetime.date(year, month, 1)
    except (TypeError, ValueError):
        return today.replace(day=1)


def _shift_month(first_day, delta):
    month_index = first_day.year * 12 + first_day.month - 1 + delta
    return datetime.date(month_index // 12, month_index % 12 + 1, 1)


def _month_url(date, entry=None):
    # ?uus=<id> marks the entry just saved (a #fragment would be lost in htmx's redirect)
    marker = f"&uus={entry.pk}" if entry else ""
    return f"{reverse('entry_list')}?kuu={date:%Y-%m}{marker}"


def entry_list(request):
    today = timezone.localdate()
    month = _month_from_request(request, today)
    entries = list(
        HeadacheEntry.objects.filter(user=request.user, date__year=month.year, date__month=month.month)
    )

    stats = summarize(entries)
    return render(request, "a_tracker/entry_list.html", {
        "entries": entries,
        "just_saved": request.GET.get("uus", ""),
        "month": month,
        "prev_month": _shift_month(month, -1),
        "next_month": _shift_month(month, 1) if _shift_month(month, 1) <= today else None,
        "is_current_month": month == today.replace(day=1),
        "days": month_days(month, entries, today),
        "leading_blanks": range(month.weekday()),
        "headache_days": stats["headache_days"],
        "avg_intensity": stats["avg_intensity"],
        "top_symptoms": stats["symptom_counts"].most_common(3),
        "med_helped": stats["med_helped"],
        "med_rated": stats["med_rated"],
    })


def _suggestions(user):
    """Her own most-used medications and triggers, for one-tap filling."""
    qs = HeadacheEntry.objects.filter(user=user)
    meds = (
        qs.exclude(medication_name="")
        .values("medication_name")
        .annotate(uses=Count("id"), dose=Max("dose_mg"), last=Max("date"))
        .order_by("-uses", "-last")[:6]
    )
    triggers = (
        qs.exclude(trigger_factor="")
        .values("trigger_factor")
        .annotate(uses=Count("id"), last=Max("date"))
        .order_by("-uses", "-last")[:6]
    )
    return list(meds), [t["trigger_factor"] for t in triggers]


def entry_form(request, pk=None):
    entry = get_object_or_404(HeadacheEntry, pk=pk, user=request.user) if pk else None
    if request.method == "POST":
        form = HeadacheEntryForm(request.POST, instance=entry)
        if form.is_valid():
            new_entry = form.save(commit=False)
            new_entry.user = request.user
            new_entry.save()
            messages.success(request, "Muudatused salvestatud" if entry else "Peavalu kirja pandud")
            return redirect(_month_url(new_entry.date, new_entry))
    else:
        initial = {} if entry else {"date": timezone.localdate(), "intensity": 5}
        form = HeadacheEntryForm(instance=entry, initial=initial)

    meds, triggers = _suggestions(request.user)
    today = timezone.localdate()
    try:
        intensity_now = min(max(int(form["intensity"].value()), 1), 10)
    except (TypeError, ValueError):
        intensity_now = 5
    return render(request, "a_tracker/entry_form.html", {
        "form": form,
        "entry": entry,
        "open_step": form.first_error_step(),
        "today": today,
        "yesterday": today - datetime.timedelta(days=1),
        "recent_meds": meds,
        "recent_triggers": triggers,
        "intensity_words": INTENSITY_WORDS,
        "intensity_now": intensity_now,
        "intensity_word": INTENSITY_WORDS[intensity_now],
    })


def entry_delete(request, pk):
    entry = get_object_or_404(HeadacheEntry, pk=pk, user=request.user)
    if request.method == "POST":
        month = entry.date
        entry.delete()
        messages.success(request, "Kirje kustutatud")
        return redirect(_month_url(month))
    return render(request, "a_tracker/entry_delete.html", {"entry": entry})


def _export_presets(today):
    this_month = today.replace(day=1)
    return [
        ("See kuu", this_month, today),
        ("3 kuud", _shift_month(this_month, -2), today),
        ("6 kuud", _shift_month(this_month, -5), today),
    ]


def export_form(request, form=None):
    today = timezone.localdate()
    if form is None:
        form = ExportRangeForm(initial={"alates": _shift_month(today.replace(day=1), -2), "kuni": today})
    return render(request, "a_tracker/export_form.html", {
        "form": form,
        "presets": _export_presets(today),
    })


def export_pdf(request):
    form = ExportRangeForm(request.GET)
    if not form.is_valid():
        return export_form(request, form)
    start, end = form.cleaned_data["alates"], form.cleaned_data["kuni"]
    pdf = render_pdf(export_context(request.user, start, end))
    response = HttpResponse(pdf, content_type="application/pdf")
    # inline: the phone opens it in its PDF viewer, with Share / Print / Save to Files
    response["Content-Disposition"] = f'inline; filename="peavalu-{start:%Y-%m-%d}_{end:%Y-%m-%d}.pdf"'
    return response
