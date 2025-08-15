import { initializeSteps, registerDisplayScope, goToScope } from './navigation.js';
import { renderRewardTiers } from './rewards.js';
import { loadApiDataInBackground, storedApiData } from './api.js';
import { displayScopePage, buildPartialScopeTextFromApi } from './scope.js';

// Data is split into three JSON files:
// - config.json for app settings
// - scope_text.json for program scope
// - rewards.json for bounty tiers
// This keeps responsibilities clear and files easier to maintain.
let config = null;
let scopeText = null;
let rewards = null;

let __didFetchApiDataOnStartup = false;

// Run this once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Load all required app config (settings, scope text, rewards)
  // before setting up the wizard interface
  loadAppConfig()
    .then(() => {
      // A) Restore cached API data if present
      loadDataFromLocalStorage();

      // B) If a domain exists and cached API data is missing, preload it  TO DO Remove later if needed
      //fetchApiDataOnStartup();

      // C) Initialise UI
      registerDisplayScope(displayScope);
      renderRewardTiers(rewards);
      initializeSteps();
      setupUrlPersistence();

      // D) Setup "Generate Program" button (footer button)
      const genBtn = document.getElementById('generateProgramButton');
      const urlInput = document.getElementById('websiteUrl');

      if (genBtn && urlInput) {
        const syncState = () => {
          genBtn.disabled = !urlInput.value.trim();
        };
        urlInput.addEventListener('input', syncState);
        setTimeout(syncState, 50);  // small delay to wait for localStorage restore
      }
    })
    .catch(error => {
      // If initialization fails, log the error for debugging
      console.error('Error initializing app:', error);
    });
});

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
    window.scopeText = scopeText;      // ✅ Make globally available
    rewards   = rewardsJson;           // ✅ already flattened
    config    = configJson;            // ✅ already flattened
    window.config = config;            // ✅ Expose config globally for use in other modules

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

    console.log('✅ Scope, rewards & config loaded:', { scopeText, rewards, config });
    return { scopeText, rewards, config };

  } catch (error) {
    console.error('❌ Error loading app data:', error);
    throw error;
  }
}  

const websiteUrlInput = document.getElementById('websiteUrl');
const generateButton = document.getElementById('generateProgramButton');

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const validTlds = new Set([
  'com', 'net', 'org', 'gov', 'edu', 'info', 'biz',
  'io', 'co', 'dev', 'app', 'au', 'uk', 'us', 'ca', 'de', 'fr', 'jp', 'cn', 'in', 'nz'
]);

function isValidDomainOrUrl(input) {
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    const hostname = url.hostname;
    const parts = hostname.split('.');
    if (parts.length < 2) return false;

    const tld = parts[parts.length - 1].toLowerCase();
    if (!validTlds.has(tld)) return false;

    for (const part of parts) {
      if (!/^[a-zA-Z0-9-]{1,63}$/.test(part)) return false;
      if (part.startsWith('-') || part.endsWith('-')) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function showDomainValidationError() {
  let errorEl = document.getElementById('urlError');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.id = 'urlError';
    errorEl.className = 'text-red-600 mt-1 text-sm';
    errorEl.textContent = 'Please enter a valid domain or website URL (e.g. example.com or https://example.com)';
    const inputEl = document.getElementById('websiteUrl');
    inputEl.insertAdjacentElement('afterend', errorEl);
  }
}

function hideDomainValidationError() {
  const errorEl = document.getElementById('urlError');
  if (errorEl) {
    errorEl.remove();
  }
}

document.getElementById('websiteUrl').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    const domain = this.value.trim();

    if (!isValidDomainOrUrl(domain)) {
      showDomainValidationError(); 
      return;
    }

    hideDomainValidationError();
    loadApiDataInBackground(domain)
      .then(() => {
        console.log("✅ API data successfully loaded for", domain);
        buildPartialScopeTextFromApi(); 
      })
      .catch(err => console.warn("❌ Failed to load API data:", err));
  }
});

/**
 * Read and parse a JSON object from localStorage.
 * Returns null if the key does not exist or parsing fails.
 */
function readJSONFromLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Load any stored API data from localStorage into storedApiData.
 * This restores cached mobile app details and API details from previous runs.
 */
function loadDataFromLocalStorage() {
  if (!window.storedApiData) return;

  let mobileDetails = null;
  let apiDetails = null;

  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('apiData_')) continue;
    const value = readJSONFromLocalStorage(key);
    if (!value) continue;

    const lowerKey = key.toLowerCase();
    if (!mobileDetails && (lowerKey.includes('mobile') || lowerKey.includes('mobiledetails'))) {
      mobileDetails = value;
    }
    if (!apiDetails && (lowerKey.includes('api') || lowerKey.includes('apidetails'))) {
      apiDetails = value;
    }
  }

  if (mobileDetails) storedApiData.mobileDetails = mobileDetails;
  if (apiDetails) storedApiData.apiDetails = apiDetails;

  // Reset loading flags
  storedApiData.loading = false;
  storedApiData.isLoading = false;

  if (mobileDetails || apiDetails) {
    console.log('♻️ Loaded API data from localStorage', {
      mobileDetails: !!mobileDetails,
      apiDetails: !!apiDetails
    });
  }
}

/**
 * Fetch missing API data in the background on startup.
 * This runs if we have a saved domain and there is no cached data yet.
 */
function fetchApiDataOnStartup() {
  if (__didFetchApiDataOnStartup) return;              // guard
  __didFetchApiDataOnStartup = true;

  const raw = (localStorage.getItem('enteredUrl') || '').trim();
  if (!raw) return;

  const domain = extractDomain(raw);  // <- normalise here
  const needsMobileData = !storedApiData.mobileDetails;
  const needsApiData = !storedApiData.apiDetails;

  if ((needsMobileData || needsApiData) && !storedApiData.loading) {
    loadApiDataInBackground(domain)
      .then(() => console.log('🔄 Preloaded API data on startup'))
      .catch(err => console.warn('Preload failed (non-blocking):', err));
  }
}

function extractDomain(input) {
  try {
    let hostname;

    if (input.startsWith('http://') || input.startsWith('https://')) {
      hostname = new URL(input).hostname;
    } else {
      hostname = input.replace(/^https?:\/\//, '').split('/')[0];
    }

    // Lowercase and strip leading www.
    return hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return (input || '').trim().toLowerCase().replace(/^www\./, '');
  }
}

function setupUrlPersistence() {
  const urlInput = document.getElementById('websiteUrl');
  if (!urlInput) return;

  // Restore saved value on load (already normalised if we saved it that way)
  const savedUrl = localStorage.getItem('enteredUrl');
  if (savedUrl) {
    urlInput.value = savedUrl;
    urlInput.dispatchEvent(new Event('input')); // ✅ Only trigger if restoring
  }

  // Save normalised value on change
  urlInput.addEventListener('input', () => {
    const normalised = extractDomain(urlInput.value);
    localStorage.setItem('enteredUrl', normalised);
  });
}

// API
function handleLoadApiData() {
  const urlInput = document.getElementById('websiteUrl');
  const enteredUrl = urlInput?.value?.trim() || localStorage.getItem('enteredUrl');
  if (!enteredUrl) {
    console.log('ℹ️ No URL entered, skipping API data load');
    return;
  }

  const domain = extractDomain(enteredUrl);  // <- normalise here too
  // Persist the normalised value so Scope/Assets use the same
  localStorage.setItem('enteredUrl', domain);

  loadApiDataInBackground(domain);
}

/**
 * Display the Scope page
 */
function displayScope() {
  displayScopePage(rewards, scopeText);
}

function clearRewardsSelection() {
  const rewardTierCards = document.querySelectorAll('.reward-tier-card');

  rewardTierCards.forEach(card => {
    const radioInput = card.querySelector('input[type="radio"]');
    if (radioInput) radioInput.checked = false;

    card.classList.remove('border-blue-500', 'bg-blue-50');
  });

  localStorage.removeItem('selectedRewardTier');
}

function performReset() {
  // ─────────────────────────────────────────────────────────────
  // 1) Clear localStorage keys used by the current app
  // ─────────────────────────────────────────────────────────────
  const keysToRemove = [
    'enteredUrl',
    'formState',
    'sectionSelections',
    'sectionCounts',
    'currentStepIndex',
    'selectedRewardTier',
    'partialScopeHTML'
  ];
  keysToRemove.forEach(k => localStorage.removeItem(k));

  // Remove any cached API payloads
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('apiData_')) localStorage.removeItem(key);
  });

  // ─────────────────────────────────────────────────────────────
  // 2) Reset in‑memory API store (from api.js)
  // ─────────────────────────────────────────────────────────────
  try {
    if (typeof storedApiData !== 'undefined' && storedApiData) {
      storedApiData.mobileDetails = null;
      storedApiData.apiDetails = null;
      storedApiData.scopeText = null;          // if populated by API
      storedApiData.partialScopeHTML = null;   // our cached HTML
      storedApiData.mobileError = null;        // clear per-call errors
      storedApiData.apiError = null;
      storedApiData.error = null;
      storedApiData.loading = false;
      storedApiData.isLoading = false;
    }
  } catch (_) {}

  // Reset the one-shot startup fetch guard so tests behave like first run
  try {
    if (typeof __didFetchApiDataOnStartup !== 'undefined') {
      __didFetchApiDataOnStartup = false;
    }
  } catch (_) {}

  // ─────────────────────────────────────────────────────────────
  // 3) Reset Rewards UI
  // ─────────────────────────────────────────────────────────────
  if (typeof clearRewardsSelection === 'function') {
    clearRewardsSelection();
  }
  const rewardDetailsEl = document.getElementById('rewardDetails');
  if (rewardDetailsEl) rewardDetailsEl.innerHTML = '';

  // ─────────────────────────────────────────────────────────────
  // 4) Reset URL entry + validation + buttons
  // ─────────────────────────────────────────────────────────────
  const urlInput = document.getElementById('websiteUrl');
  if (urlInput) {
    urlInput.value = '';
    // trigger any listeners that sync button state (Generate disabled, etc.)
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // hide validation error if shown
  if (typeof hideDomainValidationError === 'function') {
    hideDomainValidationError();
  } else {
    document.getElementById('urlError')?.remove();
  }

  // Explicitly disable Generate until a URL is entered
  const genBtn = document.getElementById('generateProgramButton');
  if (genBtn) genBtn.disabled = true;

  // Best-effort: disable/clear any Data button if present
  const viewDataBtn = document.getElementById('viewDataButton'); // ← updated id
  if (viewDataBtn) viewDataBtn.disabled = true;

  // Hide inline loading/retry UI if present
  const loadingEl = document.getElementById('dataLoadingStatus');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    loadingEl.innerHTML = '';
  }

  // Close Program Data modal if open
  const dataModal = document.getElementById('programDataModal');
  if (dataModal) dataModal.classList.add('hidden');

  // ─────────────────────────────────────────────────────────────
  // 5) Clear the final Trix editor/output
  // ─────────────────────────────────────────────────────────────
  const finalInput  = document.getElementById('final-step-input');
  const finalEditor = document.getElementById('finalSummaryContent');
  if (finalInput) finalInput.value = '';
  if (finalEditor && finalEditor.editor) {
    finalEditor.editor.loadHTML('');
  }

  // Remove Copy button and clear the wired flag (so we can add it once later)
  if (finalEditor) {
    if (finalEditor.toolbarElement) {
      finalEditor.toolbarElement
        .querySelector('[data-trix-button-group="file-tools"] #copyButton')
        ?.remove();
    }
    finalEditor.dataset.copyButtonWired = '0';
  }

  // ─────────────────────────────────────────────────────────────
  // 6) Reset wizard UI back to first page
  // ─────────────────────────────────────────────────────────────
  if (typeof initializeSteps === 'function') {
    initializeSteps();
  }

  alert('Reset completed successfully.');
}

// wire up the button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('resetButton')
    ?.addEventListener('click', performReset);
});

export { config };