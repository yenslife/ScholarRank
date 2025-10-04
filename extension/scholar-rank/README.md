# ScholarRank Companion Extension

[中文說明（台灣正體）](README.zh-TW.md)

Chrome extension that enriches Google Scholar result lists with conference ranking data sourced from ConferenceRanks.com.

## Load the Extension Locally
- Open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked**.
- Select the `extension/scholar-rank/` directory from this repository.
- Visit [https://scholar.google.com](https://scholar.google.com) and run a search. Matching venues show badges under the author/venue line.
- Click any badge to expand a detail panel with the official name, rank, aliases, and data source.

## Updating Venue Data
- The extension requests fresh rankings from ConferenceRanks.com via the background service worker and falls back to `data/conferences.json` when offline.
- Refresh it with `uv run conferenceranks_scraper.py --verbose` (run inside the `scripts/` directory). The command overwrites the JSON file and keeps aliases/ranks aligned with ConferenceRanks.com.
- Keep `source`, `source_url`, and `last_updated` fields accurate. Respect ConferenceRanks.com's terms of use when sharing derived data.

## Development Notes
- The content script (`contentScript.js`) loads `conferences.json`, normalises aliases, and injects badges into each `.gs_ri` block.
- Styling lives in `styles.css`; adjust badge colours or typography there.
- Use Chrome's **Extensions > Inspect views** panel to watch for console warnings when you tweak parsing heuristics.

## Known Limitations & Next Steps
- Scholar's venue strings vary widely; extend alias generation (in the scraper or the content script) for better coverage.
- Consider automating the scraper via CI or a scheduled job so the dataset stays fresh without manual steps.
- Avoid embedding data from third-party sources that disallow redistribution; keep sensitive datasets private and load them locally if required.
