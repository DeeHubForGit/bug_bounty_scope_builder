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
        const enteredUrl = localStorage.getItem('enteredUrl');
        if (enteredUrl) {
          loadApiDataInBackground(enteredUrl).then(() => showApiResultsPopup());
        } else {
          showApiResultsPopup();
        }
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

/**
 * Show the loading indicator near the Next button
 */
function showGlobalLoadingMessage() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

/**
* Hide the loading indicator
*/
function hideGlobalLoadingMessage() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

function updateApiDataButton() {
  const button = document.getElementById('viewApiButton');
  if (!button) return;

  if (storedApiData.loading) {
      button.className = 'bg-blue-400 text-white px-4 py-2 rounded text-sm font-medium';
      button.textContent = 'Retrieving...';
      button.disabled = true;
  } else if (storedApiData.error) {
      button.className = 'bg-red-500 text-white px-4 py-2 rounded text-sm font-medium';
      button.textContent = '⚠️ API Error';
      button.disabled = false;
      button.onclick = showApiResultsPopup;
  } else {
      button.className = 'bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm font-medium';
      button.textContent = '🔍 API Data';
      button.disabled = false;
      button.onclick = showApiResultsPopup;
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
          const domain = localStorage.getItem('enteredUrl');
          if (domain) {
              loadApiDataInBackground(domain);
          } else {
              console.error("Cannot retry: No domain found in storage");
              showMessageModal("Error", "Cannot retry API loading: No domain information available");
          }
      });
  }
}

// Function to load API data in the background and handle state updates
async function loadApiDataInBackground(domain) {
  // Update state to loading
  storedApiData.loading = true;
  storedApiData.isLoading = true;
  storedApiData.error = null;

  // Show loading indicators
  showGlobalLoadingMessage();
  updateApiDataButton();

  try {
    console.log("Loading API data in background for domain:", domain);

    // Check if we already have saved data for this domain
    const savedData = localStorage.getItem(`apiData_${domain}`);
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        console.log("Found saved API data for domain:", domain);

        // Use saved data
        storedApiData.mobileDetails = parsedData.mobileDetails;
        storedApiData.apiDetails = parsedData.apiDetails;
        storedApiData.loading = false;
        storedApiData.isLoading = false;
        storedApiData.error = null;

        // Hide loading message and update the button state
        hideGlobalLoadingMessage();
        updateApiDataButton();
        return;
      } catch (e) {
        console.warn("Error parsing saved API data, fetching fresh data", e);
        // Continue with fetching fresh data
      }
    }

    // Make API calls in parallel
    const [mobileRes, apiRes] = await Promise.all([
      fetchMobileAppDetailsForDomain(domain),
      fetchApiDetails(domain)
    ]);

    // Store API responses
    storedApiData.mobileDetails = mobileRes;
    storedApiData.apiDetails = apiRes;
    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = null;

    console.log("Background API loading complete:");
    console.log("- Mobile API response:", mobileRes);
    console.log("- API Details response:", apiRes);

    // Save the API data to localStorage for persistence
    try {
      const dataToSave = {
        mobileDetails: mobileRes,
        apiDetails: apiRes
      };
      localStorage.setItem(`apiData_${domain}`, JSON.stringify(dataToSave));
      console.log("API data saved to localStorage for domain:", domain);
    } catch (saveError) {
      console.error("Error saving API data to localStorage:", saveError);
    }

    // Hide loading message and update the button state
    hideGlobalLoadingMessage();
    updateApiDataButton();

  } catch (error) {
    console.error("Error fetching API data in background:", error);

    // Update error state
    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = {
      message: `Failed to load API data: ${error.message}`,
      details: "Please check that the API server is running and accessible."
    };

    // Hide loading message and update button state
    hideGlobalLoadingMessage();
    updateApiDataButton();
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
