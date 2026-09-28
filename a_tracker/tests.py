import datetime
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import HeadacheEntry

User = get_user_model()


class AuthTests(TestCase):
    def test_pages_require_login(self):
        for url in [reverse("entry_list"), reverse("entry_create")]:
            response = self.client.get(url)
            self.assertRedirects(response, f"{reverse('login')}?next={url}")

    def test_login_page_is_public(self):
        self.assertEqual(self.client.get(reverse("login")).status_code, 200)


class EntryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("mari", password="salasona-123")
        self.other = User.objects.create_user("teine", password="salasona-123")
        self.client.force_login(self.user)

    def make_entry(self, user, **kwargs):
        return HeadacheEntry.objects.create(user=user, date=datetime.date(2026, 9, 1), intensity=5, **kwargs)

    def test_list_shows_only_own_entries(self):
        self.make_entry(self.user, medication_name="Minu ravim")
        self.make_entry(self.other, medication_name="Teise ravim")
        response = self.client.get(reverse("entry_list"))
        self.assertContains(response, "Minu ravim")
        self.assertNotContains(response, "Teise ravim")

    def test_cannot_open_or_delete_other_users_entry(self):
        entry = self.make_entry(self.other)
        self.assertEqual(self.client.get(reverse("entry_update", args=[entry.pk])).status_code, 404)
        self.assertEqual(self.client.post(reverse("entry_delete", args=[entry.pk])).status_code, 404)
        self.assertTrue(HeadacheEntry.objects.filter(pk=entry.pk).exists())

    def test_create_entry(self):
        response = self.client.post(reverse("entry_create"), {
            "date": "2026-09-27",
            "start_time": "",
            "intensity": "7",
            "duration_minutes": "120",
            "nausea": "on",
            "was_effective": "true",
        })
        entry = HeadacheEntry.objects.get()
        self.assertRedirects(response, f"{reverse('entry_list')}?kuu=2026-09&uus={entry.pk}")
        self.assertEqual(entry.user, self.user)
        self.assertEqual(entry.intensity, 7)
        self.assertEqual(entry.duration_minutes, 120)
        self.assertIsNone(entry.start_time)
        self.assertTrue(entry.nausea)
        self.assertIs(entry.was_effective, True)

    def test_blank_optional_choices_save_as_null(self):
        self.client.post(reverse("entry_create"), {"date": "2026-09-27", "intensity": "3"})
        entry = HeadacheEntry.objects.get()
        self.assertIsNone(entry.duration_minutes)
        self.assertIsNone(entry.was_effective)

    def test_intensity_out_of_range_is_rejected(self):
        response = self.client.post(reverse("entry_create"), {"date": "2026-09-27", "intensity": "11"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["open_step"], "tugevus")
        self.assertFalse(HeadacheEntry.objects.exists())

    def test_edit_keeps_nonstandard_duration(self):
        entry = self.make_entry(self.user, duration_minutes=95, was_effective=False)
        response = self.client.get(reverse("entry_update", args=[entry.pk]))
        self.assertContains(response, "1 h 35 min")
        self.assertContains(response, 'value="95"')
        self.assertContains(response, 'value="false" id="id_was_effective_2" checked')

    def test_month_view_shows_only_that_month(self):
        self.make_entry(self.user, medication_name="Septembri ravim")
        HeadacheEntry.objects.create(user=self.user, date=datetime.date(2026, 8, 15), intensity=8, medication_name="Augusti ravim")
        response = self.client.get(reverse("entry_list") + "?kuu=2026-08")
        self.assertContains(response, "Augusti ravim")
        self.assertNotContains(response, "Septembri ravim")
        self.assertEqual(response.context["headache_days"], 1)

    def test_bad_month_param_falls_back_to_current_month(self):
        response = self.client.get(reverse("entry_list") + "?kuu=2026-13")
        self.assertEqual(response.status_code, 200)

    def test_form_suggests_her_frequent_medications(self):
        self.make_entry(self.user, medication_name="Sumatriptaan", dose_mg=50)
        self.make_entry(self.other, medication_name="Teise ravim")
        response = self.client.get(reverse("entry_create"))
        names = [m["medication_name"] for m in response.context["recent_meds"]]
        self.assertEqual(names, ["Sumatriptaan"])

    def test_delete_entry(self):
        entry = self.make_entry(self.user)
        self.client.post(reverse("entry_delete", args=[entry.pk]))
        self.assertFalse(HeadacheEntry.objects.exists())


class ExportTests(TestCase):
    def setUp(self):
        # Keep tests offline: render with fallback fonts instead of fetching Fontshare's
        patcher = mock.patch("a_tracker.export._fonts_css", return_value="")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = User.objects.create_user("mari", password="salasona-123")
        self.other = User.objects.create_user("teine", password="salasona-123")
        self.client.force_login(self.user)

    def pdf_url(self, start, end):
        return f"{reverse('export_pdf')}?alates={start}&kuni={end}"

    def test_export_pages_require_login(self):
        self.client.logout()
        for url in [reverse("export_form"), self.pdf_url("2026-09-01", "2026-09-30")]:
            self.assertEqual(self.client.get(url).status_code, 302)

    def test_export_form_offers_presets(self):
        response = self.client.get(reverse("export_form"))
        self.assertEqual([label for label, *_ in response.context["presets"]], ["See kuu", "3 kuud", "6 kuud"])

    def test_pdf_contains_only_own_entries_in_range(self):
        from .export import export_context

        mine = HeadacheEntry.objects.create(user=self.user, date=datetime.date(2026, 9, 3), intensity=6, medication_name="Ibuprofeen")
        HeadacheEntry.objects.create(user=self.user, date=datetime.date(2026, 10, 1), intensity=4)
        HeadacheEntry.objects.create(user=self.other, date=datetime.date(2026, 9, 3), intensity=8)
        context = export_context(self.user, datetime.date(2026, 8, 15), datetime.date(2026, 9, 30))
        self.assertEqual(context["entries"], [mine])
        self.assertEqual([m["month"] for m in context["months"]], [datetime.date(2026, 8, 1), datetime.date(2026, 9, 1)])
        self.assertEqual(context["totals"]["med_days"], 1)
        self.assertEqual(context["period_days"], 47)

    def test_pdf_response(self):
        HeadacheEntry.objects.create(user=self.user, date=datetime.date(2026, 9, 3), intensity=6, nausea=True)
        response = self.client.get(self.pdf_url("2026-09-01", "2026-09-30"))
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn('filename="peavalu-2026-09-01_2026-09-30.pdf"', response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_empty_range_still_renders(self):
        response = self.client.get(self.pdf_url("2020-01-01", "2020-01-31"))
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_bad_range_shows_form_errors(self):
        for query in ["?alates=2026-09-30&kuni=2026-09-01", "?alates=x&kuni=", "?alates=2020-01-01&kuni=2026-01-01"]:
            response = self.client.get(reverse("export_pdf") + query)
            self.assertEqual(response.status_code, 200)
            self.assertTemplateUsed(response, "a_tracker/export_form.html")
            self.assertFalse(response.context["form"].is_valid())


class SeedDemoTests(TestCase):
    def test_seed_demo_creates_user_and_valid_entries(self):
        from django.core.management import call_command
        from django.test import override_settings

        with override_settings(DEBUG=True):
            call_command("seed_demo", "--user", "proov", "--months", "2", stdout=open("/dev/null", "w"))
        entries = HeadacheEntry.objects.filter(user__username="proov")
        self.assertTrue(entries.exists())
        self.assertTrue(all(1 <= e.intensity <= 10 for e in entries))

