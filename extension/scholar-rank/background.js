const ERA_URL = 'https://www.conferenceranks.com/data/era2010.min.js';
const QUALIS_URL = 'https://www.conferenceranks.com/data/qualis2012.min.js';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MANUAL_DATASETS_URL = chrome.runtime.getURL('data/manual_conferences.json');

let cachedDataset = null;
let cacheTimestamp = 0;

const parseDatasetScript = (scriptText) => {
  const start = scriptText.indexOf('[');
  const end = scriptText.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Unable to locate dataset array in script');
  }
  const jsonPayload = scriptText.slice(start, end + 1);
  return JSON.parse(jsonPayload);
};

const buildEntryKey = (entry) => {
  return (entry.name || entry.officialName || entry.displayName || entry.abbrv || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const normaliseEntry = (entry, sourceName) => {
  const name = (entry.name || '').trim();
  const abbrv = (entry.abbrv || entry.abbrev || '').trim();
  const aliases = [];
  if (Array.isArray(entry.aliases)) {
    aliases.push(...entry.aliases);
  }
  [name, abbrv, entry['alternate-name']].forEach((label) => {
    if (label && !aliases.includes(label)) {
      aliases.push(label);
    }
  });

  return {
    type: 'conference',
    name,
    abbrv,
    aliases,
    rank: String(entry.rank || entry.class || '').trim(),
    source: sourceName,
    source_url: 'https://www.conferenceranks.com/',
    last_updated: new Date().toISOString().slice(0, 10)
  };
};

const fetchDataset = async () => {
  const now = Date.now();
  if (cachedDataset && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedDataset;
  }

  const responses = await Promise.all([
    fetch(ERA_URL),
    fetch(QUALIS_URL)
  ]);

  responses.forEach((response, idx) => {
    if (!response.ok) {
      throw new Error(`Fetch failed for dataset ${idx}: HTTP ${response.status}`);
    }
  });

  const [eraText, qualisText, manualText] = await Promise.all([
    responses[0].text(),
    responses[1].text(),
    fetch(MANUAL_DATASETS_URL).then((res) => res.text())
  ]);

  const eraData = parseDatasetScript(eraText).map((row) => normaliseEntry(row, 'ERA 2010'));
  const qualisData = parseDatasetScript(qualisText).map((row) => normaliseEntry(row, 'Qualis 2012'));
  let manualData = [];
  try {
    manualData = JSON.parse(manualText);
  } catch (error) {
    console.warn('[ScholarRank] failed to parse manual dataset', error);
  }

  const combined = eraData.concat(qualisData, manualData);
  const seen = new Set();
  const unique = [];
  combined.forEach((entry) => {
    const key = buildEntryKey(entry);
    if (!key) {
      unique.push(entry);
      return;
    }
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  });

  cachedDataset = unique;
  cacheTimestamp = now;
  return unique;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'SCHOLAR_RANK_FETCH_DATASET') {
    return false;
  }

  fetchDataset()
    .then((dataset) => sendResponse({ ok: true, data: dataset }))
    .catch((error) => {
      console.error('[ScholarRank] dataset fetch failed', error);
      sendResponse({ ok: false, error: error.message });
    });

  return true; // keep the message channel open for async response
});
