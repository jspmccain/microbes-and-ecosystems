# Microbes & Ecosystems Lab — Website

A funky, dark, bioluminescent-themed static website with an animated boids
(flocking) swarm in the background. No build step, no framework — just
HTML, CSS, and vanilla JavaScript, so anyone in the lab can edit it.

## What's here

```
lab-website/
├── index.html          Home
├── research.html        Research themes (aquatic ecosystems, water quality, groundwater)
├── people.html          PI, lab members, alumni
├── publications.html    Publications list, grouped by year
├── news.html             News / timeline feed
├── join.html             Open positions + how to apply
├── contact.html          Contact info + message form
├── css/style.css         All styling (colors, layout, components)
├── js/boids.js           The animated background swarm
├── js/main.js            Mobile nav toggle, active-link highlighting
├── CNAME                 Custom domain for GitHub Pages (microbes-and-ecosystems.fyi)
└── assets/               Put logos/photos here
```

## 1. Replace the placeholders

`[University Name]` and `[Department Name]` are already filled in
(University of Toronto / Department of Ecology and Evolutionary Biology,
across every page's nav subtitle and footer). The PI, Dr. Scott McCain, is
named on the People page only (see note below). What's left:

- `[Field]`, `[Institution]` (x2) — PI's Ph.D./postdoc details, in the
  bio on **people.html**.
- `[Building Name]`, `[Postal Code]`, `[Phone Number]` — **contact.html**.
- `lab@example.edu` — used throughout as the contact email; swap for a
  real address whenever one's ready.
- The **People** page roster (Dr. Maya Kessler, Jordan Lee, etc.) is
  entirely sample content — replace with your actual lab members. Each
  person is a `.person-card` in `people.html`; copy/paste the block and
  edit name, role, and description. The two-letter "avatar" is just their
  initials — swap `<div class="avatar sm">MK</div>` for
  `<img src="assets/maya.jpg" alt="Maya Kessler">` if you have photos.
- The **Publications** page entries are sample citations — replace with
  your real publication list, or see "Publications from a data file" below.
- The **News** page entries are sample posts — replace with real updates
  as they happen; newest should go at the top.

For any remaining find-and-replace across all pages at once:

```bash
# macOS: keep the '' after -i; Linux/GNU sed: drop it
find . -name "*.html" -exec sed -i '' 's/lab@example.edu/yourlab@youruniversity.edu/g' {} +
```

**Note on the PI's name**: by request, the PI's name (Dr. Scott McCain)
appears **only on the People page** — the Publications page intentionally
omits it, so every citation just ends in "et al." instead of naming the
PI next to nearly every entry.

## 2. Preview it locally

No build step needed. From the `lab-website` folder, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. (Opening `index.html`
directly by double-clicking works too, though a local server is more
reliable for testing.)

## 3. The background animation (js/boids.js)

`#boids-bg` is a `<canvas>` covering the full viewport behind the content
on every page. `js/boids.js` runs a classic flocking simulation (separation
/ alignment / cohesion) with four color "schools" (cyan, magenta, violet,
green) that loosely swarm like plankton. A few things worth knowing:

- **Particle count** scales with screen size automatically (see
  `boidCount()`), capped between 36 and 130 for performance.
- **Respects `prefers-reduced-motion`**: if a visitor has that OS setting
  on, the swarm renders as a single static frame instead of animating.
- **Pauses when the tab is hidden** to save battery/CPU.
- **Mouse interaction**: nearby boids gently scatter from the cursor.
- To change colors, edit the `SCHOOLS` array at the top of `boids.js`.
- To make it calmer/busier, tweak `MAX_SPEED`, `NEIGHBOR_RADIUS`, or the
  divisor in `boidCount()` (larger divisor = fewer particles).

## 4. The design system (css/style.css)

All colors, fonts, spacing, and component styles live in one file, driven
by CSS custom properties at the top of `css/style.css` (`--bg`, `--cyan`,
`--magenta`, `--violet`, `--green`, fonts, radii, etc.). Change a value
there and it updates everywhere. Fonts are loaded from Google Fonts
(Space Grotesk for headings, Inter for body, IBM Plex Mono for the small
uppercase labels) via a `<link>` tag at the top of each page.

## 5. Making the contact form actually send email

`contact.html` has a plain HTML form that isn't wired to anything yet
(static sites can't process form submissions on their own). Two easy,
free options:

- **Formspree** (https://formspree.io) — sign up, get a form endpoint URL,
  and set it as the form's `action`, e.g.
  `<form action="https://formspree.io/f/yourFormId" method="POST">`.
- **Netlify Forms** — if you deploy on Netlify (see below), add
  `data-netlify="true" name="contact"` to the `<form>` tag and Netlify
  handles the rest automatically.

Or simplest of all: replace the form with a `mailto:` link.

## 6. Publications from a data file (optional upgrade)

Right now publications are hand-written HTML in `publications.html`. If
your list grows large or you want it to stay in sync with a BibTeX/Google
Scholar export, consider maintaining a `publications.json` file and
rendering it with a small script — happy to help set that up later.

## 7. Deploying the site (GitHub Pages + microbes-and-ecosystems.fyi)

The domain **microbes-and-ecosystems.fyi** has already been bought, and a
`CNAME` file containing that domain is already sitting in this folder —
GitHub Pages reads that file to know which custom domain to serve. Steps:

**a. Create the GitHub repo and push the site**

```bash
cd lab-website
git init
git add .
git commit -m "Initial lab website"
gh repo create microbes-and-ecosystems --public --source=. --push
```

(No `gh` CLI? Create an empty repo at github.com/new instead, then:
`git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git`,
`git branch -M main`, `git push -u origin main`.)

**b. Turn on Pages**

In the repo on GitHub: Settings → Pages → under "Build and deployment,"
Source = "Deploy from a branch," Branch = `main`, folder = `/ (root)` →
Save. GitHub will publish at `https://YOUR-USERNAME.github.io/YOUR-REPO/`
first — that's expected, the custom domain kicks in next.

**c. Set the custom domain**

Still on Settings → Pages, under "Custom domain" enter
`microbes-and-ecosystems.fyi` and save. (Since the `CNAME` file is already
in the repo, GitHub may pick it up automatically — either way, confirm it
shows up in that field.)

**d. Point the domain's DNS at GitHub**

At whichever registrar you bought the domain from, open its DNS
settings and add these **four A records** (this is an apex/root domain —
no `www` — so it needs A records, not a CNAME record, at the root):

| Type | Host / Name | Value |
|---|---|---|
| A | @ (or blank, meaning the root) | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

If you'd also like `www.microbes-and-ecosystems.fyi` to work, add one more
record:

| Type | Host / Name | Value |
|---|---|---|
| CNAME | www | YOUR-USERNAME.github.io |

**e. Wait for DNS, then enforce HTTPS**

DNS changes usually take anywhere from a few minutes to a few hours to
propagate (occasionally up to 24h). You can check with
`dig microbes-and-ecosystems.fyi +short` — once it returns the four
185.199.x.153 addresses, it's live. Back in Settings → Pages, GitHub
should show a green checkmark next to the domain; tick "Enforce HTTPS"
(it may be greyed out for a few minutes while GitHub issues the
certificate — just refresh the page and check again).

That's it — `https://microbes-and-ecosystems.fyi` will serve the site.
Every future `git push` to `main` redeploys it automatically.

**Alternatives**, if you'd rather not use GitHub Pages:
- **Netlify**: drag-and-drop the `lab-website` folder onto
  https://app.netlify.com/drop, or connect the GitHub repo for automatic
  redeploys on every push. Custom domains work similarly (add the domain
  in Site settings → Domain management, then point DNS at Netlify).
- **Your university's web server**: if your department offers standard
  web hosting, upload the contents of this folder via SFTP/SCP — no
  build step is required, it's ready to serve as-is (you'd skip the
  `CNAME` file in that case, since that's a GitHub Pages–specific thing).

## 8. Adding a new page

Copy an existing page (e.g. `contact.html`) as a starting point so you
keep the `<canvas id="boids-bg">`, the nav, and the footer. Add a link to
it in the `.nav-links` block and footer `.footer-grid` on **every** page
(there's no shared template/include system here — it's plain HTML, so nav
and footer are repeated on each page and need to be updated in all of
them when they change).
