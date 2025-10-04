(() => {
  const host = window.location.hostname;
  const path = window.location.pathname || "";
  const isScholarHost = host.includes("scholar.google");
  const isScholarPath = host.endsWith("google.com") && path.startsWith("/scholar");

  if (!isScholarHost && !isScholarPath) {
    return;
  }

  const data = Array.isArray(window.SCHOLAR_RANK_DATA) ? window.SCHOLAR_RANK_DATA : [];
  console.info("[ScholarRank] dataset entries", data.length);

  const normalize = (value) => {
    return (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const aliasList = [];
  const index = new Map();
  data.forEach((entry) => {
    const labels = [entry.displayName, entry.officialName]
      .concat(entry.aliases || [])
      .filter(Boolean);
    const normalizedLabels = labels.map((label) => normalize(label)).filter(Boolean);
    normalizedLabels.forEach((key) => {
      if (!index.has(key)) {
        index.set(key, entry);
      }
      aliasList.push({ key, entry });
    });
  });
  console.info("[ScholarRank] indexed labels", index.size);

  const fuzzyMatch = (normalizedValue) => {
    if (!normalizedValue) return null;
    for (const { key, entry } of aliasList) {
      if (key.length < 3) continue;
      if (
        normalizedValue === key ||
        normalizedValue.includes(key) ||
        key.includes(normalizedValue)
      ) {
        console.debug("[ScholarRank] fuzzy match", normalizedValue, "->", key);
        return entry;
      }
    }
    return null;
  };

  const candidateFromSegment = (segment) => {
    if (!segment) return null;
    const clean = segment
      .replace(/\b(arxiv preprint)\b.*$/i, "arxiv")
      .replace(/\b(vol|volume|no|pp)\.?\s.*$/i, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\d{4}.*/g, "")
      .split(/[,;•\|]/)[0]
      .trim();
    return clean || null;
  };

  const lookup = (rawVenueText) => {
    if (!rawVenueText) return null;
    const normalizedValue = normalize(rawVenueText);
    if (!normalizedValue) return null;
    const direct = index.get(normalizedValue);
    if (direct) {
      return direct;
    }
    const fuzzy = fuzzyMatch(normalizedValue);
    if (!fuzzy) {
      console.debug("[ScholarRank] no match", rawVenueText, normalizedValue);
    }
    return fuzzy;
  };

  const extractVenue = (resultRoot) => {
    const metaNode = resultRoot.querySelector(".gs_a");
    if (!metaNode) return null;
    const text = metaNode.textContent || "";
    const segments = text
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);

    if (segments.length < 2) {
      return null;
    }

    const venueSegments = segments.slice(1, Math.min(segments.length, 3));
    for (const segment of venueSegments) {
      const candidate = candidateFromSegment(segment);
      if (!candidate) continue;
      const entry = lookup(candidate);
      if (entry) {
        return { entry, matched: candidate };
      }
    }

    const fallback = candidateFromSegment(segments[1]);
    if (!fallback) {
      return null;
    }

    const entry = lookup(fallback);
    return entry ? { entry, matched: fallback } : null;
  };

  const createTooltip = (entry) => {
    const infoBits = [];
    if (entry.rank) infoBits.push(`Rank: ${entry.rank}`);
    if (entry.rating) infoBits.push(entry.rating);
    if (entry.area) infoBits.push(entry.area);
    const lines = [entry.officialName || entry.displayName];
    if (infoBits.length) {
      lines.push(infoBits.join(" • "));
    }
    if (entry.source) {
      lines.push(`Source: ${entry.source}`);
    }
    if (entry.accessNote) {
      lines.push(entry.accessNote);
    }
    if (entry.lastUpdated) {
      lines.push(`Last updated: ${entry.lastUpdated}`);
    }
    return lines.join("\n");
  };

  const renderBadge = (resultRoot, context) => {
    const metaNode = resultRoot.querySelector(".gs_a");
    if (!metaNode) return;

    const container = document.createElement("span");
    container.className = "scholar-rank-badge";
    container.title = createTooltip(context.entry);

    const rankNode = document.createElement("span");
    rankNode.className = "scholar-rank-badge__rank";
    rankNode.textContent = context.entry.rank || "n/a";

    const labelNode = document.createElement("span");
    labelNode.className = "scholar-rank-badge__label";
    const typeLabel = context.entry.type === "conference" ? "Conf" : "Journal";
    labelNode.textContent = `${context.entry.displayName} • ${typeLabel}`;

    if (context.entry.sourceUrl) {
      const link = document.createElement("a");
      link.className = "scholar-rank-badge__source";
      link.href = context.entry.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "source";
      container.appendChild(rankNode);
      container.appendChild(labelNode);
      container.appendChild(link);
    } else {
      container.appendChild(rankNode);
      container.appendChild(labelNode);
    }

    metaNode.appendChild(container);
    console.info(
      "[ScholarRank] injected badge",
      context.entry.displayName,
      context.entry.rank,
      "matched",
      context.matched
    );
  };

  const processResult = (resultRoot) => {
    if (resultRoot.dataset.scholarRankProcessed === "true") return;
    const match = extractVenue(resultRoot);
    if (match) {
      renderBadge(resultRoot, match);
    }
    resultRoot.dataset.scholarRankProcessed = "true";
  };

  const scanResults = () => {
    const results = document.querySelectorAll(".gs_ri");
    console.info("[ScholarRank] scanning results", results.length);
    results.forEach((node) => processResult(node));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanResults, { once: true });
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
})();
