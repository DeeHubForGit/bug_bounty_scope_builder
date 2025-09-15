// api.js — Centralized API calls
// Avoid hard circular import; prefer window.config if available.

function getApiBaseUrl() {
  const cfg = (typeof window !== 'undefined' && window.config) ? window.config : null;
  const base = cfg?.apiBasePath?.replace(/\/$/, '') || '';
  if (!base) console.warn('api.js: apiBasePath is empty — requests will hit relative paths.');
  return base;
}

// Live: http://207.246.87.60:5000  Local: http://localhost:5000
const API_TIMEOUT = 60_000;

// Shared fetch options
const FETCH_OPTIONS = {
  mode: "cors",
  credentials: "omit",
  headers: {
    "Content-Type": "application/json",
  }
};

// Global API data store
const storedApiData = {
  loading: false,
  isLoading: false,
  error: null,
  mobileDetails: null,
  apiDetails: null,
  // ✅ initialize these so UI checks are consistent
  mobileError: null,
  apiError: null
}; 

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPartialError(title, message) {
  return `
    <div class="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3">
      <div class="font-semibold">${escapeHtml(title)} error</div>
      <div class="text-sm mt-1">${escapeHtml(message)}</div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// JSON validation helpers (treat 200-with-error as failure)
// ─────────────────────────────────────────────────────────────
function getJsonErrorMessage(json, fallback) {
  if (!json) return fallback || 'Unknown error';
  if (typeof json.notes === 'string' && json.notes.includes('❌')) return json.notes;
  if (typeof json.error === 'string' && json.error) return json.error;
  if (json.message) return json.message;
  return fallback || 'Request failed';
}

function normalizeApiDetails(json) {
  // Unwrap optional { result: {...} }
  const src = (json && typeof json.result === 'object') ? json.result : json;
  const apiUrls = Array.isArray(src?.apiUrls)
    ? src.apiUrls
    : (Array.isArray(src?.api_urls) ? src.api_urls : []);
  const documentationUrls = Array.isArray(src?.documentationUrls)
    ? src.documentationUrls
    : (Array.isArray(src?.documentation_urls) ? src.documentation_urls : []);
  const suggestedApi = src?.suggestedApi || src?.suggested_api || null;

  // Preserve other fields, but ensure our canonical keys exist
  return {
    ...(src || {}),
    apiUrls,
    documentationUrls,
    suggestedApi
  };
}

function isApiDetailsEmpty(json) {
  const norm = normalizeApiDetails(json);
  const apiUrls   = Array.isArray(norm.apiUrls) ? norm.apiUrls : [];
  const docs      = Array.isArray(norm.documentationUrls) ? norm.documentationUrls : [];
  const suggested = norm?.suggestedApi;
  return apiUrls.length === 0 && docs.length === 0 && !suggested;
}

// Consider mobile details "empty" if there are no suggested apps and no alternatives
function isMobileDetailsEmpty(json) {
  const suggested = Array.isArray(json?.suggested_apps) ? json.suggested_apps : [];
  const alts = json?.alternatives || {};
  const ios = Array.isArray(alts?.iOS) ? alts.iOS : [];
  const android = Array.isArray(alts?.Android) ? alts.Android : [];
  return suggested.length === 0 && ios.length === 0 && android.length === 0;
}

function validateApiDetailsPayload(json) {
  if (!json) return { error: true, message: 'Empty response' };
  if (json.error) return { error: true, message: getJsonErrorMessage(json) };
  if (typeof json.notes === 'string' && json.notes.includes('❌')) {
    return { error: true, message: json.notes };
  }
  // If empty, that's a valid "no data" outcome — not an error
  // Callers will decide how to present (typically, omit the section silently)
  if (isApiDetailsEmpty(json)) {
    return { error: false };
  }
  return { error: false };
}

function validateMobilePayload(json) {
  if (!json) return { error: true, message: 'Empty response' };
  if (json.error) return { error: true, message: getJsonErrorMessage(json) };
  if (typeof json.notes === 'string' && json.notes.includes('❌')) {
    return { error: true, message: json.notes };
  }
  return { error: false };
}

function normalizeDomain(input = '') {
  let s = String(input).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return s.split('/')[0];
}


/**
 * POST request to baseURL + endpoint
 */
async function makeApiRequest(endpoint, body, opts = {}) {
  const { signal, validate, timeoutMs = API_TIMEOUT } = opts;
  const url = `${getApiBaseUrl()}/${endpoint}`;
  console.log('→ Fetching', url, body);

  const ac = new AbortController();

  // Chain caller's signal to our controller
  if (signal) {
    if (signal.aborted) {
      ac.abort(signal.reason || new DOMException('aborted', 'AbortError'));
    } else {
      signal.addEventListener(
        'abort',
        () => ac.abort(signal.reason || new DOMException('aborted', 'AbortError')),
        { once: true }
      );
    }
  }

  // Proper timeout AbortError
  const timeoutId = setTimeout(
    () => ac.abort(new DOMException('timeout', 'AbortError')),
    timeoutMs
  );

  try {
    const res = await fetch(url, {
      ...FETCH_OPTIONS,
      method: 'POST',
      body: JSON.stringify(body),
      signal: ac.signal
    });

    clearTimeout(timeoutId);
    console.log('←', url, 'responded', res.status);

    if (!res.ok) {
      return { error: true, message: `HTTP ${res.status} ${res.statusText}` };
    }

    const json = await res.json();

    // Payload-level validation
    if (typeof validate === 'function') {
      const verdict = validate(json);
      if (verdict?.error) {
        return { error: true, message: verdict.message || getJsonErrorMessage(json) };
      }
    } else if (typeof json?.notes === 'string' && json.notes.includes('❌')) {
      return { error: true, message: json.notes };
    }

    return json;
  } catch (e) {
    const isAbort = e?.name === 'AbortError';
    const isTimeout = isAbort && String(e?.message || '').toLowerCase().includes('timeout');
    if (isAbort && !isTimeout) throw e; // caller-aborted — let outer logic see AbortError

    return {
      error: true,
      message: isTimeout
        ? `Request timed out after ${API_TIMEOUT / 1000} seconds`
        : `Connection failed: ${e?.message || 'Network error'}`,
      details: isTimeout
        ? 'API server did not respond in time.'
        : 'Could not connect to API server.',
      originalError: String(e)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Show the loading indicator near the nav buttons
// Inline “Loading…” banner near the nav buttons.
// Backward-compatible signature:
//   showGlobalLoadingMessage(domainString)
// New (optional) signature:
//   showGlobalLoadingMessage({ domain, needsMobile: bool, needsApi: bool })
function showGlobalLoadingMessage(domainOrOptions) {
  const el = document.getElementById('dataLoadingStatus');
  if (!el) return;

  // Cancel any pending hide of this element (from hideGlobalLoadingMessage)
  try {
    if (window.__apiLoadState?.hideT) {
      clearTimeout(window.__apiLoadState.hideT);
      window.__apiLoadState.hideT = null;
    }
    // Loading spinner should not be pinned
    if (!window.__apiLoadState) window.__apiLoadState = {};
    window.__apiLoadState.pinned = false;
  } catch {}

  // ——— Parse args (backward compatible) ———
  let domainArg = domainOrOptions;
  let needsMobile = true;
  let needsApi = true;

  if (typeof domainOrOptions === 'object' && domainOrOptions !== null) {
    domainArg   = domainOrOptions.domain;
    // If flags are provided, use them; otherwise default to true to match old behavior
    needsMobile = (typeof domainOrOptions.needsMobile === 'boolean') ? domainOrOptions.needsMobile : true;
    needsApi    = (typeof domainOrOptions.needsApi    === 'boolean') ? domainOrOptions.needsApi    : true;
  }

  const domain = normalizeDomain(
    domainArg || (localStorage.getItem('enteredUrl') || localStorage.getItem('autoModeDomain') || 'this site')
  );

  // ——— Build precise message ———
  // Grammar: "APIs" (no apostrophe); handle single vs combined text.
  let what;
  if (needsMobile && needsApi)      what = "mobiles and APIs";
  else if (needsMobile)             what = "mobiles";
  else if (needsApi)                what = "APIs";
  else                              what = "data";

  el.classList.remove('hidden');
  el.innerHTML = `
    <span class="inline-block animate-spin mr-1">↻</span>
    Attempting to retrieve ${what} for
    <span class="font-mono">${escapeHtml(domain)}</span>
  `;
}

// Hide the loading indicator
function hideGlobalLoadingMessage() {
  const el = document.getElementById('dataLoadingStatus');
  if (!el) return;

  // Add a small delay to ensure visibility
  try { if (!window.__apiLoadState) window.__apiLoadState = {}; } catch {}
  // If UI is pinned (showing persistent error/retry), do not hide
  if (window.__apiLoadState?.pinned) {
    return;
  }
  if (window.__apiLoadState?.hideT) {
    try { clearTimeout(window.__apiLoadState.hideT); } catch {}
    window.__apiLoadState.hideT = null;
  }
  window.__apiLoadState.hideT = setTimeout(() => {
    el.classList.add('hidden');
    el.innerHTML = '';
    try { window.__apiLoadState.hideT = null; } catch {}
  }, 300); // Delay in milliseconds
  
}

// Inline “Retry” control next to the arrows
function showDataRetryButton(domainOrOptions, maybeErrorMsg, maybeRetryFnName) {
  // support both call styles
  let domain = '', errorMsg = '', retryFnName = 'handleLoadApiData';
  if (typeof domainOrOptions === 'object' && domainOrOptions) {
    domain = domainOrOptions.domain || '';
    errorMsg = domainOrOptions.errorMsg || '';
    retryFnName = domainOrOptions.retryFnName || 'handleLoadApiData';
  } else {
    domain = domainOrOptions || '';
    errorMsg = maybeErrorMsg || '';
    retryFnName = maybeRetryFnName || 'handleLoadApiData';
  }

  // Cancel any pending hide of this element (from hideGlobalLoadingMessage)
  try {
    if (window.__apiLoadState?.hideT) {
      clearTimeout(window.__apiLoadState.hideT);
      window.__apiLoadState.hideT = null;
    }
    // Pin the UI so hiders will not clear it until URL changes
    if (!window.__apiLoadState) window.__apiLoadState = {};
    window.__apiLoadState.pinned = true;
  } catch {}

  // fallbacks
  if (!domain) domain = (localStorage.getItem('enteredUrl') || '').trim() || 'this site';
  if (!errorMsg && storedApiData?.error) {
    errorMsg = `${storedApiData.error.message || 'Unknown error'}${storedApiData.error.details ? ' — ' + storedApiData.error.details : ''}`;
  }

  const el = document.getElementById('dataLoadingStatus');
  if (!el) return;

  // 🔹 Build precise one‑liner based on which retrieval failed
  const mobileFailed = !!storedApiData?.mobileError;
  const apiFailed    = !!storedApiData?.apiError;
  let lineMsg;
  if (mobileFailed && apiFailed) {
    lineMsg = `Error occurred retrieving mobile apps and API`;
  } else if (mobileFailed) {
    lineMsg = `Error occurred retrieving mobile apps`;
  } else if (apiFailed) {
    lineMsg = `Error occurred retrieving API details`;
  } else {
    lineMsg = `Error occurred retrieving program data`;
  }

  // safe tooltip html — include & first
  const safeError = String(errorMsg || 'Unknown error')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');

  el.classList.remove('hidden');
  el.innerHTML = `
    <button type="button"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
      onclick="${retryFnName}()">
      ↻ Retry
    </button>

    <span class="ml-2 text-gray-600 inline-flex items-center gap-1">
      ${lineMsg}
      <div class="relative ml-1">
        <span class="text-blue-500 cursor-pointer text-sm group">ℹ️
          <span class="absolute left-full top-1/2 ml-2 -translate-y-1/2 w-72 bg-blue-100 text-black text-sm rounded-lg shadow-lg p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 border border-blue-300">
            ${safeError}
          </span>
        </span>
      </div>
    </span>`;
}

/**
 * Update the loading state for the buttons.
 */
function setLoadingStateForInitialStep(isLoading) {
  const reset = document.getElementById('resetButton');
  const viewData = document.getElementById('viewDataButton');
  const generateProgramButton = document.getElementById('generateProgramButton');

  const buttons = [reset, viewData];

  buttons.forEach(btn => {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  });

  // Handle spinner inside the Generate Program button
  if (generateProgramButton) {
    if (isLoading) {
      generateProgramButton.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span>Loading...`;
    } else {
      generateProgramButton.innerHTML = `Generate Program`;
    }
  }
}

function showApiResultsPopup() {
  const modal = document.getElementById('programDataModal');
  // Fallback to legacy ID if needed
  const contentArea =
    document.getElementById('programDataModalContent') ||
    document.getElementById('programDataContent') ||
    modal;
  const closeBtn = document.getElementById('closeProgramDataModal');

  if (!modal || !contentArea || !closeBtn) {
    console.error("⚠️ Program Data modal elements missing");
    return;
  }

  // Close handlers
  closeBtn.onclick = () => modal.classList.add('hidden');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // 🔒 Display-only: ensure no fetch can be triggered by "loading" state
  if (typeof storedApiData !== 'undefined' && storedApiData) {
    storedApiData.loading   = false;
    storedApiData.isLoading = false;
  }

  // Check if we have any data to show
  const hasMobile = !!(storedApiData?.mobileDetails);
  const hasApi = !!(storedApiData?.apiDetails);
  const hasError = !!(storedApiData?.error);
  
  let html = '';

  if (hasError) {
    // Show error message if there was an error
    html = renderErrorMessage(storedApiData.error);
  } else if (!hasMobile && !hasApi) {
    // No data case - show empty state
    html = `
      <div class="p-4 text-center">
        <div class="text-gray-500 mb-2">No data available</div>
        <p class="text-sm text-gray-600">Enter a valid URL to load data</p>
      </div>
    `;
  } else {
    // We have some data to show
    const mobileHasData = hasMobile && !isMobileDetailsEmpty(storedApiData.mobileDetails);
    const apiHasData = hasApi && !isApiDetailsEmpty(storedApiData.apiDetails);

    // Optional top notice if both are empty
    if (!mobileHasData && !apiHasData) {
      html += `
        <div class="bg-gray-50 border-l-4 border-gray-300 text-gray-700 p-3 mb-3">
          <div class="text-sm">No data found, you can still select a reward and generate the program.</div>
        </div>`;
    }

    // Mobile section
    if (mobileHasData) {
      html += renderDataSection("📱 Mobile Apps", storedApiData.mobileDetails);
    } else if (storedApiData?.mobileError) {
      html += renderPartialError("Mobile Apps", storedApiData.mobileError);
    } else {
      html += `<div class="mb-4"><strong class="text-lg text-blue-700">📱 Mobile Apps</strong><div class="mt-2 text-sm text-gray-600">No mobile apps found</div></div>`;
    }

    // API section
    if (apiHasData) {
      html += renderDataSection("🔗 API", storedApiData.apiDetails);
    } else if (storedApiData?.apiError) {
      html += renderPartialError("API", storedApiData.apiError);
    } else {
      html += `<div class="mb-4"><strong class="text-lg text-blue-700">🔗 API</strong><div class="mt-2 text-sm text-gray-600">No API's or documentation found</div></div>`;
    }
  }

  // Set the content
  contentArea.innerHTML = html || renderNoDataMessage();

  // Wire up the Retry button inside the modal (if present)
  const retryBtn = contentArea.querySelector('#retryApiButton');
  if (retryBtn) {
    retryBtn.onclick = (e) => {
      e.preventDefault();
      // Prefer a global handler if your app exposes one
      if (typeof window.handleLoadApiData === 'function') {
        window.handleLoadApiData();
      } else {
        // fallback: re-use last entered domain via background loader
        const domain = (localStorage.getItem('enteredUrl') || '').trim();
        if (domain) loadApiDataInBackground(domain);
      }
      // keep modal open so user sees updates; close if you prefer
      // modal.classList.add('hidden');
    };
  }

  // Show modal
  modal.classList.remove('hidden');
}

function renderErrorMessage(errorObj) {
  const timestamp = errorObj.timestamp 
    ? new Date(errorObj.timestamp).toLocaleString() 
    : new Date().toLocaleString();

  return `
    <div class="text-center py-6">
      <div class="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4 text-left">
        <div class="flex items-center mb-2">
          <span class="text-2xl mr-2">⚠️</span>
          <p class="font-bold text-xl">Program Data Error</p>
        </div>
        <p class="font-medium">${errorObj.message || 'Failed to load data'}</p>
        <p class="text-sm mt-1">${errorObj.details || 'No detailed error information available'}</p>
        <p class="text-xs text-gray-600 mt-1">Time: ${timestamp}</p>
      </div>
      <button id="retryApiButton" 
        class="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center mx-auto">
        <span class="inline-block mr-2">↻</span> Retry
      </button>
    </div>
  `;
}

function renderDataSection(title, data) {
  if (!data) {
    return `<div class="mb-4"><strong>${title}:</strong> <span class="text-gray-500">No data available</span></div>`;
  }

  return `
    <div class="mb-4">
      <strong class="text-lg text-blue-700">${title}</strong>
      <div class="mt-2">${formatProgramDataContent(data)}</div>
    </div>
  `;
}

function formatProgramDataContent(data) {
  if (Array.isArray(data)) {
    return `<ul class="list-disc pl-5">${data.map(item => `<li>${item}</li>`).join('')}</ul>`;
  }

  if (typeof data === 'object') {
    // Allow long lines/URLs to wrap instead of being visually cut off
    return `<pre class="bg-gray-50 p-2 rounded border text-sm" style="white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
  }

  return `<p>${data}</p>`;
}

function renderNoDataMessage() {
  const domain = (localStorage.getItem('enteredUrl') || '').trim();

  const domainLine = domain
    ? `No data found for: <span class="font-mono">${domain}</span>`
    : `No URL entered yet. Enter a website above to collect data.`;

  return `
    <div class="text-center py-6">
      <div class="bg-gray-50 border-l-4 border-gray-300 text-gray-700 p-4 mb-2 text-left">
        <div class="flex items-center mb-2">
          <span class="text-2xl mr-2">ℹ️</span>
          <p class="font-semibold text-xl">No Program Data Available</p>
        </div>
        <p>${domainLine}</p>
      </div>
      <p class="text-sm text-gray-500">Tip: Program data loads automatically from the main form once a valid URL is entered.</p>
    </div>
  `;
}

// Global (per-page) slot to track the latest background load + controllers
window.__apiLoadState = window.__apiLoadState || { seq: 0, mobileCtrl: null, apiCtrl: null };

// Function to load API data in the background and handle state updates
async function loadApiDataInBackground(domainArg) {
  // Prefer provided domain; fall back to localStorage.
  const domainRaw = domainArg || (localStorage.getItem('enteredUrl') || '').trim();
  const domain = normalizeDomain(domainRaw);

  if (!domain) {
    console.warn('ℹ️ No domain saved; aborting API load.');
    return { status: 'noop' };
  }

  // Cancel in-flight
  try { window.__apiLoadState.mobileCtrl?.abort(); } catch {}
  try { window.__apiLoadState.apiCtrl?.abort(); } catch {}
  const mobileCtrl = new AbortController();
  const apiCtrl    = new AbortController();
  const mySeq = ++window.__apiLoadState.seq;
  window.__apiLoadState.mobileCtrl = mobileCtrl;
  window.__apiLoadState.apiCtrl    = apiCtrl;

  // UI: loading
  setLoadingStateForInitialStep(true);

  // Update state to loading
  storedApiData.loading = true;
  storedApiData.isLoading = true;
  storedApiData.error = null;
  storedApiData.mobileError = null;
  storedApiData.apiError = null;

  // Show loading indicators (neutral until we know which sides we will fetch)
  showGlobalLoadingMessage({ domain, needsMobile: false, needsApi: false });
  try { window.dispatchEvent(new CustomEvent('api-loading-started')); } catch {}

  const finishIfCurrent = () => {
    if (mySeq === window.__apiLoadState.seq) {
        hideGlobalLoadingMessage();
      setLoadingStateForInitialStep(false);
      try { window.dispatchEvent(new CustomEvent('api-loading-finished')); } catch {}
    }
  };

  try {
    console.log("Loading data in background for domain:", domain);

    // Check if we have cached data for this domain
    const savedData    = localStorage.getItem(`apiData_${domain}`);
    const noMobileFlag = localStorage.getItem(`noMobileData_${domain}`) === '1';
    const noApiFlag    = localStorage.getItem(`noApiData_${domain}`) === '1';
    let hasCompleteCache = false; // compute after applying cache

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (mySeq !== window.__apiLoadState.seq) return { status: 'stale' };

        // Only update if we don't already have the data or need to retry
        if (!storedApiData.mobileDetails && !noMobileFlag) {
          storedApiData.mobileDetails = parsed.mobileDetails || null;
        }
        if (!storedApiData.apiDetails && !noApiFlag) {
          storedApiData.apiDetails = parsed.apiDetails ? normalizeApiDetails(parsed.apiDetails) : null;
        }

        // Cache is complete only if BOTH objects exist
        hasCompleteCache = !!storedApiData.mobileDetails && !!storedApiData.apiDetails;

        // If fully satisfied by cache, we can clear the loading state now
        if (hasCompleteCache) {
          storedApiData.loading = false;
          storedApiData.isLoading = false;
          storedApiData.error = null;
          storedApiData.mobileError = null;
          storedApiData.apiError = null;
          finishIfCurrent();
        }

        // Let UI reflect whatever we just loaded
        try { window.dispatchEvent(new CustomEvent('api-data-updated')); } catch {}
      } catch (e) {
        console.warn('Error parsing cached data, will refetch', e);
        hasCompleteCache = false;
      }
    } else {
      hasCompleteCache = false;
    }

    // If we truly have both mobile + API from cache, don't fetch anything
    if (hasCompleteCache) {
      return { status: 'cached' };
    }

    // ─────────────────────────────────────────────────────────────
    // Decide what to fetch (rule):
    //  - initialDataRetrieval OR previous failure/missing -> fetch that side
    // ─────────────────────────────────────────────────────────────
    const isInitial = !savedData;

    const needsMobileData =
      isInitial ||
      !!storedApiData.mobileError ||
      (!storedApiData.mobileDetails && !noMobileFlag);

    const needsApiData =
      isInitial ||
      !!storedApiData.apiError ||
      (!storedApiData.apiDetails && !noApiFlag);

    // Now that we know which sides we plan to fetch, update the banner precisely
    try {
      showGlobalLoadingMessage({ domain, needsMobile: needsMobileData, needsApi: needsApiData });
    } catch {}

    // Build the two promises, skipping sides we don't need
    const mobilePromise = needsMobileData
      ? fetchMobileAppDetailsForDomain(domain, { signal: mobileCtrl.signal })
      : Promise.resolve({ __skipped: true });

    const apiPromise = needsApiData
      ? fetchApiDetails(domain, { signal: apiCtrl.signal })
      : Promise.resolve({ __skipped: true });

    // Fetch (or skip) with abort support
    const [mobileRes, apiRes] = await Promise.allSettled([mobilePromise, apiPromise]);

    if (mySeq !== window.__apiLoadState.seq) return { status: 'stale' };

    // Normalize results so downstream logic can reason about them
    const mobileSkipped  = mobileRes.status === 'fulfilled' && mobileRes.value && mobileRes.value.__skipped;
    const apiSkipped     = apiRes.status    === 'fulfilled' && apiRes.value    && apiRes.value.__skipped;

    const mobileFulfilled = mobileRes.status === 'fulfilled' && !mobileSkipped;
    const apiFulfilled    = apiRes.status    === 'fulfilled' && !apiSkipped;

    const mobileVal = mobileFulfilled ? mobileRes.value : null;
    const apiValRaw = apiFulfilled    ? apiRes.value    : null;
    const apiVal    = apiValRaw ? normalizeApiDetails(apiValRaw) : apiValRaw;

    // Slight readability tidy
    const mobileOk = mobileSkipped || (mobileFulfilled && !mobileVal?.error);
    const apiOk    = apiSkipped    || (apiFulfilled    && !apiValRaw?.error);

    const bothAborted =
      (mobileRes.status === 'rejected' && mobileRes.reason?.name === 'AbortError') &&
      (apiRes.status    === 'rejected' && apiRes.reason?.name    === 'AbortError');
    if (bothAborted) return { status: 'aborted' };

    // Distinguish between true error and valid "no data" response
    let mobileError =
      (!mobileSkipped) && (
        (mobileRes.status === 'rejected' && mobileRes.reason?.name !== 'AbortError') ||
        (mobileFulfilled && mobileVal && mobileVal.error)
      );

    let apiError =
      (!apiSkipped) && (
        (apiRes.status === 'rejected' && apiRes.reason?.name !== 'AbortError') ||
        (apiFulfilled && apiValRaw && apiValRaw.error)
      );

    const mobileNoData = (!mobileSkipped) && mobileOk && mobileFulfilled && isMobileDetailsEmpty(mobileVal || {});
    const apiNoData    = (!apiSkipped)    && apiOk    && apiFulfilled    && isApiDetailsEmpty(apiVal);

    if (mobileNoData) mobileError = false;
    if (apiNoData)    apiError    = false;

    const mobileReason = mobileError
      ? ((mobileRes.status === 'rejected' && mobileRes.reason?.message) ||
         mobileVal?.message || mobileVal?.error || "Failed to fetch")
      : null;

    const apiReason = apiError
      ? ((apiRes.status === 'rejected' && apiRes.reason?.message) ||
         apiValRaw?.message || apiValRaw?.error || "Failed to fetch")
      : null;

    if (mobileError && apiError) {
      storedApiData.mobileError = mobileReason;
      storedApiData.apiError    = apiReason;
      storedApiData.loading = false;
      storedApiData.isLoading = false;
      storedApiData.error = {
        message: `Error occurred retrieving mobile apps and API for ${domain}.`,
        details: `Mobile: ${mobileReason}  API: ${apiReason}`,
        timestamp: Date.now()
      }
      try { window.dispatchEvent(new CustomEvent('api-data-updated')); } catch {}
      const hideTimeoutId = window.__apiLoadState.hideTimeoutId;
      if (hideTimeoutId) {
        window.clearTimeout(hideTimeoutId);
        window.__apiLoadState.hideTimeoutId = null;
      }
      showDataRetryButton({ domain, errorMsg: storedApiData.error.details });
      finishIfCurrent();
      console.warn("❌ API background load failed:", storedApiData.error.details);
      return { status: 'error', details: storedApiData.error.details };
    }

    // For mobile data, only update if we got new data or had an error
    if (!mobileSkipped) {
      if (mobileOk && !mobileNoData) {
        storedApiData.mobileDetails = mobileVal;
        storedApiData.mobileError = null;
        // Clear the no-data flag since we have valid data
        try { localStorage.removeItem(`noMobileData_${domain}`); } catch {}
        // Clear any persisted last error for Mobile
        try { localStorage.removeItem(`mobileLastError_${domain}`); } catch {}
      } else if (mobileError) {
        // Only update error state if we don't have cached data
        if (!storedApiData.mobileDetails) {
          storedApiData.mobileDetails = null;
          storedApiData.mobileError = mobileReason;
        }
        // Persist that Mobile retrieval failed (for retry on reload)
        try { localStorage.setItem(`mobileLastError_${domain}`, '1'); } catch {}
      } else if (mobileNoData) {
        // Only set no-data flag if we don't have cached data
        if (!storedApiData.mobileDetails) {
          storedApiData.mobileDetails = null;
          try { localStorage.setItem(`noMobileData_${domain}`, '1'); } catch {}
        }
        // No data is not an error → clear last error flag
        try { localStorage.removeItem(`mobileLastError_${domain}`); } catch {}
      }
    }

    // For API data, only update if we got new data or had an error
    if (!apiSkipped) {
      if (apiOk && !apiNoData) {
        storedApiData.apiDetails = apiVal;
        storedApiData.apiError = null;
        try { localStorage.removeItem(`noApiData_${domain}`); } catch {}
        // Clear any persisted last error for API
        try { localStorage.removeItem(`apiLastError_${domain}`); } catch {}
      } else if (apiError) {
        if (!storedApiData.apiDetails) {
          storedApiData.apiDetails = null;
          storedApiData.apiError = apiReason;
        }
        // Persist that API retrieval failed (for retry on reload)
        try { localStorage.setItem(`apiLastError_${domain}`, '1'); } catch {}
      } else if (apiNoData) {
        if (!storedApiData.apiDetails) {
          storedApiData.apiDetails = null;
          try { localStorage.setItem(`noApiData_${domain}`, '1'); } catch {}
        }
        // No data is not an error → clear last error flag
        try { localStorage.removeItem(`apiLastError_${domain}`); } catch {}
      }
    }

    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = null;

    // Save successful/partial results
    try {
      const toCache = {
        mobileDetails: storedApiData.mobileDetails,
        apiDetails: storedApiData.apiDetails,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`apiData_${domain}`, JSON.stringify(toCache));
    } catch (e) {
      console.warn("Failed to cache API data:", e);
    }

    finishIfCurrent();

    if (!mobileError && !apiError) {
      // Availability AFTER this run
      const mobilePresent = !!storedApiData.mobileDetails;
      const apiPresent    = !!storedApiData.apiDetails;

      // What we actually did THIS run (use planned fetch flags to avoid mislabeling)
      const fetchedMobile = (typeof needsMobileData !== 'undefined') ? (needsMobileData && mobileFulfilled) : ((typeof mobileSkipped === 'boolean') ? (!mobileSkipped && mobileFulfilled) : false);
      const fetchedApi    = (typeof needsApiData    !== 'undefined') ? (needsApiData    && apiFulfilled)    : ((typeof apiSkipped === 'boolean')    ? (!apiSkipped    && apiFulfilled)    : false);

      // Log a compact, explicit summary
      const availSummary   = `available → mobiles: ${mobilePresent ? 'yes' : 'no'}, api: ${apiPresent ? 'yes' : 'no'}`;
      const fetchedSummary = `fetched   → mobiles: ${fetchedMobile ? 'yes' : 'no (cached/skip)'}, api: ${fetchedApi ? 'yes' : 'no (cached/skip)'}`;

      // Headline reflects what was actually fetched this run
      if (!fetchedMobile && !fetchedApi) {
        console.log(`✅ Data Retrieval — none fetched for ${domain} | ${availSummary}; ${fetchedSummary}`);
      } else if (fetchedMobile && !fetchedApi) {
        console.log(`✅ Data Retrieval — mobiles only fetched for ${domain} | ${availSummary}; ${fetchedSummary}`);
      } else if (!fetchedMobile && fetchedApi) {
        console.log(`✅ Data Retrieval — API only fetched for ${domain} | ${availSummary}; ${fetchedSummary}`);
      } else {
        console.log(`✅ Data Retrieval — mobiles + API fetched for ${domain} | ${availSummary}; ${fetchedSummary}`);
      }

      return { status: 'ok' };
    } else {
      const parts = [];
      if (mobileError) parts.push(`Mobile: ${mobileReason}`);
      if (apiError)    parts.push(`API: ${apiReason}`);
      const msg = parts.join('  ');
      console.warn(`⚠️ API data partially loaded for ${domain} — ${msg}`);
      showDataRetryButton({ domain, errorMsg: msg });
      finishIfCurrent();
      return { status: 'partial', details: msg };
    }

  } catch (error) {
    if (error?.name === 'AbortError') return { status: 'aborted' };
    console.error("Error fetching API data in background:", error);
    if (mySeq !== window.__apiLoadState.seq) return { status: 'stale' };

    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = {
      message: `Failed to load API data: ${error.message}`,
      details: "Please check that the API server is running and accessible.",
      timestamp: Date.now()
    };

    // Persist last-error flags so reload can retry per your policy
    try {
      localStorage.setItem(`mobileLastError_${domain}`, '1');
      localStorage.setItem(`apiLastError_${domain}`, '1');
    } catch {}

    try { window.dispatchEvent(new CustomEvent('api-data-updated')); } catch {}
    showDataRetryButton({ domain, errorMsg: `${storedApiData.error.message} — ${storedApiData.error.details}` });
    finishIfCurrent();
    return { status: 'error', details: storedApiData.error.message };
  }
}

/**
 * Public export: check if a domain resolves (backend).
 * - Normalizes the domain before sending (strips scheme/www/path).
 * - Accepts both { resolvable: boolean } and { result: { resolvable: boolean } }.
 * - Returns true/false; returns false on HTTP/transport errors.
 * NOTE: No stale-guard inside. Callers should compare their own requestId.
 */
async function checkDomainResolvable(domain) {
  // normalize (api.js already has normalizeDomain)
  const normalized = normalizeDomain(domain);
  const url = getApiBaseUrl() + "/is-domain-resolvable";
  const payload = { domain: normalized };

  console.log("→ Fetching", url, payload);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("←", url, "responded", res.status);
    if (!res.ok) return null; // transport-level failure -> unknown

    const data = await res.json();

    // Support both shapes
    let resolvable = false;
    if (typeof data?.resolvable === "boolean") {
      resolvable = data.resolvable;
    } else if (typeof data?.result?.resolvable === "boolean") {
      resolvable = data.result.resolvable;
    }

    if (!resolvable) {
      console.warn("Domain appears unresolvable (frontend warning only):", { domain: normalized, result: data?.result });
    }
    return resolvable;
  } catch (e) {
    console.warn("Resolvability check failed:", e?.message || e);
    return null; // unknown — let caller proceed and fetch
  }
}

/**
 * Public export: fetch mobile app details
 */
export async function fetchMobileAppDetailsForDomain(
  domain,
  search_mode = "app_name",
  retrieve_android_version = false,
  opts = {}
) {
  if (typeof search_mode === 'object' && search_mode !== null) {
    opts = search_mode; search_mode = "app_name"; retrieve_android_version = false;
  }
  return makeApiRequest(
    "mobile-app-details-for-domain",
    { domain: normalizeDomain(domain), search_mode, retrieve_android_version },
    { signal: opts.signal, validate: validateMobilePayload }
  );
}

/**
 * Public export: fetch API details
 */
export async function fetchApiDetails(domain, opts = {}) {
  if (opts && typeof opts !== 'object') opts = {};
  return makeApiRequest(
    "api-details",
    { domain: normalizeDomain(domain) },
    { signal: opts.signal, validate: validateApiDetailsPayload }
  );
}

// Publicly exported API functions
export {
  loadApiDataInBackground,
  showApiResultsPopup, 
  storedApiData,
  checkDomainResolvable,
  setLoadingStateForInitialStep,
  normalizeApiDetails
};
