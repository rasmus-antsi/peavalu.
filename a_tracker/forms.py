from django import forms

from .models import HeadacheEntry

DURATION_CHOICES = [
    ("", "—"),
    ("30", "30 min"),
    ("60", "1 h"),
    ("120", "2 h"),
    ("240", "4 h"),
    ("480", "8 h"),
    ("720", "12 h"),
    ("1440", "24 h"),
    ("2880", "2 p"),
]

EFFECTIVE_CHOICES = [("", "—"), ("true", "Aitas"), ("false", "Ei aidanud")]


class HeadacheEntryForm(forms.ModelForm):
    intensity = forms.IntegerField(
        label="Tugevus",
        min_value=1,
        max_value=10,
        widget=forms.NumberInput(attrs={"type": "range", "min": 1, "max": 10, "step": 1}),
    )
    duration_minutes = forms.TypedChoiceField(
        label="Kestus",
        choices=DURATION_CHOICES,
        coerce=int,
        empty_value=None,
        required=False,
        widget=forms.RadioSelect,
    )
    was_effective = forms.TypedChoiceField(
        label="Mõju",
        choices=EFFECTIVE_CHOICES,
        coerce=lambda v: v == "true",
        empty_value=None,
        required=False,
        widget=forms.RadioSelect,
    )

    class Meta:
        model = HeadacheEntry
        exclude = ["user"]
        widgets = {
            "date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
            "start_time": forms.TimeInput(format="%H:%M", attrs={"type": "time"}),
            "dose_mg": forms.NumberInput(attrs={"inputmode": "numeric", "placeholder": "—"}),
            "medication_name": forms.TextInput(attrs={"placeholder": "nt Ibuprofeen", "autocomplete": "off"}),
            "other_symptoms": forms.TextInput(attrs={"placeholder": "Midagi veel?", "autocomplete": "off"}),
            "trigger_factor": forms.TextInput(attrs={"placeholder": "Uni, stress, ekraan…", "autocomplete": "off"}),
        }

    # Wizard steps; the template renders one panel per step.
    # Intensity + date first: a complete entry is "slide, save".
    STEPS = [
        ("tugevus", "Tugevus", ["intensity", "date", "start_time"]),
        ("iseloom", "Iseloom", [*HeadacheEntry.CHARACTER_FIELDS, "duration_minutes"]),
        ("tunnused", "Tunnused", [*HeadacheEntry.SYMPTOM_FIELDS, "other_symptoms", "trigger_factor"]),
        ("ravi", "Ravi", ["medication_name", "dose_mg", "was_effective"]),
    ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Keep odd durations (e.g. set via admin) selectable instead of dropping them.
        current = self.initial.get("duration_minutes")
        if current is not None and str(current) not in dict(DURATION_CHOICES):
            field = self.fields["duration_minutes"]
            field.choices = [*field.choices, (str(current), self.instance.duration_display)]
        if self.instance.pk and self.instance.was_effective is not None:
            self.initial["was_effective"] = "true" if self.instance.was_effective else "false"

    def steps(self):
        for slug, title, names in self.STEPS:
            yield {
                "slug": slug,
                "title": title,
                "fields": [self[name] for name in names],
                "has_errors": any(self.errors.get(name) for name in names),
            }

    def first_error_step(self):
        for step in self.steps():
            if step["has_errors"]:
                return step["slug"]
        return self.STEPS[0][0]


class ExportRangeForm(forms.Form):
    """A preset period, or any dates. Presets win, so the form also works without JavaScript."""

    MAX_DAYS = 2 * 366
    PRESETS = [("1", "See kuu", 0), ("3", "3 kuud", 2), ("6", "6 kuud", 5)]   # key, label, months back

    periood = forms.ChoiceField(choices=[(k, label) for k, label, _ in PRESETS] + [("muu", "Muu")], required=False)
    alates = forms.DateField(required=False, widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}))
    kuni = forms.DateField(required=False, widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}))

    def __init__(self, *args, today, **kwargs):
        super().__init__(*args, **kwargs)
        self.today = today

    @staticmethod
    def preset_ranges(today):
        first = today.replace(day=1)
        for key, label, back in ExportRangeForm.PRESETS:
            index = first.year * 12 + first.month - 1 - back
            yield key, label, first.replace(year=index // 12, month=index % 12 + 1), today

    def clean(self):
        cleaned = super().clean()
        preset = {key: (start, end) for key, _, start, end in self.preset_ranges(self.today)}.get(cleaned.get("periood"))
        if preset:
            cleaned["alates"], cleaned["kuni"] = preset
        start, end = cleaned.get("alates"), cleaned.get("kuni")
        if not (start and end):
            raise forms.ValidationError("Vali mõlemad kuupäevad.")
        if start > end:
            raise forms.ValidationError("Algus peab olema enne lõppu.")
        if (end - start).days > self.MAX_DAYS:
            raise forms.ValidationError("Vali kuni kaheaastane periood.")
        return cleaned
