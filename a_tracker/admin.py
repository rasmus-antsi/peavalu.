from django.contrib import admin

from .models import HeadacheEntry


@admin.register(HeadacheEntry)
class HeadacheEntryAdmin(admin.ModelAdmin):
    list_display = ["date", "start_time", "intensity", "duration_minutes", "medication_name", "was_effective", "user"]
    list_filter = ["user", "date", "intensity"]
    date_hierarchy = "date"
    search_fields = ["other_symptoms", "trigger_factor", "medication_name"]
