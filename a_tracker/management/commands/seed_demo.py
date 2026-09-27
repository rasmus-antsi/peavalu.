import datetime
import random

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from a_tracker.models import HeadacheEntry

MEDS = {
    "migraine": [("Sumatriptaan", 50), ("Ibuprofeen", 400)],
    "tension": [("Ibuprofeen", 400), ("Paratsetamool", 500), ("Paratsetamool", 1000)],
}
TRIGGERS = {
    "migraine": ["Unepuudus", "Ere valgus", "Ilmamuutus", "Stress", "Alkohol"],
    "tension": ["Stress", "Ekraan", "Vahele jäänud söögikord", "Kehv rüht", "Unepuudus"],
}


class Command(BaseCommand):
    help = "Fill the local database with realistic demo headache entries (DEBUG only)."

    def add_arguments(self, parser):
        parser.add_argument("--user", default="demo", help="Username to attach entries to (created if missing).")
        parser.add_argument("--password", default="demo", help="Password for a newly created user.")
        parser.add_argument("--months", type=int, default=4, help="How many months back to generate.")
        parser.add_argument("--clear", action="store_true", help="Delete this user's existing entries first.")
        parser.add_argument("--seed", type=int, default=7, help="Random seed, for repeatable data.")

    def handle(self, *args, **opts):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG on.")

        User = get_user_model()
        user, created = User.objects.get_or_create(username=opts["user"])
        if created:
            user.set_password(opts["password"])
            user.save()
            self.stdout.write(f"Created user '{user.username}'.")

        if opts["clear"]:
            deleted, _ = HeadacheEntry.objects.filter(user=user).delete()
            self.stdout.write(f"Deleted {deleted} existing entries.")

        rng = random.Random(opts["seed"])
        today = timezone.localdate()
        start = today - datetime.timedelta(days=30 * opts["months"])
        entries = []

        day = start
        while day <= today:
            # Roughly 7 headache days a month, a little clustered
            if rng.random() < 0.23:
                entries.append(self._entry(rng, user, day))
                if rng.random() < 0.08:  # occasional second headache the same day
                    entries.append(self._entry(rng, user, day))
            day += datetime.timedelta(days=1)

        HeadacheEntry.objects.bulk_create(entries)
        self.stdout.write(self.style.SUCCESS(
            f"Added {len(entries)} entries for '{user.username}' from {start:%d.%m.%Y} to {today:%d.%m.%Y}."
        ))

    def _entry(self, rng, user, day):
        kind = "migraine" if rng.random() < 0.4 else "tension"
        migraine = kind == "migraine"

        intensity = rng.choice([6, 7, 7, 8, 8, 9, 10]) if migraine else rng.choice([2, 3, 3, 4, 4, 5, 6])
        start_time = None
        if rng.random() < 0.8:
            start_time = datetime.time(rng.choice([6, 7, 8, 10, 13, 15, 16, 17, 19, 21]), rng.choice([0, 15, 30, 45]))
        duration = None
        if rng.random() < 0.85:
            duration = rng.choice([240, 480, 720, 1440, 2880]) if migraine else rng.choice([30, 60, 120, 120, 240])

        med_name, dose, effective = "", None, None
        if rng.random() < (0.9 if migraine else 0.55):
            med_name, dose = rng.choice(MEDS[kind])
            effective = rng.random() < (0.7 if med_name == "Sumatriptaan" else 0.55)
            if rng.random() < 0.15:
                effective = None  # didn't note whether it helped

        return HeadacheEntry(
            user=user,
            date=day,
            start_time=start_time,
            intensity=intensity,
            is_pulsating=migraine and rng.random() < 0.85,
            is_dull_pressing=not migraine and rng.random() < 0.85,
            is_unilateral=migraine and rng.random() < 0.75,
            is_bilateral=not migraine and rng.random() < 0.8,
            is_occipital=rng.random() < 0.15,
            duration_minutes=duration,
            nausea=migraine and rng.random() < 0.7,
            vomiting=migraine and intensity >= 8 and rng.random() < 0.35,
            photophobia=migraine and rng.random() < 0.8 or rng.random() < 0.1,
            phonophobia=migraine and rng.random() < 0.6,
            exertion_intolerance=migraine and rng.random() < 0.5,
            visual_disturbance=migraine and rng.random() < 0.2,
            speech_disturbance=migraine and rng.random() < 0.04,
            sensory_disturbance=migraine and rng.random() < 0.08,
            other_symptoms=rng.choice(["", "", "", "", "Kaelajäikus", "Pearinglus", "Väsimus"]),
            trigger_factor=rng.choice(TRIGGERS[kind]) if rng.random() < 0.6 else "",
            medication_name=med_name,
            dose_mg=dose,
            was_effective=effective,
        )
