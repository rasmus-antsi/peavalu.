"""Numbers shared by the month view and the PDF export, so both always agree."""

import calendar
from collections import Counter


def summarize(entries):
    """Headache days, medication days, intensity and treatment stats for a list of entries."""
    days = {e.date for e in entries}
    med_days = {e.date for e in entries if e.medication_name}
    rated = [e.was_effective for e in entries if e.was_effective is not None]
    return {
        "count": len(entries),
        "headache_days": len(days),
        "med_days": len(med_days),
        "avg_intensity": sum(e.intensity for e in entries) / len(entries) if entries else None,
        "max_intensity": max((e.intensity for e in entries), default=None),
        "med_helped": sum(rated),
        "med_rated": len(rated),
        "symptom_counts": Counter(label for e in entries for label in e.symptom_labels),
    }


def month_days(month, entries, today=None):
    """One dict per day of `month`, with the strongest headache that day."""
    peak_by_day, entry_by_day = {}, {}
    for e in entries:
        peak_by_day[e.date.day] = max(peak_by_day.get(e.date.day, 0), e.intensity)
        entry_by_day.setdefault(e.date.day, e.pk)
    days_in_month = calendar.monthrange(month.year, month.month)[1]
    return [
        {
            "day": d,
            "date": month.replace(day=d),
            "peak": peak_by_day.get(d),
            "entry_id": entry_by_day.get(d),
            "is_today": today is not None and month.replace(day=d) == today,
            "is_future": today is not None and month.replace(day=d) > today,
        }
        for d in range(1, days_in_month + 1)
    ]
