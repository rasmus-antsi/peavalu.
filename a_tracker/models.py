from django.db import models


class HeadacheEntry(models.Model):
    date = models.DateField(verbose_name="Kuupäev")
    intensity = models.PositiveSmallIntegerField(verbose_name="Tugevus")

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

    class Meta:
        ordering = ["-date"]
        verbose_name = "Headache entry"
        verbose_name_plural = "Headache entries"

    def __str__(self):
        return f"{self.date} — {self.intensity}/10"
