# beIN SPORTS — FIFA World Cup 2026 Bracket for Yodeck

A self-updating knockout bracket (Round of 16 → Final), styled in beIN SPORTS branding,
hosted for free on GitHub Pages, refreshed automatically by GitHub Actions, and
displayed on Yodeck as a Website widget.

No server to manage. Total setup time: ~15 minutes.

---

## 1. Get your free API-Football key (direct, not RapidAPI)

The RapidAPI listing for this API is no longer active, so sign up directly instead:

1. Go to https://dashboard.api-football.com/register and create a free account
2. Your **API key** is shown right on your dashboard homepage after signing up
3. Free tier = 100 requests/day, resets at 00:00 UTC. This project calls it ~72 times/day, so you're covered.

## 2. Create the GitHub repository

1. Go to https://github.com/new
2. Name it something like `bein-wc-bracket`. Set it to **Public** (required for free GitHub Pages).
3. Upload every file in this folder, keeping the folder structure exactly as-is:
   ```
   index.html
   style.css
   script.js
   assets/bein-logo.webp
   data/bracket-data.json
   scripts/update-bracket.js
   .github/workflows/update-bracket.yml
   ```
   Easiest way: on the repo page, click **Add file → Upload files**, drag the whole folder in,
   and commit. GitHub preserves the folder structure automatically.

## 3. Add your API key as a secret (keeps it private)

1. In your repo: **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `API_FOOTBALL_KEY`
3. Value: paste the key from Step 1
4. Save

## 4. Turn on GitHub Pages

1. **Settings → Pages**
2. Under "Build and deployment", set **Source: Deploy from a branch**
3. Branch: `main`, folder: `/ (root)` → Save
4. GitHub will give you a URL like:
   `https://YOUR-USERNAME.github.io/bein-wc-bracket/`
   (takes 1-2 minutes to go live the first time)

## 5. Test the auto-update

1. Go to the **Actions** tab in your repo → click **Update World Cup Bracket** → **Run workflow** → **Run workflow**
2. Wait ~30 seconds, refresh the page — you should see a green checkmark
3. Open `data/bracket-data.json` in the repo to confirm it now has real fixture data
4. From here it re-runs automatically every 20 minutes, no action needed

## 6. Add it to Yodeck

1. In Yodeck, go to **Media → Add Media → Website**
2. Paste your GitHub Pages URL from Step 4
3. Set the refresh/reload interval to **5–15 minutes** (Yodeck's own setting — this just
   reloads the page; the page itself also re-fetches data every 5 minutes on its own)
4. Save, then drag it into your playlist like any other media item
5. Set the display duration for that playlist slot (e.g. 15–20 seconds if it's mixed with
   other content, or leave it full-screen on a dedicated bracket screen)

That's it — the screen will now reflect the latest results within ~20 minutes of a match
ending, with zero manual updates required.

---

## Notes & things you may want to tweak

- **Round coverage:** this defaults to Round of 16 → Final (16 matches total), since Round
  of 32 has already been completed for this tournament and a 16-team bracket reads more
  clearly on a TV screen from a distance. If you also want Round of 32 shown, say so and
  it can be added as an extra column.
- **Team codes:** the update script currently derives a 3-letter code from the first
  three letters of the team name (e.g. "Argentina" → "ARG"). A few names won't abbreviate
  perfectly (e.g. "Ivory Coast") — if you spot one, it's a one-line fix in
  `scripts/update-bracket.js`.
- **Colors/fonts:** all design tokens are at the top of `style.css` (`:root` block) —
  purple, gold accent, and fonts are all defined there in one place.
- **Logo:** swap `assets/bein-logo.webp` for a different file any time; just keep the
  same filename or update the `<img src>` in `index.html`.
- **If a request fails:** GitHub Actions will show a red X on that run in the Actions tab
  and the on-screen bracket simply keeps showing the last successful data — it won't go
  blank.
