# ScholarRank Companion Extension

Chrome extension that enriches Google Scholar result lists with conference and journal ranking data sourced from ConferenceRanks.com and Clarivate's Journal Citation Reports.

## Load the Extension Locally
- Open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked**.
- Select the `extension/scholar-rank/` directory from this repository.
- Visit [https://scholar.google.com](https://scholar.google.com) and run a search. Matching venues show badges under the author/venue line.

## Updating Venue Data
- The seed dataset lives in `data/venueData.js`. Each entry supports multiple aliases so it can match Scholar's varying venue strings.
- Pull the latest CSV/HTML tables from [ConferenceRanks.com](http://www.conferenceranks.com/) and your licensed JCR reports, then normalize names and add them to the dataset.
- Keep `source`, `sourceUrl`, `rank`, and `lastUpdated` fields accurate. Respect each provider's terms of use when exporting or sharing metrics.

## Development Notes
- The content script (`contentScript.js`) parses each `.gs_ri` block, extracts the venue token, and matches it against the normalized dataset.
- Styling lives in `styles.css`; adjust badge colors or typography there.
- Use Chrome's **Extensions > Inspect views** panel to watch for console warnings when you tweak parsing heuristics.

## Known Limitations & Next Steps
- Scholar's venue strings vary widely; extend `candidateFromSegment` and alias lists for better coverage.
- The extension currently ships with a small demo dataset—add automation (e.g., a build step that transforms maintained CSV files) when you secure stable data exports.
- JCR metrics typically sit behind authentication. Do not hard-code restricted data if redistribution violates licensing. Prefer locally maintained JSON that stays private.
