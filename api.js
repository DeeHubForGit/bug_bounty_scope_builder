// api.js — Centralized API calls
// Avoid hard circular import; prefer window.config if available.
import { config as importedConfig } from './script.js';

function getApiBaseUrl() {
  const cfg = (typeof window !== 'undefined' && window.config) ? window.config : importedConfig;
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

function isApiDetailsEmpty(json) {
  const apiUrls   = Array.isArray(json?.apiUrls) ? json.apiUrls : [];
  const docs      = Array.isArray(json?.documentationUrls) ? json.documentationUrls : [];
  const suggested = json?.suggestedApi;
  return apiUrls.length === 0 && docs.length === 0 && !suggested;
}

function validateApiDetailsPayload(json) {
  if (!json) return { error: true, message: 'Empty response' };
  if (json.error) return { error: true, message: getJsonErrorMessage(json) };
  if (typeof json.notes === 'string' && json.notes.includes('❌')) {
    return { error: true, message: json.notes };
  }
  if (isApiDetailsEmpty(json)) {
    return { error: true, message: 'No API details found' };
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

// api.js — make the Data button DISPLAY‑ONLY (no fetches)
function wireDataButtonDisplayOnly() {
  const btn = document.getElementById('viewDataButton');
  if (!btn) return;

  // Remove any inline onclick and existing listeners by cloning
  const clone = btn.cloneNode(true);
  clone.removeAttribute('onclick'); // safety: kill inline handlers if present
  btn.parentNode.replaceChild(clone, btn);

  // Display-only click handler
  clone.addEventListener('click', (e) => {
    e.preventDefault();
    // Never fetch: ensure loading flags are off so UI shows cached state only
    if (storedApiData) {
      storedApiData.loading = false;
      storedApiData.isLoading = false;
    }
    // Just render whatever is cached (memory/localStorage). No fetch.
    showApiResultsPopup();
  });
}

// Ensure it runs after the button exists
document.addEventListener('DOMContentLoaded', wireDataButtonDisplayOnly);

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
function showGlobalLoadingMessage() {
  const el = document.getElementById('dataLoadingStatus');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `<span class="inline-block animate-spin mr-1">↻</span> Loading…`;
}

// Hide the loading indicator
function hideGlobalLoadingMessage() {
  const el = document.getElementById('dataLoadingStatus');
  if (!el) return;

  // Add a small delay to ensure visibility
  setTimeout(() => {
    el.classList.add('hidden');
    el.innerHTML = '';
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

  // fallbacks
  if (!domain) domain = (localStorage.getItem('enteredUrl') || localStorage.getItem('autoModeDomain') || '').trim() || 'this site';
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

  const buttons = [reset, viewData, generateProgramButton];

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

  // Decide what to render from CACHE ONLY
  const hasMobile = !!(storedApiData && storedApiData.mobileDetails);
  const hasApi    = !!(storedApiData && storedApiData.apiDetails);
  const hasError  = !!(storedApiData && storedApiData.error);

  if (hasMobile || hasApi) {
    let html = '';
    if (hasMobile) html += renderDataSection("📱 Mobile Apps", storedApiData.mobileDetails);
    if (hasApi)    html += renderDataSection("🔗 API Endpoints", storedApiData.apiDetails);
    contentArea.innerHTML = html;
  } else if (hasError) {
    // Show cached error message
    contentArea.innerHTML = renderErrorMessage(storedApiData.error);
  } else {
    // No cached data — show a friendly notice
    contentArea.innerHTML = renderNoDataMessage();
  }

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
    return `<pre class="bg-gray-50 p-2 rounded border text-sm">${JSON.stringify(data, null, 2)}</pre>`;
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

  // Show loading indicators
  showGlobalLoadingMessage();

  const finishIfCurrent = () => {
    if (mySeq === window.__apiLoadState.seq) {
      hideGlobalLoadingMessage();
      setLoadingStateForInitialStep(false);
    }
  };

  try {
    console.log("Loading API data in background for domain:", domain);

    // If we have cached data for this domain, use it
    const savedData = localStorage.getItem(`apiData_${domain}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (mySeq !== window.__apiLoadState.seq) return { status: 'stale' };

        storedApiData.mobileDetails = parsed.mobileDetails || null;
        storedApiData.apiDetails    = parsed.apiDetails || null;
        storedApiData.loading = false;
        storedApiData.isLoading = false;
        storedApiData.error = null;
        storedApiData.mobileError = null;
        storedApiData.apiError = null;

        finishIfCurrent();
        console.log("✅ Loaded cached API data for", domain);
        return { status: 'cached' };
      } catch { /* continue to fetch */ }
    }

    // Fetch both in parallel with abort support
    const [mobileRes, apiRes] = await Promise.allSettled([
      fetchMobileAppDetailsForDomain(domain, { signal: mobileCtrl.signal }),
      fetchApiDetails(domain, { signal: apiCtrl.signal })
    ]);

    if (mySeq !== window.__apiLoadState.seq) return { status: 'stale' };

    const mobileOk  = mobileRes.status === 'fulfilled' && mobileRes.value && !mobileRes.value.error;
    const apiOk     = apiRes.status === 'fulfilled'    && apiRes.value    && !apiRes.value.error;
    const mobileVal = mobileOk ? mobileRes.value : (mobileRes.status === 'fulfilled' ? mobileRes.value : null);
    const apiVal    = apiOk    ? apiRes.value    : (apiRes.status === 'fulfilled'    ? apiRes.value    : null);

    const bothAborted =
      (mobileRes.status === 'rejected' && mobileRes.reason?.name === 'AbortError') &&
      (apiRes.status === 'rejected'    && apiRes.reason?.name    === 'AbortError');
    if (bothAborted) return { status: 'aborted' };

    const mobileError =
      (mobileRes.status === 'rejected' && mobileRes.reason?.name !== 'AbortError') ||
      (mobileRes.status === 'fulfilled' && mobileVal && mobileVal.error);
    const apiError =
      (apiRes.status === 'rejected' && apiRes.reason?.name !== 'AbortError') ||
      (apiRes.status === 'fulfilled' && apiVal && apiVal.error);

    const mobileReason = mobileError
      ? ((mobileRes.status === 'rejected' && mobileRes.reason?.message) ||
         mobileVal?.message || mobileVal?.error || "Failed to fetch")
      : null;

    const apiReason = apiError
      ? ((apiRes.status === 'rejected' && apiRes.reason?.message) ||
         apiVal?.message || apiVal?.error || "Failed to fetch")
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
      };
      finishIfCurrent();
      showDataRetryButton({ domain, errorMsg: storedApiData.error.details });
      console.warn("❌ API background load failed:", storedApiData.error.details);
      return { status: 'error', details: storedApiData.error.details };
    }

    // Partial or full success
    storedApiData.mobileDetails = mobileError ? null : mobileVal;
    storedApiData.apiDetails    = apiError ? null : apiVal;
    storedApiData.mobileError   = mobileReason;
    storedApiData.apiError      = apiReason;
    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = null;

    // Save successful/partial results
    try {
      localStorage.setItem(
        `apiData_${domain}`,
        JSON.stringify({ mobileDetails: storedApiData.mobileDetails, apiDetails: storedApiData.apiDetails })
      );
    } catch (saveError) {
      console.error("Error saving API data to localStorage:", saveError);
    }

    finishIfCurrent();

    if (!mobileError && !apiError) {
      console.log(`✅ API data successfully loaded for ${domain}`);
      return { status: 'ok' };
    } else {
      const parts = [];
      if (mobileError) parts.push(`Mobile: ${mobileReason}`);
      if (apiError) parts.push(`API: ${apiReason}`);
      const msg = parts.join('  ');
      console.warn(`⚠️ API data partially loaded for ${domain} — ${msg}`);
      showDataRetryButton({ domain, errorMsg: msg });
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

    finishIfCurrent();
    showDataRetryButton({ domain, errorMsg: `${storedApiData.error.message} — ${storedApiData.error.details}` });
    return { status: 'error', details: storedApiData.error.message };
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
  storedApiData
};
