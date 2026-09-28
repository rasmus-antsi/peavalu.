"""The doctor's PDF: a one-page overview, then every headache in the paper diary's order."""

import datetime
import functools
import logging
import urllib.request
from collections import Counter
from pathlib import Path

from django.contrib.staticfiles import finders
from django.template.loader import render_to_string
from django.utils import timezone

from .models import INTENSITY_WORDS, HeadacheEntry
from .summary import month_days, summarize

logger = logging.getLogger(__name__)

FONTS_CSS_URL = "https://api.fontshare.com/v2/css?f[]=sentient@400,401&f[]=switzer@400,500,600&display=swap"


@functools.cache
def _fonts_css():
    """Fontshare's @font-face rules, fetched once per process.

    The fonts may not be redistributed in this public repo, so WeasyPrint loads them
    from Fontshare's CDN like the browser does. Its CSS uses protocol-relative URLs,
    which WeasyPrint doesn't resolve, hence the rewrite. If Fontshare is unreachable
    the PDF still renders, just in fallback fonts (and we try again next time).
    """
    try:
        with urllib.request.urlopen(FONTS_CSS_URL, timeout=5) as response:
            return response.read().decode().replace("url('//", "url('https://")
    except OSError:
        logger.warning("Could not load fonts from Fontshare; the PDF uses fallback fonts")
        _fonts_css.cache_clear()
        return ""


def _months_between(start, end):
    month = start.replace(day=1)
    while month <= end:
        yield month
        month = (month + datetime.timedelta(days=32)).replace(day=1)


def _frequencies(entries, labels_of):
    counts = Counter(label for e in entries for label in labels_of(e))
    return [
        {"label": label, "count": count, "share": count / len(entries)}
        for label, count in counts.most_common()
    ]


def _medication_label(entry):
    return [f"{entry.medication_name} {entry.dose_mg} mg" if entry.dose_mg else entry.medication_name]


def export_context(user, start, end):
    entries = list(
        HeadacheEntry.objects.filter(user=user, date__range=(start, end)).order_by("date", "start_time", "id")
    )
    months = []
    for month in _months_between(start, end):
        in_month = [e for e in entries if (e.date.year, e.date.month) == (month.year, month.month)]
        days = month_days(month, in_month)
        for d in days:
            d["is_outside"] = not start <= d["date"] <= end
        months.append({
            "month": month,
            "entries": in_month,
            "stats": summarize(in_month),
            "days": days,
            "leading_blanks": range(month.weekday()),
        })

    return {
        "user_name": user.get_full_name() or user.get_username(),
        "start": start,
        "end": end,
        "period_days": (end - start).days + 1,
        "generated": timezone.localdate(),
        "entries": entries,
        "months": months,
        "totals": summarize(entries),
        "frequencies": [
            ("Valu iseloom", _frequencies(entries, lambda e: e.character_labels)),
            ("Kaasuvad tunnused", _frequencies(entries, lambda e: e.symptom_labels)),
            ("Vallandav faktor", _frequencies(entries, lambda e: [e.trigger_factor] if e.trigger_factor else [])),
            ("Ravim", _frequencies(entries, lambda e: _medication_label(e) if e.medication_name else [])),
        ] if entries else [],
        "intensity_scale": list(INTENSITY_WORDS.items()),
        "fonts_css": _fonts_css(),
    }


def render_pdf(context):
    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration

    html = render_to_string("a_tracker/export_pdf.html", context)
    # Relative URLs in the template (the logo) resolve against the static folder.
    static_root = Path(finders.find("icons/icon-512.png")).parent.parent
    # full_fonts: embed the fonts as-is rather than subsetting them (the font licence forbids modifying them).
    return HTML(string=html, base_url=static_root.as_uri() + "/").write_pdf(
        font_config=FontConfiguration(), full_fonts=True
    )
