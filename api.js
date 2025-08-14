// api.js — Centralized API calls
import { config } from './script.js';

function getApiBaseUrl() {
  return config?.apiBasePath?.replace(/\/$/, '') || '';
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
  apiDetails: null
};  

const viewApiButton = document.getElementById('viewApiButton');
if (viewApiButton) {
    viewApiButton.addEventListener('click', () => {
      if (!storedApiData.mobileDetails && !storedApiData.apiDetails && !storedApiData.loading) {
          loadApiDataInBackground().then(() => showApiResultsPopup());
      } else {
        showApiResultsPopup();
      }
    });
}

/**
 * Wrap fetch in a timeout.
 */
function fetchWithTimeout(url, options = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const signal = controller.signal;

    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Request timed out"));
    }, API_TIMEOUT);

    fetch(url, { ...options, signal })
      .then(res => {
        clearTimeout(timeout);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * POST request to baseURL + endpoint
 */
async function makeApiRequest(endpoint, body) {
  const cleanEndpoint = endpoint.replace(/^\//, "");
  const url = `${getApiBaseUrl()}/${cleanEndpoint}`;
  console.log(`→ Fetching ${url}`, body);

  try {
    const res = await fetchWithTimeout(url, {
      ...FETCH_OPTIONS,
      method: "POST",
      body: JSON.stringify(body),
    });

    console.log(`← ${url} responded ${res.status}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    return res.json();
  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.message.includes("timed out");
    return {
      error: true,
      message: isTimeout
        ? `Request timed out after ${API_TIMEOUT / 1000} seconds`
        : `Connection failed: ${err.message}`,
      details: isTimeout
        ? "API server did not respond in time."
        : "Could not connect to API server.",
      originalError: err.toString(),
    };
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
  el.classList.add('hidden');
  el.innerHTML = '';
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

  // safe tooltip html
  const safeError = String(errorMsg || 'Unknown error')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
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
 * Update the loading state for the Next buttons.
 */
function setLoadingStateForInitialStep(isLoading) {
  const apiData = document.getElementById('viewApiButton');
  const generateProgramButton = document.getElementById('generateProgramButton');

  const buttons = [apiData, generateProgramButton];

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
  const contentArea = document.getElementById('programDataModalContent');
  const closeBtn = document.getElementById('closeProgramDataModal');

  if (!modal || !contentArea || !closeBtn) {
    console.error("⚠️ Program Data modal elements missing");
    return;
  }

  // Set up close handler
  closeBtn.onclick = () => modal.classList.add('hidden');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Decide what to render
  if (storedApiData.loading) {
    contentArea.innerHTML = renderLoadingMessage();
  } else if (storedApiData.error) {
    contentArea.innerHTML = renderErrorMessage(storedApiData.error);
    attachRetryButtonHandler(modal);
  } else if (storedApiData.mobileDetails || storedApiData.apiDetails) {
    let htmlContent = '';
    if (storedApiData.mobileDetails) {
      htmlContent += renderDataSection("📱 Mobile Apps", storedApiData.mobileDetails);
    }
    if (storedApiData.apiDetails) {
      htmlContent += renderDataSection("🔗 API Endpoints", storedApiData.apiDetails);
    }
    contentArea.innerHTML = htmlContent;
  } else {
    contentArea.innerHTML = renderNoDataMessage();
    attachRetryButtonHandler(modal);
  }

  // Finally show the modal
  modal.classList.remove('hidden');
}  

function renderLoadingMessage() {
  return `
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mb-4"></div>
      <p class="text-lg font-medium">Loading Program Data...</p>
      <p class="text-sm text-gray-500 mt-2">This may take up to a minute to complete.</p>
    </div>
  `;
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
  const domain = localStorage.getItem('enteredUrl') || 'unknown domain';
  return `
    <div class="text-center py-6">
      <div class="bg-gray-50 border-l-4 border-gray-300 text-gray-700 p-4 mb-4 text-left">
        <div class="flex items-center mb-2">
          <span class="text-2xl mr-2">ℹ️</span>
          <p class="font-semibold text-xl">No Program Data Available</p>
        </div>
        <p>No data found for: <span class="font-mono">${domain}</span></p>
      </div>
      <button id="retryApiButton" 
        class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center mx-auto">
        ↻ Load Data
      </button>
    </div>
  `;
}

function attachRetryButtonHandler(modal) {
  const retryBtn = document.getElementById('retryApiButton');
  if (retryBtn) {
      retryBtn.addEventListener('click', () => {
          document.body.removeChild(modal);
              loadApiDataInBackground();
      });
  }
}

// Function to load API data in the background and handle state updates
async function loadApiDataInBackground() {
  // Resolve domain from saved value
  const domain = (localStorage.getItem('enteredUrl') || '').trim();
  if (!domain) {
    console.warn('ℹ️ No domain saved; aborting API load.');
    return;
  }

  // Disable nav + data changes while loading
  setLoadingStateForInitialStep(true);

  // Update state to loading
  storedApiData.loading = true;
  storedApiData.isLoading = true;
  storedApiData.error = null;
  storedApiData.mobileError = null;
  storedApiData.apiError = null;

  // Show loading indicators
  showGlobalLoadingMessage();

  try {
    console.log("Loading API data in background for domain:", domain);

    // If we have cached data for this domain, use it
    const savedData = localStorage.getItem(`apiData_${domain}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        storedApiData.mobileDetails = parsed.mobileDetails || null;
        storedApiData.apiDetails = parsed.apiDetails || null;
        storedApiData.loading = false;
        storedApiData.isLoading = false;
        storedApiData.error = null;
        storedApiData.mobileError = null;
        storedApiData.apiError = null;
        hideGlobalLoadingMessage();
        setLoadingStateForInitialStep(false);
        return;
      } catch {
        // Fall through to fresh fetch
      }
    }

    // Fetch both in parallel
    const [mobileRes, apiRes] = await Promise.all([
      fetchMobileAppDetailsForDomain(domain),
      fetchApiDetails(domain)
    ]);

    // Determine failures
    const mobileError = !!(mobileRes && mobileRes.error);
    const apiError    = !!(apiRes && apiRes.error);

    // If both calls failed, surface a visible error + retry
    if (mobileError && apiError) {
      const mobileReason = mobileRes?.message || mobileRes?.error || "Failed to fetch";
      const apiReason    = apiRes?.message || apiRes?.error || "Failed to fetch";

      storedApiData.mobileError = mobileReason; // <-- set for inline message
      storedApiData.apiError    = apiReason;    // <-- set for inline message

      storedApiData.loading = false;
      storedApiData.isLoading = false;
      storedApiData.error = {
        message: `Error occurred retrieving mobile apps and API for ${domain}.`,
        details: `Mobile: ${mobileReason}  API: ${apiReason}`,
        timestamp: Date.now()
      };

      hideGlobalLoadingMessage();
      setLoadingStateForInitialStep(false);
      showDataRetryButton({ domain, errorMsg: storedApiData.error.details });
      return;
    }

    // At least one succeeded — persist whatever we got
    storedApiData.mobileDetails = mobileError ? null : mobileRes;
    storedApiData.apiDetails    = apiError ? null : apiRes;

    // ✅ set specific error strings for partial failures (so inline line is precise)
    storedApiData.mobileError = mobileError
      ? (mobileRes?.message || mobileRes?.error || "Failed to fetch")
      : null;
    storedApiData.apiError = apiError
      ? (apiRes?.message || apiRes?.error || "Failed to fetch")
      : null;

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

    hideGlobalLoadingMessage();
    setLoadingStateForInitialStep(false);

    // If one piece failed, still show inline retry with precise message
    if (mobileError || apiError) {
      const parts = [];
      if (mobileError) parts.push(`Mobile: ${storedApiData.mobileError}`);
      if (apiError) parts.push(`API: ${storedApiData.apiError}`);
      showDataRetryButton({ domain, errorMsg: parts.join('  ') });
    }

  } catch (error) {
    console.error("Error fetching API data in background:", error);
    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = {
      message: `Failed to load API data: ${error.message}`,
      details: "Please check that the API server is running and accessible.",
      timestamp: Date.now()
    };

    hideGlobalLoadingMessage();
    setLoadingStateForInitialStep(false);
    showDataRetryButton({ domain, errorMsg: `${storedApiData.error.message} — ${storedApiData.error.details}` });
  }
}

/**
 * Public export: fetch mobile app details
 */
export async function fetchMobileAppDetailsForDomain(
  domain,
  search_mode = "app_name",
  retrieve_android_version = false
) {
  return makeApiRequest("mobile-app-details-for-domain", {
    domain,
    search_mode,
    retrieve_android_version
  });
}

/**
 * Public export: fetch API details
 */
export async function fetchApiDetails(domain) {
  return makeApiRequest("api-details", { domain });
}

// Publicly exported API functions
export {
  loadApiDataInBackground,
  showApiResultsPopup, 
  storedApiData
};
