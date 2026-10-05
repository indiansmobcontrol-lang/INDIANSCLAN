# INDIANS Stat Center

Clan stats site (React + Vite). Weekly Piggy Race (PR) and Space Race (SR) scores are the single
source of truth: rankings, records, averages, trends and ratings are all calculated from them.

## Owner access (only you can edit)
Visitors only ever see the published data. The **Data** page is hidden from the menu; open `#/admin` (add `#/admin` to the site address),
enter the passcode from `src/config.js` (**change it!**) and it unlocks on that browser. Publishing needs your private GitHub token,
so nobody else can change what the site shows.

## Weekly routine
1. In your spreadsheet keep four columns: `Week, Event, Player, Score` (Event is `PR` or `SR`;
   Week can be `18Sep`, `2026-W38` or `18/09/2026`; SR scores can be `740B`). Save as **CSV**.
2. Data → *Import scores* → choose the file → check the preview → *Confirm import*.
   New player names are created automatically. Existing scores are never overwritten.
3. Data → **Publish to website**. The site updates for everyone (phones included) in 1 to 2 minutes.
   (One-time setup: paste a GitHub fine-grained token with *Contents: Read and write* for this repo; steps are shown on the page.)

## Players who left
Data → Players → set status **Left clan (hidden)**. They disappear from every page but their data is kept
(set back to Active to restore). **Delete** erases them and their scores for good.

## Run locally
    npm install
    npm run dev        # http://localhost:5173
    npm run build      # static site in dist/

## Publish free on GitHub Pages
Repo → Settings → Pages → Source: **GitHub Actions**. `.github/workflows/deploy.yml` builds and deploys on every push.

## Change the clan name or colours
- Name: `src/config.js`
- Colours/themes: variables at the top of `src/styles.css`

## Data storage
Imports are stored in your browser (localStorage) until you publish; visitors see `public/data.json`, which *Publish* writes to GitHub. To move to a real database later
(Supabase, Firebase, REST), replace the functions in `src/services/db.js`. The UI only talks to that file.
