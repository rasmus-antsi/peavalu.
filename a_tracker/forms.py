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
    intensity = forms.TypedChoiceField(
        label="Tugevus",
        choices=[(i, str(i)) for i in range(1, 11)],
        coerce=int,
        widget=forms.RadioSelect,
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
            "dose_mg": forms.NumberInput(attrs={"inputmode": "numeric", "placeholder": "mg"}),
            "medication_name": forms.TextInput(attrs={"placeholder": "nt Ibuprofeen", "autocomplete": "off"}),
            "other_symptoms": forms.TextInput(attrs={"placeholder": "Midagi veel?", "autocomplete": "off"}),
            "trigger_factor": forms.TextInput(attrs={"placeholder": "Uni, stress, ekraan…", "autocomplete": "off"}),
        }

    # Wizard steps; the template renders one panel per step.
    STEPS = [
        ("millal", "Millal", ["date", "start_time", "duration_minutes"]),
        ("valu", "Valu", ["intensity", *HeadacheEntry.CHARACTER_FIELDS]),
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
