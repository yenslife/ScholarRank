# ConferenceRanks Scraper

[中文說明（台灣正體）](README.zh-TW.md)

Utility script for exporting the conference rankings published on [ConferenceRanks.com](http://www.conferenceranks.com/). The scraper now emits data in the exact format expected by the Chrome extension (`extension/scholar-rank/data/conferences.json`).

## Environment Setup
`uv run` automatically creates and updates the managed virtual environment, so you can execute commands immediately. For more about `uv`, see the [GitHub repository](https://github.com/astral-sh/uv).

```bash
uv run conferenceranks_scraper.py --help
```

## Usage
```bash
# Refresh the extension dataset in place (default output) with verbose logging
uv run conferenceranks_scraper.py --verbose

# Write to a custom JSON file and also print the payload
uv run conferenceranks_scraper.py --output data/conferences.json --stdout

# Export a CSV snapshot instead of JSON
uv run conferenceranks_scraper.py --format csv --output data/conferences.csv
```

The scraper mirrors the browser logic: it downloads the embedded `data/*.js` payloads (ERA 2010 and Qualis 2012), normalises each entry, and concatenates them. By default, the result is stored at `extension/scholar-rank/data/conferences.json`, ready for the Chrome extension to consume. Use `--delay` to honour crawl-rate limits; if the site removes those script assets, the code falls back to BeautifulSoup parsing of the rendered table.
