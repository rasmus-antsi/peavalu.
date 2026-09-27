# Peavalu

A quiet, private headache diary that feels like a native iPhone app, built with nothing more than Django, one CSS file and one small JavaScript file.

*Peavalu* is Estonian for "headache". The interface is in Estonian.

<p align="center">
  <img src="docs/screenshots/phone-log.png" width="250" alt="The log: this month's headache days, average intensity and a per-day rhythm strip above a list of entries">
  &nbsp;
  <img src="docs/screenshots/phone-intensity.png" width="250" alt="Logging a headache: a large intensity readout with a 1–10 slider and quick Today / Yesterday / Now buttons">
  &nbsp;
  <img src="docs/screenshots/phone-treatment.png" width="250" alt="The treatment step: one-tap chips for her usual medications and whether it helped">
</p>

> All screenshots use generated demo data (`manage.py seed_demo`). No real entries appear anywhere in this repository.

## Why I built this

My girlfriend's doctor asked her to keep track of her headaches on paper: when each one started, how strong it was, what came with it, and what she took for it.

Paper doesn't work very well for that. The notebook is at home when the headache starts at work. You mean to write it down later, and then you forget, or you only remember roughly when it began. A diary only helps the doctor if it's complete, and a paper one rarely is.

Her phone, though, is with her 24/7. So I turned the doctor's paper diary into something that lives there: the same questions, answered in a few taps, the moment it happens.

The rules were simple:

- **It has to work while it hurts.** Big tap targets, no typing required, and the most important answer (how strong is it?) comes first. Everything after that is optional.
- **It has to be hers.** One small server, a login, and no analytics or third-party accounts. Her entries are visible to her and nobody else.
- **It has to be something she wants to open.** Warm and calm rather than medical. It should feel like a well-made iPhone app, not a form.
- **It has to give the doctor what they asked for.** Every field on the doctor's list is there, months of entries show patterns at a glance, and a PDF export she can hand over is coming next.

It's a small, personal project. I'm sharing the code because the approach (a modern, app-like experience with almost no tooling) might be useful to someone building something similar for a person they care about.

## What it does

- **Log a headache in four short steps:**
  1. Intensity, with a 1–10 slider and words like *Kerge* (mild), *Tugev* (strong) and *Talumatu* (unbearable), plus when it started.
  2. What the pain is like, and how long it lasted.
  3. Accompanying symptoms and possible triggers.
  4. Medication taken, and whether it helped.
- **Learns her habits:** her most-used medications (with dose) and triggers become one-tap chips.
- **Month view:** headache days, average intensity and how often treatment helped. There's a per-day rhythm strip on the phone and a colour-coded calendar on desktop.
- **Feels like iOS:** the form opens as a sheet you pull down to dismiss, and the log behind scales back. If there are unsaved answers, it asks before discarding them. Steps can also be swiped.
- **Every screen size:** iPhone first, then a two-pane layout on desktop that stretches sensibly all the way to an ultrawide monitor.
- **Keyboard on desktop:** `N` new entry, `←`/`→` months, `J`/`K` move between entries, `1`–`0` set intensity, `Enter` next step, `⌘Enter` save, `Esc` close, `?` show all shortcuts.
- **Add to Home Screen** runs it full-screen, like an installed app.

<p align="center">
  <img src="docs/screenshots/desktop-log.png" width="820" alt="Desktop: month overview with calendar and most common symptoms on the left, entries in two columns on the right">
</p>
<p align="center">
  <img src="docs/screenshots/desktop-entry.png" width="820" alt="Desktop: the entry form opens as a step-by-step modal over the log">
</p>
<p align="center">
  <img src="docs/screenshots/phone-symptoms.png" width="250" alt="Symptom chips and trigger suggestions">
  &nbsp;
  <img src="docs/screenshots/phone-login.png" width="250" alt="The login screen">
</p>

## The simple build

There is no frontend build step at all. No npm, no bundler, no framework.

| Layer | What's used |
| --- | --- |
| Server | Django 6.1, server-rendered templates; SQLite locally, Postgres (or SQLite) in production; gunicorn + WhiteNoise |
| Navigation | [htmx](https://htmx.org) 2 (`hx-boost` + preload) with native View Transitions |
| Styles | One hand-written CSS file (`static/css/app.css`) |
| Behaviour | One small vanilla JS file (`static/js/app.js`) |
| Fonts | [Sentient](https://www.fontshare.com/fonts/sentient) + [Switzer](https://www.fontshare.com/fonts/switzer) from Fontshare |

Everything is progressive enhancement: with JavaScript off, every page and form still works as plain HTML. The JavaScript adds the step flow, the sheet, the live intensity readout, one-tap fills and the keyboard shortcuts.

A few details I enjoyed getting right:

- **The page never scrolls. Only the data does.** The app shell is fixed to the viewport, with safe-area insets for the iPhone notch and home bar.
- **The stylesheet is a design system, not a pile of values:**
  - An Apple Dynamic Type ramp (17px body, nothing below 11px).
  - A 4pt spacing grid and 44pt minimum tap targets.
  - Capsule controls with concentric corners (inner radius = outer radius − padding), and Apple-style squircle corners where the browser supports them.
- **Colour is defined in OKLCH, with contrast checked.** The ten intensity colours are even lightness steps. The text on each one is dark or white based on measured WCAG contrast, not guesswork.
- **Fonts were chosen by looking, not by describing.** Four pairings were compared side by side on real screens in Estonian before picking one.
- **Motion is short and purposeful.** Springs where things land, and numbers that roll in the direction you slide. The OS "Reduce Motion" setting is respected throughout.

## Run it locally

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python manage.py migrate
python manage.py seed_demo          # optional: demo user "demo" / "demo" with a few months of fake data
python manage.py createsuperuser    # optional: for /admin
python manage.py runserver
```

Open http://127.0.0.1:8000 and log in. `seed_demo` only runs with `DEBUG` on; see `--help` for `--months`, `--clear` and `--seed`.

Run the tests with:

```bash
python manage.py test
```

## Deploying to Railway

There's no Procfile or config file. Railway's builder recognises a Django project and runs `migrate` and then gunicorn by itself.

1. Create a service from the GitHub repo, and add a Postgres database to the project.
2. In the service's Variables → Raw Editor, paste [`.env.example`](.env.example). Fill in `DJANGO_SECRET_KEY`, and set `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. Generate a domain and deploy.

To create the login, run `railway ssh`, then `python manage.py createsuperuser`. Add further accounts from `/admin`.

Everything else is read from Railway automatically:
- Debug is off.
- The domain is allowed.
- Static files are served by WhiteNoise.
- HTTPS is enforced.

Without `DATABASE_URL`, the app uses SQLite on an attached volume instead. It refuses to start if there's neither, or no secret key, rather than risk losing data.

Elsewhere, the same variables apply, plus `DJANGO_DEBUG=0` and your hostnames.

## Privacy

- Every page requires login (`LoginRequiredMiddleware`), and every query is scoped to the logged-in user. The tests check that one account can't read another's entries.
- There's no sign-up page, no analytics and no tracking. Accounts are created by the owner (`createsuperuser` or the admin).
- The only third-party requests are the fonts (Fontshare) and htmx (jsDelivr). Self-host them if you want zero outside requests.
- The database is `.gitignore`d. Screenshots and seed data are generated.

## Roadmap

- PDF export of a date range, to share with a doctor
- Optional dark mode (light sensitivity is a real thing during a migraine)

## License

[MIT](LICENSE)
