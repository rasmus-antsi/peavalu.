from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .forms import HeadacheEntryForm
from .models import HeadacheEntry


def entry_list(request):
    entries = HeadacheEntry.objects.filter(user=request.user)
    today = timezone.localdate()
    this_month = entries.filter(date__year=today.year, date__month=today.month).aggregate(
        days=Count("date", distinct=True),
        avg=Avg("intensity"),
    )
    return render(request, "a_tracker/entry_list.html", {
        "entries": entries,
        "today": today,
        "month_days": this_month["days"],
        "month_avg": this_month["avg"],
    })


def entry_form(request, pk=None):
    entry = get_object_or_404(HeadacheEntry, pk=pk, user=request.user) if pk else None
    if request.method == "POST":
        form = HeadacheEntryForm(request.POST, instance=entry)
        if form.is_valid():
            new_entry = form.save(commit=False)
            new_entry.user = request.user
            new_entry.save()
            return redirect("entry_list")
    else:
        initial = {} if entry else {"date": timezone.localdate()}
        form = HeadacheEntryForm(instance=entry, initial=initial)
    return render(request, "a_tracker/entry_form.html", {
        "form": form,
        "entry": entry,
        "open_step": form.first_error_step(),
    })


def entry_delete(request, pk):
    entry = get_object_or_404(HeadacheEntry, pk=pk, user=request.user)
    if request.method == "POST":
        entry.delete()
        return redirect("entry_list")
    return render(request, "a_tracker/entry_delete.html", {"entry": entry})
