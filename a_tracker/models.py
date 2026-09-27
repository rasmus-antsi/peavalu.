from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class HeadacheEntry(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="headache_entries",
        verbose_name="Kasutaja",
    )
    date = models.DateField(verbose_name="Kuupäev")
    start_time = models.TimeField(null=True, blank=True, verbose_name="Algusaeg")
    intensity = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name="Tugevus",
    )

    # --- Valu iseloom ---
    is_pulsating = models.BooleanField(default=False, verbose_name="Pulseeriv/tuksuv")
    is_dull_pressing = models.BooleanField(default=False, verbose_name="Tuim/suruv")
    is_unilateral = models.BooleanField(default=False, verbose_name="Ühepoolne")
    is_bilateral = models.BooleanField(default=False, verbose_name="Kahepoolne")
    is_occipital = models.BooleanField(default=False, verbose_name="Kuklas")
    duration_minutes = models.PositiveIntegerField(null=True, blank=True, verbose_name="Kestus")

    # --- Kaasuvad tunnused ---
    nausea = models.BooleanField(default=False, verbose_name="Iiveldus")
    vomiting = models.BooleanField(default=False, verbose_name="Oksendamine")
    photophobia = models.BooleanField(default=False, verbose_name="Valguskartus")
    phonophobia = models.BooleanField(default=False, verbose_name="Mürakartus")
    exertion_intolerance = models.BooleanField(default=False, verbose_name="Pingutuse talumatus")
    visual_disturbance = models.BooleanField(default=False, verbose_name="Nägemishäire")
    speech_disturbance = models.BooleanField(default=False, verbose_name="Kõnehäire")
    sensory_disturbance = models.BooleanField(default=False, verbose_name="Tundehäired")
    other_symptoms = models.CharField(max_length=255, blank=True, verbose_name="Muud tunnused")
    trigger_factor = models.CharField(max_length=255, blank=True, verbose_name="Vallandav faktor")

    # --- Ravi ---
    medication_name = models.CharField(max_length=100, blank=True, verbose_name="Ravimi nimi")
    dose_mg = models.PositiveIntegerField(null=True, blank=True, verbose_name="Kogus")
    was_effective = models.BooleanField(null=True, blank=True, verbose_name="Mõju")

    CHARACTER_FIELDS = ["is_pulsating", "is_dull_pressing", "is_unilateral", "is_bilateral", "is_occipital"]
    SYMPTOM_FIELDS = [
        "nausea",
        "vomiting",
        "photophobia",
        "phonophobia",
        "exertion_intolerance",
        "visual_disturbance",
        "speech_disturbance",
        "sensory_disturbance",
    ]

    class Meta:
        ordering = ["-date", "-start_time", "-id"]
        verbose_name = "Headache entry"
        verbose_name_plural = "Headache entries"

    def __str__(self):
        return f"{self.date} — {self.intensity}/10"

    def _labels(self, field_names):
        return [self._meta.get_field(name).verbose_name for name in field_names if getattr(self, name)]

    @property
    def character_labels(self):
        return self._labels(self.CHARACTER_FIELDS)

    @property
    def symptom_labels(self):
        return self._labels(self.SYMPTOM_FIELDS)

    @property
    def duration_display(self):
        if self.duration_minutes is None:
            return ""
        hours, minutes = divmod(self.duration_minutes, 60)
        if hours and minutes:
            return f"{hours} h {minutes} min"
        if hours:
            return f"{hours} h"
        return f"{minutes} min"
