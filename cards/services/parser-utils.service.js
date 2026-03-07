function parseBulkInput(raw) {
  const tokens = raw
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result = [];
  for (const token of tokens) {
    const nmId = extractNmId(token);
    if (nmId) {
      result.push(nmId);
    }
  }

  return result;
}

function extractNmId(raw) {
  if (!raw) {
    return null;
  }

  const text = String(raw).trim();
  if (!text) {
    return null;
  }

  const fromUrl = text.match(/wildberries\.ru\/catalog\/(\d{6,})/i);
  if (fromUrl) {
    return fromUrl[1];
  }

  const direct = text.match(/\b(\d{6,})\b/);
  if (direct) {
    return direct[1];
  }

  return null;
}

function normalizeRecommendationRefs(values, sourceNmId = null) {
  if (!Array.isArray(values)) {
    return [];
  }

  const excluded = sourceNmId ? String(sourceNmId) : "";
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) {
      continue;
    }

    let nmId = null;
    const fromUrl = text.match(/wildberries\.ru\/catalog\/(\d{6,})/i);
    if (fromUrl?.[1]) {
      nmId = fromUrl[1];
    } else if (/^\d{6,}$/.test(text)) {
      nmId = text;
    }

    if (!nmId) {
      continue;
    }
    if (excluded && String(nmId) === excluded) {
      continue;
    }
    if (seen.has(nmId)) {
      continue;
    }

    seen.add(nmId);
    output.push(String(nmId));
  }

  return output;
}

function getRecommendationSourceRefs(data, rowNmId) {
  const richRefs = normalizeRecommendationRefs(
    Array.isArray(data?.recommendationRefsFromRich) && data.recommendationRefsFromRich.length > 0
      ? data.recommendationRefsFromRich
      : Array.isArray(data?.recommendationRefs)
        ? data.recommendationRefs
        : [],
    rowNmId,
  );

  const apiRefs = normalizeRecommendationRefs(data?.recommendationRefsFromApi, rowNmId);

  const legacyRefs =
    richRefs.length === 0 && apiRefs.length === 0
      ? normalizeRecommendationRefs(data?.recommendationResolvedRefs, rowNmId)
      : [];

  const mergedRefs = normalizeRecommendationRefs([...apiRefs, ...richRefs, ...legacyRefs], rowNmId);

  return {
    richRefs,
    apiRefs,
    legacyRefs,
    mergedRefs,
  };
}

function extractRecommendationRefsFromRich(rich, sourceNmId) {
  if (!rich || typeof rich !== "object") {
    return [];
  }

  const sourceNmIdText = String(sourceNmId || "").trim();
  const ids = new Set();
  const stack = [rich];

  function addCandidate(valueRaw) {
    const value = String(valueRaw || "").trim();
    if (!/^\d{6,}$/.test(value)) {
      return;
    }
    if (sourceNmIdText && value === sourceNmIdText) {
      return;
    }
    ids.add(value);
  }

  function addFromText(textRaw, allowDirectNumeric = false) {
    const text = String(textRaw || "");
    if (!text) {
      return;
    }

    const urlPatterns = [
      /wildberries\.ru\/catalog\/(\d{6,})/gi,
      /\/catalog\/(\d{6,})\/detail\.aspx/gi,
      /(?:\?|&)nm=(\d{6,})/gi,
    ];

    for (const pattern of urlPatterns) {
      for (const match of text.matchAll(pattern)) {
        if (match?.[1]) {
          addCandidate(match[1]);
        }
      }
    }

    if (allowDirectNumeric) {
      for (const match of text.matchAll(/\b(\d{6,})\b/g)) {
        if (match?.[1]) {
          addCandidate(match[1]);
        }
      }
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    if (typeof current === "number" && Number.isInteger(current) && current >= 100000) {
      addCandidate(String(current));
      continue;
    }

    if (typeof current === "string") {
      const trimmed = current.trim();
      if (/^\d{6,}$/.test(trimmed)) {
        addCandidate(trimmed);
      }
      addFromText(current, false);
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = String(key || "").toLowerCase();
      const keySuggestsNmId = /(^nm$|nmid|nm_id|productid|product_id|itemid|item_id|wbid|wb_id)/i.test(normalizedKey);
      const keySuggestsLink = /(link|url|href|target)/i.test(normalizedKey);

      if (typeof value === "number" && Number.isInteger(value) && value >= 100000 && keySuggestsNmId) {
        addCandidate(String(value));
      }

      if (typeof value === "string") {
        addFromText(value, keySuggestsNmId || keySuggestsLink);
      }

      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return Array.from(ids);
}

function extractRichDetailsFromPayload(rich) {
  if (!rich || typeof rich !== "object") {
    return null;
  }

  const details = {
    blockCount: Array.isArray(rich?.content) ? rich.content.length : 0,
    media: [],
    links: [],
    snippets: [],
  };

  const mediaSet = new Set();
  const linksSet = new Set();
  const snippetsSet = new Set();

  const mediaList = [];
  const linksList = [];
  const snippetsList = [];

  const IMAGE_LIKE_RE = /\.(webp|jpg|jpeg|png|gif|avif)(\?.*)?$/i;
  const IMAGE_PATH_RE = /\/(images|media|imagedata)\//i;

  function normalizeUrlCandidate(urlRaw) {
    const text = String(urlRaw || "").trim();
    if (!text) {
      return "";
    }
    return text.replace(/[),.;]+$/g, "");
  }

  function isImageLikeUrl(urlRaw) {
    const text = normalizeUrlCandidate(urlRaw);
    if (!text || !/^https?:\/\//i.test(text)) {
      return false;
    }
    return IMAGE_LIKE_RE.test(text) || IMAGE_PATH_RE.test(text);
  }

  function addMedia(urlRaw) {
    const url = normalizeUrlCandidate(urlRaw);
    if (!url || mediaSet.has(url) || mediaList.length >= 60) {
      return;
    }
    mediaSet.add(url);
    mediaList.push(url);
  }

  function addLink(urlRaw) {
    const url = normalizeUrlCandidate(urlRaw);
    if (!url || linksSet.has(url) || linksList.length >= 80) {
      return;
    }
    linksSet.add(url);
    linksList.push(url);
  }

  function addSnippet(textRaw) {
    const text = String(textRaw || "").trim();
    if (!text || snippetsSet.has(text) || snippetsList.length >= 80) {
      return;
    }
    snippetsSet.add(text);
    snippetsList.push(text);
  }

  function extractUrlsInOrder(textRaw) {
    const text = String(textRaw || "");
    if (!text) {
      return [];
    }
    return Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+/gi), (match) => normalizeUrlCandidate(match?.[0] || "")).filter(Boolean);
  }

  function inspectString(valueRaw, keyRaw = "") {
    const text = String(valueRaw || "").trim();
    if (!text) {
      return;
    }

    const key = String(keyRaw || "").toLowerCase();
    const urls = extractUrlsInOrder(text);
    if (urls.length > 0) {
      for (const url of urls) {
        if (isImageLikeUrl(url)) {
          addMedia(url);
        } else {
          addLink(url);
        }
      }
    } else if (/^https?:\/\//i.test(text)) {
      if (isImageLikeUrl(text)) {
        addMedia(text);
      } else {
        addLink(text);
      }
    }

    if (
      snippetsList.length < 60 &&
      /(title|text|caption|description|desc|name|heading|subheading)/i.test(key) &&
      text.length > 2
    ) {
      addSnippet(text.slice(0, 220));
    }
  }

  function walk(node, keyHint = "") {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, keyHint);
      }
      return;
    }

    if (typeof node === "string") {
      inspectString(node, keyHint);
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        inspectString(value, key);
      } else {
        walk(value, key);
      }
    }
  }

  if (Array.isArray(rich.content)) {
    walk(rich.content, "content");
    const rest = { ...rich };
    delete rest.content;
    walk(rest, "");
  } else {
    walk(rich, "");
  }

  details.media = mediaList.slice(0, 60);
  details.links = linksList.slice(0, 80);
  details.snippets = snippetsList.slice(0, 80);
  return details;
}

