import { initializeSteps, registerDisplayScope } from './navigation.js';
import { renderRewardTiers } from './rewards.js';
import { loadApiDataInBackground, storedApiData, checkDomainResolvable, normalizeApiDetails, showApiResultsPopup } from './api.js';
import { displayScopePage, buildPartialScopeTextFromApi, showMessageModal } from './scope.js';

// Data is split into three JSON files:
// - config.json for app settings
// - scope_text.json for program scope
// - rewards.json for bounty tiers
// This keeps responsibilities clear and files easier to maintain.
let config = null;
let scopeText = null;
let rewards = null;

let __didFetchApiDataOnStartup = false;

let typingTimeout = null;
let userHasTyped = false;

// Initialize data button handler
function initDataButton() {
  const dataBtn = document.getElementById('viewDataButton');
  if (!dataBtn) {
    console.error('Data button not found in DOM');
    return;
  }
  
  // Remove any existing listeners
  const newDataBtn = dataBtn.cloneNode(true);
  dataBtn.parentNode.replaceChild(newDataBtn, dataBtn);
  
  // Add click handler
  newDataBtn.addEventListener('click', () => {
    if (!storedApiData) {
      console.warn('No API data available');
      return;
    }
    
    // Show the popup
    if (typeof showApiResultsPopup === 'function') {
      showApiResultsPopup(storedApiData);
    } else {
      console.error('showApiResultsPopup function not found');
    }
  });
  
  return newDataBtn;
}

// Run this once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  
  // Make the shared API data store available globally
  try { 
    window.storedApiData = storedApiData; 
    
    // Initialize data button
    initDataButton();
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }

  // Load all required app config (settings, scope text, rewards)
  loadAppConfig()
    .then(() => {
      //console.log('App config loaded, initializing UI...');
      
      // A) Restore URL first before anything else
      setupUrlPersistence();
      
      // B) Restore cached API data if present
      loadDataFromLocalStorage();
      
      // C) Initialize UI components
      registerDisplayScope(displayScope);
      renderRewardTiers(rewards);
      
      // D) Initialize the wizard steps
      initializeSteps();
      
      // E) If a domain exists and cached API data is missing, preload it 
      fetchApiDataOnStartup();
      
      // --- NEW: react to API lifecycle while on the FINAL step ---
      // Disable/enable FINAL-step controls during background loads
      window.addEventListener('api-loading-started', () => {
        const finalStep = document.getElementById('final-step');
        if (finalStep && !finalStep.classList.contains('hidden')) {
          setLoadingStateForFinalStep(true);
        }
      });

      window.addEventListener('api-loading-finished', () => {
        const finalStep = document.getElementById('final-step');
        if (finalStep && !finalStep.classList.contains('hidden')) {
          setLoadingStateForFinalStep(false);
        }
      });

      // If data updates while viewing FINAL, refresh the rendered scope
      window.addEventListener('api-data-updated', () => {
        const finalStep = document.getElementById('final-step');
        if (finalStep && !finalStep.classList.contains('hidden')) {
          displayScopePage(rewards, scopeText);
        }
      });

      // When FINAL becomes visible, immediately set the busy state based on current loading flags
      window.addEventListener('final-step-shown', () => {
        const busy = !!(window.storedApiData && (window.storedApiData.loading || window.storedApiData.isLoading));
        setLoadingStateForFinalStep(busy);
      });
      // --- END NEW ---

      // D) Set up autosave so scope is saved when the form is closed
      setupScopeAutosave();
    })
    .catch(error => {
      // If initialization fails, log the error for debugging
      console.error('Error initializing app:', error);
    });
});

// Clear DNS warning as user types a URL
document.getElementById('websiteUrl')?.addEventListener('input', () => {
  document.getElementById('urlResolveWarn')?.remove();
});

// Disable/enable controls on the final page while we rebuild the scope.
function setLoadingStateForFinalStep(isLoading) {
  const finalEditor = document.getElementById('finalSummaryContent');
  const generateBtn = document.getElementById('generateProgramButton');
  const viewDataBtn = document.getElementById('viewApiButton');
  // Support both ids in case the template uses "cancelButton" instead of "backButton"
  const backOrCancelBtn = document.getElementById('backButton') || document.getElementById('cancelButton');

  // Disable/enable buttons
  [generateBtn, viewDataBtn, backOrCancelBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.classList.toggle('opacity-50', !!isLoading);
    btn.classList.toggle('cursor-not-allowed', !!isLoading);
  });

  // Optional: show a subtle inline loader on the editor
  if (finalEditor) {
    finalEditor.classList.toggle('pointer-events-none', !!isLoading);
    finalEditor.classList.toggle('opacity-75', !!isLoading);
  }
}

// Small helper so we don’t have to guess page index elsewhere
function isOnFinalStep() {
  const finalStep = document.getElementById('final-step');
  return finalStep && !finalStep.classList.contains('hidden');
}

// ─────────────────────────────────────────────────────────────
// State for URL processing
// ─────────────────────────────────────────────────────────────
let lastProcessedValue = null;
let pendingDomain = null;
let isProcessing = false;
// Cache the last DNS resolvability verdict to avoid repeated checks
let lastCheckedDomain = null;           // domain string last resolved
let lastResolveVerdict = null;          // true | false | null (unknown)

/**
 * Call the background loader, interpret its result, and update the UI.
 * Returns the status string from loadApiDataInBackground.
 */
async function loadAndProcessApiData(domain) {
  const result = await loadApiDataInBackground(domain);

  let shouldRebuild = false;
  switch (result?.status) {
    case 'ok':
      // console.log("✅ Data Retrieval completed without error for", domain);  Message already logged in api.js
      shouldRebuild = true;
      break;
    case 'partial':
      console.warn(`⚠️ Partial API load for ${domain}: ${result.details || ''}`);
      shouldRebuild = true;
      break;
    case 'cached':
      console.log("ℹ️ Using cached API data for", domain);
      shouldRebuild = true;
      break;
    case 'error':
      console.error(`❌ Failed to load API data for ${domain}: ${result.details || ''}`);
      break;
    case 'aborted':
    case 'stale':
        // Superseded by a newer request; do not update lastProcessedValue
        console.log("⏹️ Request superseded; ignoring result for", domain);
        break;
    case 'noop':
    default:
      break;
  }

  if (shouldRebuild) {
    // Rebuild partial (assets) with the new/cached data
    buildPartialScopeTextFromApi();

    // If we're already on the FINAL page, re-render it with the latest
    if (isOnFinalStep()) {
      // No setLoadingStateForFinalStep() here — the fetch busy state is handled
      // by the global api-loading-* listeners you wired in script.js.
      displayScopePage(rewards, scopeText);
    }
  }

  return result?.status || 'noop';
}

/**
 * Validate, normalise and (debounced) process a domain.
 * Keeps re-entrancy safe and only marks domains as processed
 * when the call wasn't superseded/aborted.
 */
async function handleDomainInput(rawInput) {
  const domain = extractDomain((rawInput || '').trim());

  // If the user actually changed the URL, unpin persistent message.
  // Do not clear the element here; the loader/error will update it.
  if (domain && domain !== lastProcessedValue) {
    try {
      if (!window.__apiLoadState) window.__apiLoadState = {};
      window.__apiLoadState.pinned = false;
    } catch {}
    // New domain -> reset DNS cache
    lastCheckedDomain = null;
    lastResolveVerdict = null;
  }

  // If empty, clear any messages and stop early
  if (!domain) {
    hideDomainValidationError();
    document.getElementById('urlResolveWarn')?.remove();
    return;
  }

  if (domain && domain === lastProcessedValue) {
    console.log("⏭ Domain already processed, skipping:", domain);
    return;
  }

  // Queue latest domain if already processing
  if (isProcessing) {
    pendingDomain = domain;
    // Cancel any in-flight background requests for the previous domain
    try { window.__apiLoadState?.mobileCtrl?.abort(); } catch {}
    try { window.__apiLoadState?.apiCtrl?.abort(); } catch {}
    return;
  }

  // ── FORMAT VALIDATION (no network) ──────────────────────────
  if (!isValidDomainOrUrl(domain)) {
    showDomainValidationError();
    document.getElementById('urlResolveWarn')?.remove();
    return;
  }
  hideDomainValidationError();

  // Persist normalised domain so other modules see the same value
  localStorage.setItem('enteredUrl', domain);

  // ── DNS RESOLVABILITY CHECK (gate fetching) ─────────────────
  let allowFetch = true; // default allow
  try {
    if (typeof checkDomainResolvable === 'function') {
      // Use cached verdict if domain hasn't changed since last check
      if (lastCheckedDomain === domain && lastResolveVerdict !== null) {
        allowFetch = (lastResolveVerdict !== false);
        if (lastResolveVerdict === false) {
          document.getElementById('urlResolveWarn')?.remove();
          maybeWarnIfUnresolvable(domain, { resolvable: false });
        }
      } else {
        // Clear any previous DNS warning first and perform a new check
        document.getElementById('urlResolveWarn')?.remove();
        const resolvable = await checkDomainResolvable(domain); // true | false | null (unknown)
        lastCheckedDomain = domain;
        lastResolveVerdict = (resolvable === true) ? true : (resolvable === false ? false : null);
        if (resolvable === false) {
          // Confirmed unresolvable -> show warning but ALLOW fetching
          maybeWarnIfUnresolvable(domain, { resolvable: false });
          allowFetch = true;
        } else if (resolvable === true) {
          allowFetch = true;
        } else {
          // null/unknown -> allow fetch (bypass only because resolver couldn't confirm)
          allowFetch = true;
        }
      }
    }
  } catch (e) {
    // Resolver error -> allow fetch (bypass is allowed only when there is an error)
    console.debug('Resolver check errored; allowing fetch:', e);
    allowFetch = true;
  }
  // ─────────────────────────────────────────────────────────────

  if (!allowFetch) {
    console.log('🚫 Skipping data retrieval due to DNS not resolving.');
    // Mark domain as processed to avoid repeated resolvability checks on blur/input
    lastProcessedValue = domain;
    return;
  }

  isProcessing = true;
  try {
    const status = await loadAndProcessApiData(domain);

    // Only mark as processed if it wasn't superseded/aborted/noop
    if (!['aborted', 'stale', 'noop'].includes(status)) {
      lastProcessedValue = domain;
    }
  } catch (err) {
    console.warn("❌ Exception during API load:", err);
  } finally {
    isProcessing = false;

    // If another domain was queued while this was running, process it now
    if (pendingDomain && pendingDomain !== lastProcessedValue) {
      const next = pendingDomain;
      pendingDomain = null;
      handleDomainInput(next);
    } else {
      pendingDomain = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// URL input listeners (Enter / typing debounce / blur)
// ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const websiteInput = document.getElementById("websiteUrl");
  if (!websiteInput) return;

  // ENTER → validate + process the *raw* value
  websiteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const raw = websiteInput.value; // keep raw for validator
      if (!raw.trim()) { hideDomainValidationError(); return; }
      console.log("⏎ Enter:", raw);
      handleDomainInput(raw); // let handleDomainInput extract/validate
    }
  });

  // TYPING (debounced 500ms) → validate + process
  websiteInput.addEventListener("input", () => {
    if (!userHasTyped) userHasTyped = true;

    // Immediate cancel of any in-flight loads when user changes URL
    try { window.__apiLoadState?.mobileCtrl?.abort(); } catch {}
    try { window.__apiLoadState?.apiCtrl?.abort(); } catch {}
    try {
      if (typeof storedApiData === 'object' && storedApiData) {
        storedApiData.loading = false;
        storedApiData.isLoading = false;
      }
    } catch {}
    // Clear global loading message immediately
    try {
      const el = document.getElementById('dataLoadingStatus');
      if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    } catch {}
    // Restore Generate button label (navigation will handle disabled state)
    try {
      const genBtn = document.getElementById('generateProgramButton');
      if (genBtn) genBtn.innerHTML = 'Generate Program';
    } catch {}

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      const raw = websiteInput.value; // raw for validator
      console.log("⏳ Typing stopped (500ms):", raw);
      if (!raw.trim()) { hideDomainValidationError(); return; }
      // handleDomainInput itself dedupes via lastProcessedValue
      handleDomainInput(raw);
    }, 500);
  });

  // BLUR → validate + process
  websiteInput.addEventListener("blur", () => {
    const raw = websiteInput.value; // raw for validator
    if (!raw.trim()) { hideDomainValidationError(); return; }
    
    const domain = extractDomain(raw);
    // Skip if domain hasn't changed
    if (domain === lastProcessedValue) {
      return;
    }
    
    console.log("🕒 Blur:", raw);
    handleDomainInput(raw);
  });
});

function setUrlEventsMessage(message) {
  const messageEl = document.getElementById("urlEventsMessage");
  messageEl.textContent = message || ""; // Clear if empty
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
    window.scopeText = scopeText;      // ✅ Make globally available
    rewards   = rewardsJson;           // ✅ already flattened
    window.rewards = rewards;          // ✅ Make globally available
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

function maybeWarnIfUnresolvable(domain, result) {
  // Reuse/compose a simple warning element; do not “pretty” it up.
  const inputEl = document.getElementById('websiteUrl');
  if (!inputEl) return;

  // Remove any previous warning
  document.getElementById('urlResolveWarn')?.remove();

  const warn = document.createElement('div');
  warn.id = 'urlResolveWarn';
  warn.className = 'text-amber-600 mt-1 text-sm';
  warn.textContent = `Warning: ${domain} was not found. Any mobile apps or APIs will not be automatically included. You can still select a reward tier and generate the scope.`;

  inputEl.insertAdjacentElement('afterend', warn);

  // Dev breadcrumb only
  console.warn('⚠️ Domain appears unresolvable (frontend warning only):', { domain, result });
}

// Replace your TLD-based validator with this policy-driven one (stricter)
// - Accepts either a full URL or a bare hostname
// - Requires at least one dot (e.g. example.com)
// - Enforces label/TLD rules (letters/digits/hyphen, no leading/trailing hyphen)
// - Keeps the scheme allowlist behavior and the localhost rejection
function isValidDomainOrUrl(input, { allowHttp = false } = {}) {
  try {
    const s = String(input || '').trim();
    if (!s) return false;

    let host = '';

    // Accept bare hostnames like "example.com" or a full URL
    if (/^https?:\/\//i.test(s)) {
      const url = new URL(s);
      // 1) Scheme allowlist
      const scheme = url.protocol.replace(':','').toLowerCase();
      if (!(scheme === 'https' || (allowHttp && scheme === 'http'))) return false;
      host = url.hostname;
    } else {
      // No scheme: treat as a host; reject obvious path/space
      if (/\s/.test(s) || s.includes('/')) return false;
      host = s;
    }

    // Normalise
    host = host.toLowerCase().replace(/^www\./, '');

    // 2) Optional: reject obvious private hosts unless you want them
    if (/\blocal(host)?$/.test(host)) return false;

    // 3) Must not have trailing dot and must contain at least one dot
    if (host.endsWith('.')) return false;
    const labels = host.split('.');
    if (labels.length < 2) return false;

    // 4) TLD sanity: letters only, 2–63 chars
    const tld = labels[labels.length - 1];
    if (!/^[a-z]{2,63}$/i.test(tld)) return false;

    // 5) Label rules: 1–63 chars, letters/digits/hyphen, no leading/trailing hyphen
    const labelRe = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;
    if (!labels.every(l => labelRe.test(l))) return false;

    return true;
  } catch {
    return false;
  }
}

function showDomainValidationError(msg) {
  const el = document.getElementById('urlError');
  if (!el) return;
  el.textContent = msg || 'Please enter a valid domain or website URL (e.g. example.com or https://example.com)';
  el.classList.remove('hidden');
}

function hideDomainValidationError() {
  const el = document.getElementById('urlError');
  if (!el) return;
  el.classList.add('hidden');
}

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
  if (!storedApiData) return;

  const savedDomain = extractDomain((localStorage.getItem('enteredUrl') || '').trim());
  if (!savedDomain) return;

  const blob = readJSONFromLocalStorage(`apiData_${savedDomain}`);
  if (!blob) return;

  storedApiData.mobileDetails = blob.mobileDetails || null;
  storedApiData.apiDetails = blob.apiDetails ? normalizeApiDetails(blob.apiDetails) : null;
  storedApiData.loading = false;
  storedApiData.isLoading = false;

  console.log('♻️ Using cached data', {
    domain: savedDomain,
    mobileDetails: !!storedApiData.mobileDetails,
    apiDetails: !!storedApiData.apiDetails
  });
  
  // Mark domain as processed to prevent redundant processing
  lastProcessedValue = savedDomain;
  
  // Trigger UI update with cached data
  try { window.dispatchEvent(new CustomEvent('api-data-updated')); } catch {}
}

/**
 * Fetch missing API data in the background on startup.
 * This runs if we have a saved domain and there is no cached data yet.
 */
async function fetchApiDataOnStartup() {
  if (__didFetchApiDataOnStartup) return;
  __didFetchApiDataOnStartup = true;

  const raw = (localStorage.getItem('enteredUrl') || '').trim();
  if (!raw) return;

  const domain = extractDomain(raw);
  
  // Check if we have cached data (after loadDataFromLocalStorage has run)
  const hasCachedData = storedApiData.apiDetails || storedApiData.mobileDetails;
  
  if (!hasCachedData) {
    // Only log and validate if we truly don't have cached data
    if (!isValidDomainOrUrl(domain)) {
      console.log('Invalid domain in fetchApiDataOnStartup, skipping fetch:', domain);
      showDomainValidationError();
      return;
    }
    hideDomainValidationError();
  }

  // 2) Determine if any fetch is needed (policy):
  // Mobile: fetch if initial OR previous mobile error
  // API:    fetch if initial OR previous API error
  // We do NOT fetch solely due to missing data.

  // Flags persisted by api.js on failures; cleared on success/no-data
  const mobileLastError = localStorage.getItem(`mobileLastError_${domain}`) === '1';
  const apiLastError    = localStorage.getItem(`apiLastError_${domain}`) === '1';

  // Consider presence of any cached data to detect initial retrieval
  const isInitialRetrieval = !hasCachedData;

  // Respect no-data flags: if backend returned valid "no data", do not fetch
  const noMobileFlag = localStorage.getItem(`noMobileData_${domain}`) === '1';
  const noApiFlag    = localStorage.getItem(`noApiData_${domain}`) === '1';

  const needsMobileData = (isInitialRetrieval || mobileLastError) && !noMobileFlag;
  const needsApiData    = (isInitialRetrieval || apiLastError)    && !noApiFlag;
  
  if (!(needsMobileData || needsApiData)) {
    // No need to fetch anything
    return;
  }

  // 3) DNS check — BLOCK fetch if confirmed unresolvable; allow on error
  let allowFetch = true;
  try {
    if (typeof checkDomainResolvable === 'function') {
      document.getElementById('urlResolveWarn')?.remove();
      const resolvable = await checkDomainResolvable(domain);
      if (resolvable === false) {
        maybeWarnIfUnresolvable(domain, { resolvable: false });
        allowFetch = false;
      } else if (resolvable === true) {
        allowFetch = true;
      } else {
        // unknown -> allow
        allowFetch = true;
      }
    }
  } catch (e) {
    console.debug('Startup resolver error; allowing fetch:', e);
    allowFetch = true;
  }
  if (!allowFetch) return; // do not preload if DNS doesn't resolve

  // 4) Only preload if we actually need data and nothing is in-flight
  if (!storedApiData.loading && !storedApiData.isLoading) {
    // Hint the banner about which sides we plan to fetch
    try { window.showGlobalLoadingMessage && window.showGlobalLoadingMessage({ domain, needsMobile: needsMobileData, needsApi: needsApiData }); } catch {}
    loadAndProcessApiData(domain)
      .then((s) => console.log('🔄 Startup API preload status:', s))
      .catch(err => console.warn('Preload failed (non‑blocking):', err));
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
  //console.log('Setting up URL persistence...');
  const urlInput = document.getElementById('websiteUrl');
  if (!urlInput) {
    console.error('URL input element not found');
    return;
  }

  // Function to save the current URL
  const saveCurrentUrl = (event) => {
    if (event) event.preventDefault();
    
    const value = urlInput.value.trim();
    
    if (value) {
      try {
        const domain = extractDomain(value);
        
        // Check if this domain was already saved to avoid all unnecessary processing
        const currentSaved = localStorage.getItem('enteredUrl');
        if (currentSaved === domain) {
          // Domain hasn't changed, skip all processing
          return;
        }
        
        console.log('Saving URL:', value);
        console.log('Extracted domain:', domain);
        
        localStorage.setItem('enteredUrl', domain);
        console.log('Saved to localStorage');
        
        // Update the input with the normalized value
        if (urlInput.value !== domain) {
          urlInput.value = domain;
        }
        
        // Validate the domain
        if (!isValidDomainOrUrl(domain)) {
          console.log('Invalid domain, showing validation error');
          showDomainValidationError();
        } else {
          hideDomainValidationError();
        }
      } catch (error) {
        console.error('Error saving URL:', error);
      }
    }
  };

  // Restore saved value on load
  const savedUrl = localStorage.getItem('enteredUrl');
  if (savedUrl) {
    console.log('Restoring saved URL:', savedUrl);
    urlInput.value = savedUrl;
    
    // Validate the restored URL
    if (!isValidDomainOrUrl(extractDomain(savedUrl))) {
      console.log('Restored URL is invalid, showing error');
      showDomainValidationError();
    }
  }

  // Save on input (debounced)
  let saveTimeout;
  urlInput.addEventListener('input', (e) => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveCurrentUrl(e), 500);
  });

  // Also save on blur to catch any final input
  urlInput.addEventListener('blur', saveCurrentUrl);
  
  //console.log('URL persistence setup complete');
}

// API
function handleLoadApiData() {
  const urlInput = document.getElementById('websiteUrl');
  const enteredUrl = urlInput?.value?.trim() || localStorage.getItem('enteredUrl');
  if (!enteredUrl) {
    console.log('ℹ️ No URL entered, skipping API data load');
    return;
  }

  const domain = extractDomain(enteredUrl);

  // Handle invalid URLs - just save the URL and show validation error
  if (!isValidDomainOrUrl(domain)) {
    showDomainValidationError();
    // Save the URL to localStorage to persist it
    localStorage.setItem('enteredUrl', domain);
    // Update the input field with the invalid URL
    if (urlInput) {
      urlInput.value = domain;
    }
    return;
  }
  hideDomainValidationError();

  localStorage.setItem('enteredUrl', domain);

  // DNS gate here too for manual Retry
  (async () => {
    let allowFetch = true;
    try {
      if (typeof checkDomainResolvable === 'function') {
        // Use cached verdict if available for same domain
        if (lastCheckedDomain === domain && lastResolveVerdict !== null) {
          allowFetch = (lastResolveVerdict !== false);
          if (lastResolveVerdict === false) {
            document.getElementById('urlResolveWarn')?.remove();
            maybeWarnIfUnresolvable(domain, { resolvable: false });
          }
        } else {
          document.getElementById('urlResolveWarn')?.remove();
          const resolvable = await checkDomainResolvable(domain);
          lastCheckedDomain = domain;
          lastResolveVerdict = (resolvable === true) ? true : (resolvable === false ? false : null);
          if (resolvable === false) {
            maybeWarnIfUnresolvable(domain, { resolvable: false });
            allowFetch = false;
          } else if (resolvable === true) {
            allowFetch = true;
          } else {
            allowFetch = true; // unknown -> allow
          }
        }
      }
    } catch (e) {
      console.debug('Resolver error during manual load; allowing fetch:', e);
      allowFetch = true;
    }
    if (allowFetch) {
      loadAndProcessApiData(domain);
    } else {
      console.log('🚫 Manual load blocked due to DNS not resolving.');
    }
  })();
}
window.handleLoadApiData = handleLoadApiData;

/**
 * Display the Scope page
 */
function displayScope() {
  displayScopePage(rewards, scopeText);
}

/* ================================
   Autosave for final scope content
   ================================ */

// Get the current scope HTML from the final Trix editor
function getFinalScopeHTMLFromEditor() {
  const el = document.getElementById('finalSummaryContent');
  if (!el) return null;
  const html = (el.innerHTML || '').trim();
  return html && html.length ? html : null;
}

// Persist the current final scope HTML if present
function persistFinalScopeHTML() {
  try {
    const html = getFinalScopeHTMLFromEditor();
    if (html) {
      localStorage.setItem('finalScopeHTML', html);
      // Optional mirror to in‑memory store
      if (window.storedApiData) {
        window.storedApiData.finalScopeHTML = html;
      }
      // console.log('[autosave] finalScopeHTML saved');
    }
  } catch (e) {
    console.warn('[autosave] persist failed:', e);
  }
}

// Wire up autosave on page close, tab hide, and editor changes
function setupScopeAutosave() {
  // Save when navigating away or closing
  window.addEventListener('beforeunload', persistFinalScopeHTML);
  window.addEventListener('pagehide', persistFinalScopeHTML);

  // Save when page becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistFinalScopeHTML();
    }
  });

  // Save on any change in the final Trix editor
  document.addEventListener('trix-change', (e) => {
    if (e.target && e.target.id === 'finalSummaryContent') {
      persistFinalScopeHTML();
    }
  });
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
  // 0) Stop any URL debounce/processing and reset flags
  // ─────────────────────────────────────────────────────────────
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  userHasTyped = false;
  lastProcessedValue = null;
  pendingDomain = null;

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
    'partialScopeHTML',
    'finalScopeHTML'
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
      storedApiData.partialScopeHTML = null;   // cached HTML (assets-injected)
      storedApiData.finalScopeHTML = null;     // final cached HTML
      storedApiData.mobileError = null;
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
  // 4) Reset URL entry + validation + buttons (no synthetic events)
  // ─────────────────────────────────────────────────────────────
  const urlInput = document.getElementById('websiteUrl');
  if (urlInput) {
    urlInput.value = ''; // do NOT dispatch 'input'
  }

  // Hide validation error if shown
  if (typeof hideDomainValidationError === 'function') {
    hideDomainValidationError();
  } else {
    document.getElementById('urlError')?.remove();
  }

  // Remove DNS resolution warning, if any
  document.getElementById('urlResolveWarn')?.remove();

  // Disable generate button explicitly
  const generateBtn = document.getElementById('generateProgramButton');
  if (generateBtn) generateBtn.disabled = true;

  // Hide inline loading/retry UI if present
  const loadingEl = document.getElementById('dataLoadingStatus');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    loadingEl.innerHTML = '';
  }

  // Ensure any persistent pin is cleared so loaders/errors don't stick after reset
  try {
    if (!window.__apiLoadState) window.__apiLoadState = {};
    window.__apiLoadState.pinned = false;
  } catch {}

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

  // ─────────────────────────────────────────────────────────────
  // 7) Notify with our standard modal
  // ─────────────────────────────────────────────────────────────
  if (typeof showMessageModal === 'function') {
    showMessageModal('Reset', 'Reset completed successfully.');
  } else {
    alert('Reset completed successfully.'); // fallback
  }
}

// wire up the button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('resetButton')
    ?.addEventListener('click', performReset);
});

export { config };
