#!/usr/bin/env python3
"""ConferenceRanks.com scraper.

ConferenceRanks 將會議資料封裝在靜態的 `data/*.js` 檔案內，這隻腳本會仿照瀏覽器行為：
1. 下載首頁 HTML。
2. 找出所有資料檔 (`data/era2010.min.js`、`data/qualis2012.min.js` …)。
3. 依序抓取並解析 JSON，整合成統一格式，預設直接寫入
   `extension/scholar-rank/data/conferences.json`，供 Chrome 擴充功能使用。

使用範例
---------
# 以預設設定重建擴充功能資料集（並顯示詳細日誌）
uv run conferenceranks_scraper.py --verbose

# 輸出到自訂路徑，並同時列印到終端機
uv run conferenceranks_scraper.py --output data/conferences.json --stdout

腳本會自動節流（預設每個檔案間隔 0.5 秒），執行前請先確認
http://www.conferenceranks.com/ 的使用條款並避免過度請求。
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence
from urllib.parse import urljoin

import requests

try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    BeautifulSoup = None  # type: ignore

LOGGER = logging.getLogger("conferenceranks.scraper")
BASE_URL = "http://www.conferenceranks.com/"
DATASET_SCRIPT_PATTERN = r"<script[^>]+src=[\"'](data/[^\"']+)[\"']"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXTENSION_DATASET = REPO_ROOT / "extension/scholar-rank/data/conferences.json"
DEFAULT_SOURCE_URL = BASE_URL


def _dedupe_aliases(values: Iterable[str]) -> List[str]:
    seen: List[str] = []
    for value in values:
        if not value:
            continue
        token = str(value).strip()
        if token and token not in seen:
            seen.append(token)
    return seen


@dataclass
class ConferenceRow:
    name: str
    abbrv: str
    rank: str
    source: str
    dataset_id: str
    aliases: List[str]

    @classmethod
    def from_iterable(cls, raw: Iterable[str], dataset_id: str, source: str) -> "ConferenceRow":
        parts = list(raw)
        while len(parts) < 4:
            parts.append("")
        name, abbrv, rank, _ = parts[:4]
        name = name.strip()
        abbrv = abbrv.strip()
        rank = rank.strip()
        aliases = _dedupe_aliases([name, abbrv])
        return cls(name=name, abbrv=abbrv, rank=rank, source=source, dataset_id=dataset_id, aliases=aliases)

    def to_csv_row(self) -> Dict[str, str]:
        return {
            "name": self.name,
            "abbrv": self.abbrv,
            "rank": self.rank,
            "source": self.source,
        }

    def to_extension_entry(self, *, last_updated: str) -> Dict[str, object]:
        aliases = self.aliases or _dedupe_aliases([self.name, self.abbrv])
        return {
            "type": "conference",
            "name": self.name,
            "abbrv": self.abbrv,
            "aliases": aliases,
            "rank": self.rank,
            "source": self.source,
            "source_url": DEFAULT_SOURCE_URL,
            "last_updated": last_updated,
        }


DatasetMeta = Dict[str, str]


def parse_dataset_metadata(html: str) -> Dict[str, DatasetMeta]:
    """Extract metadata (name, year…) from inline `setData*` helpers."""
    import re

    pattern = re.compile(
        r"function\s+setData([A-Za-z0-9_]+)\s*\(rank_data\)\s*\{\s*var\s+dataset\s*=\s*\{(.*?)\};",
        re.DOTALL,
    )
    metas: Dict[str, DatasetMeta] = {}
    for match in pattern.finditer(html):
        dataset_id = match.group(1).lower()
        body = match.group(2)
        name_match = re.search(r"name\s*:\s*'([^']*)'", body)
        description_match = re.search(r"description\s*:\s*'([^']*)'", body)
        year_match = re.search(r"year\s*:\s*([0-9]{4})", body)
        metas[dataset_id] = {
            "id": dataset_id,
            "name": name_match.group(1) if name_match else dataset_id,
            "description": description_match.group(1) if description_match else "",
            "year": year_match.group(1) if year_match else "",
        }
    LOGGER.debug("Discovered dataset metadata keys: %s", sorted(metas))
    return metas


def extract_dataset_scripts(html: str) -> List[str]:
    import re

    scripts = re.findall(DATASET_SCRIPT_PATTERN, html, flags=re.IGNORECASE)
    unique_scripts: List[str] = []
    seen: set[str] = set()
    for src in scripts:
        if src not in seen:
            unique_scripts.append(src)
            seen.add(src)
    LOGGER.debug("Dataset scripts: %s", unique_scripts)
    return unique_scripts


def parse_dataset_payload(raw_script: str) -> Sequence[Dict[str, object]]:
    start = raw_script.find("[")
    end = raw_script.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Unable to locate JSON array in dataset script")
    json_blob = raw_script[start : end + 1]
    return json.loads(json_blob)


def dataset_source_name(dataset_id: str, meta: Optional[DatasetMeta]) -> str:
    if meta and meta.get("name"):
        label = meta["name"]
    else:
        label = dataset_id.upper()
    if meta and meta.get("year"):
        label = f"{label} {meta['year']}".strip()
    return label


def fetch_dataset_rows(
    session: requests.Session,
    base_url: str,
    script_src: str,
    meta: Optional[DatasetMeta],
) -> List[ConferenceRow]:
    url = urljoin(base_url, script_src)
    LOGGER.info("Downloading dataset %s", url)
    response = session.get(url, timeout=60)
    response.raise_for_status()
    payload = parse_dataset_payload(response.text)
    dataset_id = Path(script_src).stem.split(".")[0].lower()
    source_name = dataset_source_name(dataset_id, meta)

    rows: List[ConferenceRow] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        abbrv = str(item.get("abbrv", item.get("abbrev", ""))).strip()
        rank = str(item.get("rank", item.get("class", ""))).strip()
        aliases = _dedupe_aliases([
            name,
            abbrv,
            item.get("abbr", ""),
            item.get("alternate-name", ""),
        ])
        rows.append(
            ConferenceRow(
                name=name,
                abbrv=abbrv,
                rank=rank,
                source=source_name,
                dataset_id=dataset_id,
                aliases=aliases,
            )
        )
    LOGGER.info("Parsed %s rows from dataset %s", len(rows), source_name)
    return rows


def parse_first_page(html: str) -> List[ConferenceRow]:
    if not BeautifulSoup:
        raise RuntimeError(
            "bs4 (BeautifulSoup) is required for fallback HTML parsing. Install with 'uv add beautifulsoup4'."
        )

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", {"id": "datatable"})
    if table is None:
        LOGGER.warning("Could not locate #datatable in HTML; fallback parsing aborted")
        return []
    rows: List[ConferenceRow] = []
    for tr in table.find_all("tr"):
        cells = [cell.get_text(strip=True) for cell in tr.find_all("td")]
        if len(cells) != 4:
            continue
        rows.append(
            ConferenceRow.from_iterable(
                cells,
                dataset_id="html",
                source="ConferenceRanks.com",
            )
        )
    return rows


def scrape_conferences(
    base_url: str,
    delay: float,
    max_rows: Optional[int],
) -> List[ConferenceRow]:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        }
    )

    LOGGER.info("Fetching landing page %s", base_url)
    response = session.get(base_url, timeout=30)
    response.raise_for_status()
    html = response.text

    metas = parse_dataset_metadata(html)
    dataset_scripts = extract_dataset_scripts(html)
    rows: List[ConferenceRow] = []

    if dataset_scripts:
        for script_src in dataset_scripts:
            dataset_id = Path(script_src).stem.split(".")[0].lower()
            meta = metas.get(dataset_id)
            try:
                batch = fetch_dataset_rows(session, base_url, script_src, meta)
            except Exception as exc:  # pragma: no cover - network failure
                LOGGER.error("Failed to process dataset %s: %s", script_src, exc)
                continue
            rows.extend(batch)
            if max_rows and len(rows) >= max_rows:
                LOGGER.info("Reached max_rows=%s", max_rows)
                return rows[: max_rows]
            if delay:
                time.sleep(delay)
        return rows

    LOGGER.warning(
        "No dataset scripts found; falling back to parsing first rendered page only"
    )
    rows = parse_first_page(html)
    if max_rows:
        rows = rows[:max_rows]
    return rows


def write_output(
    rows: List[ConferenceRow],
    output: Optional[Path],
    fmt: str,
    stdout: bool,
) -> None:
    output_path = output
    if output_path and str(output_path) == "-":
        output_path = None
    last_updated = time.strftime("%Y-%m-%d")

    if fmt == "json":
        payload = [row.to_extension_entry(last_updated=last_updated) for row in rows]
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(text, encoding="utf-8")
            LOGGER.info("Wrote %s conference rows to %s", len(payload), output_path)
        if stdout or not output_path:
            sys.stdout.write(text + "\n")
    else:  # csv
        fieldnames = ["name", "abbrv", "rank", "source"]
        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("w", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=fieldnames)
                writer.writeheader()
                for row in rows:
                    writer.writerow(row.to_csv_row())
            LOGGER.info("Wrote %s conference rows to %s", len(rows), output_path)
        if stdout or not output_path:
            writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row.to_csv_row())


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape conferenceranks.com conference table and refresh the extension dataset"
    )
    parser.add_argument(
        "--base-url",
        default=BASE_URL,
        help="Landing page URL hosting the embedded datasets",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Seconds to sleep between dataset downloads (courtesy throttle)",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        help="Stop after collecting approximately this many rows",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_EXTENSION_DATASET,
        help=(
            "Output path for the structured dataset (default: extension/scholar-rank/data/conferences.json)"
        ),
    )
    parser.add_argument(
        "--format",
        choices=["json", "csv"],
        default="json",
        help="Serialization format (json integrates with the Chrome extension)",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Also print the dataset to stdout",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    try:
        rows = scrape_conferences(
            base_url=args.base_url,
            delay=args.delay,
            max_rows=args.max_rows,
        )
    except requests.HTTPError as exc:  # pragma: no cover - network failure
        LOGGER.error("HTTP error while scraping: %s", exc)
        return 1
    except Exception as exc:  # pragma: no cover - generic failure
        LOGGER.error("Unexpected error: %s", exc)
        return 1

    if not rows:
        LOGGER.warning("No conference rows extracted")
    write_output(rows, args.output, args.format, args.stdout)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
