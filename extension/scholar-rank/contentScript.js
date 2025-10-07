(async () => {
  const host = window.location.hostname;
  const currentPath = window.location.pathname || '';
  const isScholarHost = host.includes('scholar.google');
  const isScholarPath = host.endsWith('google.com') && currentPath.startsWith('/scholar');

  if (!isScholarHost && !isScholarPath) {
    return;
  }

  // Check if extension is enabled
  const STORAGE_KEY = 'scholarRankEnabled';
  const { scholarRankEnabled } = await chrome.storage.sync.get([STORAGE_KEY]);
  const isExtensionEnabled = scholarRankEnabled !== false;

  const collapseAllBadges = () => {
    document
      .querySelectorAll('.scholar-rank-badge.is-expanded')
      .forEach((badge) => {
        badge.classList.remove('is-expanded');
        const detail = badge.querySelector('.scholar-rank-badge__details');
        if (detail) detail.hidden = true;
      });
  };

  if (!window.__SCHOLAR_RANK_CLOSE_LISTENER__) {
    window.__SCHOLAR_RANK_CLOSE_LISTENER__ = true;
    document.addEventListener('click', collapseAllBadges);
  }

  async function loadDataset() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SCHOLAR_RANK_FETCH_DATASET' });
      if (response && response.ok && Array.isArray(response.data)) {
        console.info('[ScholarRank] dataset fetched from ConferenceRanks', response.data.length);
        return response.data;
      }
      if (response && !response.ok) {
        console.warn('[ScholarRank] remote dataset fetch failed:', response.error);
      }
    } catch (error) {
      console.warn('[ScholarRank] remote dataset unavailable', error);
    }

    const fallbackUrl = chrome.runtime.getURL('data/conferences.json');
    const manualUrl = chrome.runtime.getURL('data/manual_conferences.json');
    try {
      const [baseResponse, manualResponse] = await Promise.all([
        fetch(fallbackUrl, { cache: 'no-cache' }),
        fetch(manualUrl, { cache: 'no-cache' })
      ]);

      if (!baseResponse.ok) {
        throw new Error(`HTTP ${baseResponse.status}`);
      }

      const [basePayload, manualPayload] = await Promise.all([
        baseResponse.json(),
        manualResponse.ok ? manualResponse.json() : Promise.resolve([])
      ]);

      if (!Array.isArray(basePayload)) {
        throw new Error('Fallback dataset is not an array');
      }

      const combined = basePayload.concat(Array.isArray(manualPayload) ? manualPayload : []);
      console.info('[ScholarRank] using bundled fallback dataset', combined.length);
      return combined;
    } catch (error) {
      console.error('[ScholarRank] failed to load fallback dataset', error);
      return [];
    }
  }

  const data = await loadDataset();
  console.info('[ScholarRank] dataset entries', data.length);

  const normalize = (value) => {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const STOP_WORDS = new Set(['and', 'the', 'of', 'on', 'in', 'for', 'with', 'at', 'by', 'from', 'to', 'an', 'as', 'or']);

  const tokenize = (text) => {
    const seen = new Set();
    const tokens = [];
    text
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .forEach((token) => {
        if (!token) return;
        const lowerToken = token.toLowerCase();

        // Allow uppercase acronyms (e.g., AAAI, ACM, NLP) regardless of length
        const isAcronym = /^[A-Z]{2,}$/.test(token);

        // Filter out tokens that are too short (unless they're acronyms)
        if (!isAcronym && lowerToken.length < 3) return;

        // Filter out pure numbers
        if (/^[0-9]+$/.test(lowerToken)) return;

        // Filter out stop words
        if (STOP_WORDS.has(lowerToken)) return;

        if (!seen.has(lowerToken)) {
          seen.add(lowerToken);
          tokens.push(lowerToken);
        }
      });
    return tokens;
  };

  const stripCitationTitle = (text) => {
    if (!text || typeof text !== 'string') {
      return text;
    }
    const normalizedQuotes = text.replace(/[""]/g, '"');
    const firstQuote = normalizedQuotes.indexOf('"');
    if (firstQuote === -1) {
      return text;
    }
    const secondQuote = normalizedQuotes.indexOf('"', firstQuote + 1);
    if (secondQuote === -1) {
      const tail = normalizedQuotes.slice(firstQuote + 1).trim();
      const cleanedTail = tail.replace(/^[\s.,:;\-–—]+/, '').trim();
      return cleanedTail || tail || text.trim();
    }
    const tail = normalizedQuotes.slice(secondQuote + 1).trim();
    const cleaned = tail.replace(/^[\s.,:;\-–—]+/, '').trim();

    // Handle arXiv preprints: if the venue contains "arXiv preprint", extract only the arXiv identifier
    if (cleaned && /arxiv\s+preprint/i.test(cleaned)) {
      const arxivMatch = cleaned.match(/arxiv[:\s]*(\d+\.\d+)/i);
      if (arxivMatch) {
        return `arXiv ${arxivMatch[1]}`;
      }
      return 'arXiv';
    }

    // If the cleaned result is suspiciously long (likely includes the title), return empty
    // This prevents the entire citation from being treated as a venue
    if (cleaned.length > 150) {
      return '';
    }

    return cleaned || tail || text.trim();
  };

  const normalizedEntries = data
    .map((entry) => {
      const type = (entry.type || 'conference').toLowerCase();
      const officialName = entry.officialName || entry.name || '';
      const displayName = entry.displayName || entry.abbrv || officialName || entry.abbr || entry.alias || '';
      const abbrv = entry.abbrv || entry.abbr || '';
      const aliases = []
        .concat(entry.aliases || [])
        .concat([entry.displayName, officialName, entry.name, abbrv])
        .filter(Boolean);
      const uniqueAliases = [];
      aliases.forEach((alias) => {
        const trimmed = String(alias).trim();
        if (trimmed && !uniqueAliases.includes(trimmed)) {
          uniqueAliases.push(trimmed);
        }
      });
      if (!displayName && !officialName && uniqueAliases.length) {
        const firstAlias = uniqueAliases[0];
        return {
          ...entry,
          type,
          officialName: firstAlias,
          displayName: firstAlias,
          aliases: uniqueAliases
        };
      }
      return {
        ...entry,
        type,
        officialName,
        displayName: displayName || officialName || abbrv || 'Unnamed venue',
        aliases: uniqueAliases
      };
    })
    .filter((entry) => entry.displayName);

  const aliasIndex = new Map();
  const processedEntries = normalizedEntries.map((entry) => {
    const names = [entry.displayName, entry.officialName]
      .concat(entry.aliases || [])
      .filter(Boolean);
    const aliases = [];
    const seenNormalized = new Set();
    names.forEach((name) => {
      const normalizedAlias = normalize(name);
      if (!normalizedAlias || seenNormalized.has(normalizedAlias)) return;
      seenNormalized.add(normalizedAlias);
      const tokens = tokenize(name);
      aliases.push({ raw: name, normalized: normalizedAlias, tokens });
      // Build exact match index using normalized text, independent of tokenization
      // This ensures short acronyms like "aaai" can still be exactly matched
      if (!aliasIndex.has(normalizedAlias)) {
        aliasIndex.set(normalizedAlias, entry);
      }
    });
    return { entry, aliases };
  });

  console.info('[ScholarRank] processed entries', processedEntries.length);

  const computeScore = (aliasTokens, targetTokens) => {
    if (!aliasTokens.length || !targetTokens.length) {
      return { score: 0, overlap: [], sequenceScore: 0, coverageAlias: 0, coverageTarget: 0 };
    }
    // Reject single-token aliases UNLESS the token is an acronym (2+ chars, all letters)
    // This prevents stop words like "and" from matching, while allowing "acm", "nlp", etc.
    if (aliasTokens.length < 2) {
      const singleToken = aliasTokens[0];
      const isAcronymToken = singleToken && /^[a-z]{2,}$/.test(singleToken);
      if (!isAcronymToken) {
        return { score: 0, overlap: [], sequenceScore: 0, coverageAlias: 0, coverageTarget: 0 };
      }
    }
    const aliasSet = new Set(aliasTokens);
    const targetSet = new Set(targetTokens);
    const overlap = aliasTokens.filter((token) => targetSet.has(token));
    if (!overlap.length) {
      return { score: 0, overlap, sequenceScore: 0, coverageAlias: 0, coverageTarget: 0 };
    }

    const coverageAlias = overlap.length / aliasTokens.length;
    const coverageTarget = overlap.length / targetTokens.length;

    let longestSpan = 0;
    for (let i = 0; i < aliasTokens.length; i += 1) {
      for (let j = 0; j < targetTokens.length; j += 1) {
        let span = 0;
        while (
          aliasTokens[i + span] &&
          targetTokens[j + span] &&
          aliasTokens[i + span] === targetTokens[j + span]
        ) {
          span += 1;
        }
        if (span > longestSpan) {
          longestSpan = span;
        }
      }
    }
    const sequenceScore = longestSpan / Math.min(aliasTokens.length, targetTokens.length);

    const baseScore = (coverageAlias * 0.6) + (coverageTarget * 0.2) + (sequenceScore * 0.3);
    const score = Math.min(baseScore, 1);

    return { score, overlap, sequenceScore, coverageAlias, coverageTarget };
  };

  const MIN_SCORE = 0.55;

  const matchCitation = (text, options = {}) => {
    const excludeTokens = Array.isArray(options.excludeTokens) ? options.excludeTokens : [];
    const sourceText = options.sourceText || text;
    const targetText = options.processedText || text;
    const citationVenue = Object.prototype.hasOwnProperty.call(options, 'citationVenue')
      ? options.citationVenue
      : targetText;
    if (!targetText) return [];
    const normalizedCitation = normalize(targetText);
    if (!normalizedCitation) return [];

    const matches = [];

    const exactEntry = aliasIndex.get(normalizedCitation);
    if (exactEntry) {
      const matchedAlias = processedEntries
        .find((processed) => processed.entry === exactEntry)
        ?.aliases.find((alias) => alias.normalized === normalizedCitation);
      matches.push({
        entry: exactEntry,
        matched: matchedAlias ? matchedAlias.raw : exactEntry.displayName,
        score: 1,
        method: 'citation-exact',
        sourceText,
        matchedSummary: matchedAlias ? matchedAlias.raw : exactEntry.displayName,
        citationVenue
      });
    }

    const targetTokens = tokenize(targetText);
    if (!targetTokens.length) {
      return matches;
    }

    let filteredTokens = targetTokens;
    if (excludeTokens.length) {
      const excludeSet = new Set(excludeTokens);
      filteredTokens = targetTokens.filter((token) => !excludeSet.has(token));
      if (!filteredTokens.length) {
        filteredTokens = targetTokens;
      }
    }

    processedEntries.forEach(({ entry, aliases }) => {
      aliases.forEach((alias) => {
        const { score, overlap, sequenceScore, coverageAlias, coverageTarget } = computeScore(alias.tokens, filteredTokens);
        if (!overlap.length) return;
        if (coverageAlias < 0.5) return;
        if (score < MIN_SCORE) return;
        matches.push({
          entry,
          matched: alias.raw,
          score,
          method: 'citation-fuzzy',
          sourceText,
          matchedSummary: alias.raw,
          citationVenue,
          details: { coverageAlias, coverageTarget, sequenceScore }
        });
      });
    });

    matches.sort((a, b) => (b.score || 0) - (a.score || 0));
    return matches;
  };

  const extractCitationTexts = async (resultRoot) => {
    const citeButton = resultRoot.querySelector('.gs_or_cit');
    const panel = document.getElementById('gs_cit');
    if (!citeButton || !panel) {
      console.warn('[ScholarRank] citation button or panel not found');
      return [];
    }

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = (citations = []) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timeoutId);
        const closeButton = panel.querySelector('.gs_cit-x');
        if (closeButton && panel.classList.contains('gs_vis')) {
          closeButton.click();
        }
        resolve(citations.filter((text) => text && text.trim()).map((text) => text.trim()));
      };

      const observer = new MutationObserver(() => {
        if (!panel.classList.contains('gs_vis')) return;
        const entries = Array.from(panel.querySelectorAll('.gs_citr')).map((node) => node.textContent || '');
        if (entries.length) {
          cleanup(entries);
        }
      });

      observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

      // Increased timeout and added warning when it expires
      const timeoutId = setTimeout(() => {
        console.warn('[ScholarRank] citation extraction timed out - may be rate limited');
        cleanup([]);
      }, 6000);

      try {
        citeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      } catch (error) {
        console.warn('[ScholarRank] citation trigger failed', error);
        cleanup([]);
      }
    });
  };

  const extractVenue = async (resultRoot) => {
    const titleAnchor = resultRoot.querySelector('.gs_rt a');
    const titleContainer = titleAnchor || resultRoot.querySelector('.gs_rt');
    const titleText = titleContainer?.textContent ? titleContainer.textContent.trim() : '';
    const titleTokens = titleText ? tokenize(titleText) : [];

    const citations = await extractCitationTexts(resultRoot);
    const matchMap = new Map();

    citations.forEach((citation, index) => {
      const processedCitation = stripCitationTitle(citation);
      matchCitation(processedCitation, {
        excludeTokens: titleTokens,
        sourceText: citation,
        processedText: processedCitation,
        citationVenue: processedCitation
      }).forEach((match) => {
        const key = match.entry.name || match.entry.displayName;
        if (!matchMap.has(key) || matchMap.get(key).score < match.score) {
          match.method = index === 0 ? match.method : `${match.method || 'citation'}-alt`;
          matchMap.set(key, match);
        }
      });
    });

    // Fallback 1: Try extracting from metadata line (.gs_a) if citations failed
    if (!matchMap.size) {
      const metaNode = resultRoot.querySelector('.gs_a');
      if (metaNode && metaNode.textContent) {
        const metaText = metaNode.textContent.trim();
        matchCitation(metaText, {
          excludeTokens: titleTokens,
          sourceText: metaText,
          processedText: metaText,
          citationVenue: metaText
        }).forEach((match) => {
          const key = match.entry.name || match.entry.displayName;
          if (!matchMap.has(key) || matchMap.get(key).score < match.score) {
            match.method = 'metadata-fallback';
            matchMap.set(key, match);
          }
        });
      }
    }

    // Fallback 2: Try title as last resort
    if (!matchMap.size) {
      if (titleAnchor && titleAnchor.textContent) {
        matchCitation(titleAnchor.textContent).forEach((match) => {
          const key = match.entry.name || match.entry.displayName;
          if (!matchMap.has(key) || matchMap.get(key).score < match.score) {
            match.method = 'title-fallback';
            matchMap.set(key, match);
          }
        });
      } else if (titleText) {
        matchCitation(titleText).forEach((match) => {
          const key = match.entry.name || match.entry.displayName;
          if (!matchMap.has(key) || matchMap.get(key).score < match.score) {
            match.method = 'title-fallback';
            matchMap.set(key, match);
          }
        });
      }
    }

    if (!matchMap.size) {
      return null;
    }

    const matches = Array.from(matchMap.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((match, index, arr) => ({
        ...match,
        isPrimary: index === 0,
        alternatives: arr.filter((candidate, candidateIndex) => candidateIndex !== index)
      }));

    return matches;
  };

  const createDetailList = (container, context) => {
    const detailNode = document.createElement('div');
    detailNode.className = 'scholar-rank-badge__details';
    detailNode.hidden = true;

    const detailList = document.createElement('dl');
    detailList.className = 'scholar-rank-badge__details-list';

    const appendDetail = (label, value) => {
      if (!value) return;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      detailList.appendChild(dt);
      detailList.appendChild(dd);
    };

    appendDetail('Official name', context.entry.officialName || context.entry.name || context.entry.displayName);
    appendDetail('Rank', context.entry.rank || context.entry.rating || 'n/a');
    appendDetail('Source', context.entry.source || 'ConferenceRanks.com');
    appendDetail('Last updated', context.entry.lastUpdated || context.entry.last_updated || '—');
    if (Array.isArray(context.entry.aliases) && context.entry.aliases.length) {
      appendDetail('Aliases', context.entry.aliases.slice(0, 6).join(', '));
    }
    appendDetail('Conference', context.citationVenue || '—');
    appendDetail('Matched text', context.matchedSummary || context.matched || context.sourceText || '—');
    appendDetail('Detection', context.method || 'citation');
    if (typeof context.score === 'number') {
      appendDetail('Confidence', `${Math.round(Math.min(context.score, 1) * 100)}%`);
    }

    if (Array.isArray(context.alternatives) && context.alternatives.length) {
      const listTitle = document.createElement('dt');
      listTitle.textContent = 'Other matches';
      detailList.appendChild(listTitle);

      const listContainer = document.createElement('dd');
      const list = document.createElement('ul');
      list.className = 'scholar-rank-badge__alt-list';

      context.alternatives.forEach((alt) => {
        const item = document.createElement('li');
        const confidence = typeof alt.score === 'number' ? `${Math.round(Math.min(alt.score, 1) * 100)}%` : '—';
        const altName = alt.entry.displayName || alt.entry.officialName || alt.entry.name || 'Unknown';
        const altRank = alt.entry.rank || alt.entry.rating || 'n/a';
        item.textContent = `${altName} [${altRank}] (${confidence})`;
        list.appendChild(item);
      });

      listContainer.appendChild(list);
      detailList.appendChild(listContainer);
    }

    detailNode.appendChild(detailList);
    container.appendChild(detailNode);
    return detailNode;
  };

  const renderMatchBadge = (metaNode, match, allMatches) => {
    const container = document.createElement('span');
    container.className = 'scholar-rank-badge';
    if (!match.isPrimary) {
      container.classList.add('is-secondary');
    }

    container.title = `${match.entry.officialName || match.entry.displayName}\nRank: ${match.entry.rank || match.entry.rating || 'n/a'}\nSource: ${match.entry.source || 'ConferenceRanks.com'}`;

    const rankNode = document.createElement('span');
    rankNode.className = 'scholar-rank-badge__rank';
    rankNode.textContent = match.entry.rank || match.entry.rating || 'n/a';
    container.appendChild(rankNode);

    const labelNode = document.createElement('span');
    labelNode.className = 'scholar-rank-badge__label';
    const typeLabel = (match.entry.type || 'conference').toLowerCase() === 'conference' ? 'Conf' : 'Venue';
    const confidence = typeof match.score === 'number' ? `${Math.round(Math.min(match.score, 1) * 100)}%` : '—';
    const matchName = match.entry.displayName || match.entry.officialName || match.entry.name || 'Unknown';
    labelNode.textContent = `${matchName} • ${typeLabel} (${confidence})`;
    container.appendChild(labelNode);

    const sourceUrl = match.entry.sourceUrl || match.entry.source_url;
    if (sourceUrl) {
      const link = document.createElement('a');
      link.className = 'scholar-rank-badge__source';
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'source';
      container.appendChild(link);
    }

    const context = {
      ...match,
      alternatives: allMatches.filter((candidate) => candidate !== match)
    };
    const detailNode = createDetailList(container, context);

    container.addEventListener('click', (event) => {
      if (event.target.closest('.scholar-rank-badge__source')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const expanded = container.classList.toggle('is-expanded');
      detailNode.hidden = !expanded;
      if (expanded) {
        document
          .querySelectorAll('.scholar-rank-badge.is-expanded')
          .forEach((badge) => {
            if (badge !== container) {
              badge.classList.remove('is-expanded');
              const otherDetail = badge.querySelector('.scholar-rank-badge__details');
              if (otherDetail) otherDetail.hidden = true;
            }
          });
      }
    });

    metaNode.appendChild(container);
    console.info(
      '[ScholarRank] injected badge',
      match.entry.displayName,
      match.entry.rank,
      'matched',
      match.matched
    );
  };

  const renderOverflowBadge = (metaNode, overflowMatches) => {
    if (!overflowMatches.length) return;

    const container = document.createElement('span');
    container.className = 'scholar-rank-badge scholar-rank-badge--overflow';
    container.title = 'Show additional venue matches';

    const ellipsisNode = document.createElement('span');
    ellipsisNode.className = 'scholar-rank-badge__label';
    ellipsisNode.textContent = `… +${overflowMatches.length}`;
    container.appendChild(ellipsisNode);

    const detailNode = document.createElement('div');
    detailNode.className = 'scholar-rank-badge__details';
    detailNode.hidden = true;

    const list = document.createElement('ul');
    list.className = 'scholar-rank-badge__alt-list';
    overflowMatches.forEach((match) => {
      const item = document.createElement('li');
      const matchName = match.entry.displayName || match.entry.officialName || match.entry.name || 'Unknown';
      const rankLabel = match.entry.rank || match.entry.rating || 'n/a';
      const confidence = typeof match.score === 'number' ? `${Math.round(Math.min(match.score, 1) * 100)}%` : '—';
      const venueText = match.citationVenue || '—';
      item.textContent = `${matchName} [${rankLabel}] (${confidence}) — ${venueText}`;
      list.appendChild(item);
    });

    detailNode.appendChild(list);
    container.appendChild(detailNode);

    container.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = container.classList.toggle('is-expanded');
      detailNode.hidden = !expanded;
      if (expanded) {
        document
          .querySelectorAll('.scholar-rank-badge.is-expanded')
          .forEach((badge) => {
            if (badge !== container) {
              badge.classList.remove('is-expanded');
              const otherDetail = badge.querySelector('.scholar-rank-badge__details');
              if (otherDetail) otherDetail.hidden = true;
            }
          });
      }
    });

    metaNode.appendChild(container);
  };

  const renderBadges = (resultRoot, matches) => {
    const metaNode = resultRoot.querySelector('.gs_a');
    if (!metaNode) return;

    const displayMatches = matches.slice(0, 3);
    const overflowMatches = matches.slice(3);

    displayMatches.forEach((match) => {
      renderMatchBadge(metaNode, match, matches);
    });

    renderOverflowBadge(metaNode, overflowMatches);
  };

  let processingQueue = Promise.resolve();
  const THROTTLE_DELAY_MS = 800; // Delay between processing each result to avoid rate limiting

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const processResult = async (resultRoot) => {
    if (resultRoot.dataset.scholarRankProcessed === 'true') return;
    try {
      const matches = await extractVenue(resultRoot);
      if (Array.isArray(matches) && matches.length) {
        renderBadges(resultRoot, matches);
      }
    } catch (error) {
      console.error('[ScholarRank] processing failed', error);
    } finally {
      resultRoot.dataset.scholarRankProcessed = 'true';
    }
  };

  const scheduleProcessing = (node) => {
    if (node.dataset.scholarRankScheduled === 'true' || node.dataset.scholarRankProcessed === 'true') {
      return;
    }
    node.dataset.scholarRankScheduled = 'true';
    processingQueue = processingQueue
      .then(() => processResult(node))
      .then(() => sleep(THROTTLE_DELAY_MS)) // Add delay between requests
      .catch((error) => {
        console.error('[ScholarRank] queue error', error);
      })
      .finally(() => {
        node.dataset.scholarRankScheduled = 'false';
      });
  };

  const scanResults = () => {
    const results = document.querySelectorAll('.gs_ri');
    console.info('[ScholarRank] scanning results', results.length);
    results.forEach((node) => scheduleProcessing(node));
  };

  // Only auto-scan if extension is enabled
  if (isExtensionEnabled) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanResults, { once: true });
    } else {
      scanResults();
    }

    const observer = new MutationObserver(() => {
      scanResults();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    console.info('[ScholarRank] extension is disabled - auto-scan disabled');
  }

  // Listen for manual query message from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCHOLAR_RANK_MANUAL_QUERY') {
      console.info('[ScholarRank] manual query triggered');
      // Reset all results to allow reprocessing
      document.querySelectorAll('.gs_ri').forEach((node) => {
        node.dataset.scholarRankProcessed = 'false';
        node.dataset.scholarRankScheduled = 'false';
        // Remove existing badges
        node.querySelectorAll('.scholar-rank-badge').forEach((badge) => badge.remove());
      });
      // Trigger scan
      scanResults();
      sendResponse({ success: true });
    }
  });
})();
