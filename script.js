import { initializeSteps, setupEventListeners, registerLoadApiDataFn, registerDisplayScopeText } from './navigation.js';
import { renderRewardTiers, getRewardsTextForScope } from './rewards.js';
import { fetchMobileAppDetailsForDomain, fetchApiDetails } from './api.js';

// Data is split into three JSON files:
// - config.json for app settings
// - scope_text.json for program scope
// - rewards.json for bounty tiers
// This keeps responsibilities clear and files easier to maintain.
let config = null;
let scopeText = null;
let rewards = null;

// Global API data store
const storedApiData = {
    loading: false,
    isLoading: false,
    error: null,
    mobileDetails: null,
    apiDetails: null
  };  

// Run this once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load all required app config (settings, scope text, rewards) 
    // before setting up the wizard interface
    loadAppConfig()
      .then(() => {
        // After data is loaded:
        // 1. Initialize step navigation
        // 2. Render available reward tiers
        // 3. Attach all button and UI event listeners
        registerDisplayScopeText(displayScopeText);
        renderRewardTiers(rewards);
        initializeSteps();
        setupUrlPersistence(); 
        setupEventListeners();
      })
      .catch(error => {
        // If initialization fails, log the error for debugging
        console.error('Error initializing app:', error);
      });
  });  

  const viewApiButton = document.getElementById('viewApiButton');
  if (viewApiButton) {
    viewApiButton.addEventListener('click', showApiResultsPopup);
  }
  

/**
 * Load config, scope text, and rewards from separate JSON files
 * @returns {Promise} Promise resolving when all data is loaded
 */
async function loadAppConfig() {
    try {
      // Load all three files in parallel
      const [scopeRes, rewardsRes, configRes] = await Promise.all([
        fetch('scope_text.json'),
        fetch('rewards.json'),
        fetch('config.json')
      ]);
  
      // Check responses
      if (!scopeRes.ok) throw new Error(`Scope load failed: ${scopeRes.status}`);
      if (!rewardsRes.ok) throw new Error(`Rewards load failed: ${rewardsRes.status}`);
      if (!configRes.ok) throw new Error(`Config load failed: ${configRes.status}`);
  
      // Parse JSON
      let [scopeJson, rewardsJson, configJson] = await Promise.all([
        scopeRes.json(),
        rewardsRes.json(),
        configRes.json()
      ]);
  
      // Unwrap keys for clarity
      scopeText = scopeJson.scope_text;  // still wrapped
      rewards   = rewardsJson;           // ✅ already flattened
      config    = configJson;            // ✅ already flattened
  
      // Validate
      if (!Array.isArray(scopeText)) {
        throw new Error('Invalid scope_text format — expected an array');
      }
      if (!rewards || !rewards.tiers) {
        throw new Error('Invalid rewards format — missing tiers');
      }
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid config format — expected object');
      }
  
      console.log('✅ Data loaded:', { scopeText, rewards, config });
      return { scopeText, rewards, config };
  
    } catch (error) {
      console.error('❌ Error loading app data:', error);
      throw error;
    }
  }   

  function setupUrlPersistence() {
    const urlInput = document.getElementById('websiteUrl'); // ✅ match the HTML ID
    if (!urlInput) return;
  
    // Restore saved value on load
    const savedUrl = localStorage.getItem('enteredUrl');
    if (savedUrl) {
      urlInput.value = savedUrl;
    }
  
    // Save to localStorage on change
    urlInput.addEventListener('input', () => {
      localStorage.setItem('enteredUrl', urlInput.value.trim());
    });
  }

// API
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
        button.textContent = 'Loading...';
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
    let modal = document.getElementById('dynamicApiModal');
  
    if (!modal) {
      modal = createProgramDataModal();
      document.body.appendChild(modal);
    }
  
    const contentArea = document.getElementById('dynamicApiModalContent');
  
    if (storedApiData.loading) {
      contentArea.innerHTML = renderLoadingMessage();
      return;
    }
  
    if (storedApiData.error) {
      contentArea.innerHTML = renderErrorMessage(storedApiData.error);
      attachRetryButtonHandler(modal);
      return;
    }
  
    let htmlContent = "";
  
    if (storedApiData.mobileDetails) {
      htmlContent += renderDataSection("📱 Mobile Apps", storedApiData.mobileDetails);
    }
  
    if (storedApiData.apiDetails) {
      htmlContent += renderDataSection("🔗 API Endpoints", storedApiData.apiDetails);
    }
  
    if (!storedApiData.mobileDetails && !storedApiData.apiDetails) {
      htmlContent = renderNoDataMessage();
      attachRetryButtonHandler(modal);
    }
  
    contentArea.innerHTML = htmlContent;
}
  
// Top-level helpers
function createProgramDataModal() {
    const modal = document.createElement('div');
    modal.id = 'dynamicApiModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40';
  
    const modalContent = document.createElement('div');
    modalContent.className = 'bg-white rounded-lg shadow-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-auto relative';
  
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-4';
  
    const title = document.createElement('h2');
    title.className = 'text-xl font-semibold text-gray-800';
    title.textContent = 'Program Data';
  
    const closeBtn = document.createElement('button');
    closeBtn.className = 'text-gray-400 hover:text-gray-600 text-2xl font-bold';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => document.body.removeChild(modal);
  
    header.appendChild(title);
    header.appendChild(closeBtn);
  
    const contentArea = document.createElement('div');
    contentArea.id = 'dynamicApiModalContent';
    contentArea.className = 'overflow-auto';
  
    modalContent.appendChild(header);
    modalContent.appendChild(contentArea);
    modal.appendChild(modalContent);
  
    modal.addEventListener('click', (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    });
  
    return modal;
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
  
  function handleLoadApiData() {
    const urlInput = document.getElementById('websiteUrl');
    const enteredUrl = urlInput?.value?.trim() || localStorage.getItem('enteredUrl');
    
    if (!enteredUrl) {
      console.log('ℹ️ No URL entered, skipping API data load');
      return;
    }
  
    loadApiDataInBackground(enteredUrl);
  }
  
  // Register function so it can be used by navigation
  registerLoadApiDataFn(handleLoadApiData);

function showMobileAppsMessage(mobileData) {
  const modal = document.getElementById('messageModal');
  const modalTitle = document.getElementById('messageModalTitle');
  const modalBody = document.getElementById('messageModalBody');
  const closeBtn = document.getElementById('closeMessageModal');

  if (!modal || !modalTitle || !modalBody || !closeBtn) {
    console.error('⚠️ Message modal elements missing');
    return;
  }

  const suggestedApps = mobileData.suggested_apps || [];
  if (suggestedApps.length === 0) {
    modalTitle.textContent = 'Mobile Apps';
    modalBody.textContent = 'No suggested mobile apps found.';
  } else {
    const appList = suggestedApps.map(app =>
      `${app.platform}: ${app.name} (v${app.version || 'unknown'})`
    ).join(' | ');
    modalTitle.textContent = 'Suggested Mobile Apps';
    modalBody.textContent = appList;
  }

  modal.classList.remove('hidden');

  // Close handler
  closeBtn.onclick = () => {
    modal.classList.add('hidden');
  };
}

/**
 * Display the scope text in the Trix editor
 */
function displayScopeText() {
    const finalInput = document.getElementById('final-step-input');
    const finalEditor = document.getElementById('finalScopeContent');
    if (!finalInput || !finalEditor) {
        console.error('Missing Trix editor elements');
        return;
    }

    const savedUrl = localStorage.getItem('enteredUrl') || '(No URL entered)';
    const rewardsBlock = getRewardsTextForScope(rewards);

    const scopeHTML = `
<p><strong>Program URL:</strong> ${savedUrl}</p>
${rewardsBlock}
    `;

    finalInput.value = scopeHTML;
    finalInput.dispatchEvent(new Event('input', { bubbles: true }));
    finalEditor.editor.loadHTML(scopeHTML);

    console.log('✅ Scope text displayed in Trix editor');
}
