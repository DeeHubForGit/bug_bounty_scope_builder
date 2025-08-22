import { initializeSteps, registerDisplayScope } from './navigation.js';
import { renderRewardTiers } from './rewards.js';
import { loadApiDataInBackground, storedApiData, checkDomainResolvable } from './api.js';
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

// Run this once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Load all required app config (settings, scope text, rewards)
  // before setting up the wizard interface
  loadAppConfig()
    .then(() => {
      // A) Restore cached API data if present
      loadDataFromLocalStorage();

      // B) If a domain exists and cached API data is missing, preload it 
      fetchApiDataOnStartup();
      
      // C) Initialise UI
      registerDisplayScope(displayScope);
      renderRewardTiers(rewards);
      initializeSteps();
      setupUrlPersistence();

      // D) Setup "Generate Program" button (footer button)
      const genBtn = document.getElementById('generateProgramButton');
      const urlInput = document.getElementById('websiteUrl');

      if (genBtn && urlInput) {
        // Set initial state based on existing value (from localStorage restore)
        genBtn.disabled = !urlInput.value.trim();

        // Update state as user types
        urlInput.addEventListener('input', () => {
          genBtn.disabled = !urlInput.value.trim();
        });
      }

      // E) Set up autosave so scope is saved when the form is closed
      setupScopeAutosave();
    })
    .catch(error => {
      // If initialization fails, log the error for debugging
      console.error('Error initializing app:', error);
    });
});

// ─────────────────────────────────────────────────────────────
// State for URL processing
// ─────────────────────────────────────────────────────────────
let lastProcessedValue = null;
let pendingDomain = null;
let isProcessing = false;

/**
 * Call the background loader, interpret its result, and update the UI.
 * Returns the status string from loadApiDataInBackground.
 */
async function loadAndProcessApiData(domain) {
  const result = await loadApiDataInBackground(domain);

  switch (result?.status) {
    case 'ok':
      console.log("✅ API data successfully loaded for", domain);
      buildPartialScopeTextFromApi();
      break;

    case 'partial':
      console.warn(`⚠️ Partial API load for ${domain}: ${result.details || ''}`);
      // Still build partial scope so the user sees whatever we have
      buildPartialScopeTextFromApi();
      break;

    case 'cached':
      console.log("ℹ️ Using cached API data for", domain);
      buildPartialScopeTextFromApi();
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
      // Nothing to do
      break;
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

  if (domain && domain === lastProcessedValue) {
    console.log("⏭ Domain already processed, skipping:", domain);
    return;
  }

  // Queue latest domain if already processing
  if (isProcessing) {
    pendingDomain = domain;
    return;
  }

  // Validate BEFORE proceeding
  if (!isValidDomainOrUrl(domain)) {
    showDomainValidationError();
    return;
  }
  hideDomainValidationError();

  // Persist normalised domain so other modules see the same value
  localStorage.setItem('enteredUrl', domain);

  // ── Best‑effort DNS resolvability check (non‑blocking for UX) ──
  try {
    if (typeof checkDomainResolvable === 'function') {
      const res = await checkDomainResolvable(domain, { timeoutMs: 5000 });
      // Clear any previous warning first
      document.getElementById('urlResolveWarn')?.remove();

      if (!res?.error && res?.resolvable === false) {
        // Show a soft warning but continue as normal
        maybeWarnIfUnresolvable(domain, res);
      }
      // If it errored (e.g., API not reachable on GitHub Pages), we silently continue.
    }
  } catch (e) {
    // Don’t block on resolver issues
    console.debug('Resolver check skipped (unreachable or blocked):', e);
  }
  // ─────────────────────────────────────────────────────────────

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

  websiteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const domain = extractDomain(websiteInput.value.trim());
      console.log("⏎ Enter:", domain);
      if (domain !== lastProcessedValue) {
        handleDomainInput(domain);
      }
    }
  });

  websiteInput.addEventListener("input", () => {
    if (!userHasTyped) userHasTyped = true;

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      const domain = extractDomain(websiteInput.value.trim());
      console.log("⏳ Typing stopped (300ms):", domain);
      if (userHasTyped && domain && domain !== lastProcessedValue) {
        handleDomainInput(domain);
      }
    }, 300);
  });

  websiteInput.addEventListener("blur", () => {
    const domain = extractDomain(websiteInput.value.trim());
    console.log("🕒 Blur:", domain);
    if (domain && domain !== lastProcessedValue) {
      handleDomainInput(domain);
    }
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
  warn.textContent = `Warning: ${domain} did not resolve via DNS. You can continue, but results may be limited.`;

  inputEl.insertAdjacentElement('afterend', warn);

  // Dev breadcrumb only
  console.warn('⚠️ Domain appears unresolvable (frontend warning only):', { domain, result });
}

// Replace your TLD-based validator with this policy-driven one
function isValidDomainOrUrl(input, { allowHttp = false } = {}) {
  try {
    const s = String(input || '').trim();
    // Accept bare hostnames like "example.com" by prefixing a scheme
    const url = new URL(s.includes('://') ? s : `https://${s}`);

    // 1) Scheme allowlist
    const scheme = url.protocol.replace(':','').toLowerCase();
    if (!(scheme === 'https' || (allowHttp && scheme === 'http'))) return false;

    // 2) Host must exist and be a valid domain/IDN/punycode (URL() enforces syntax)
    if (!url.hostname) return false;

    // 3) Optional: reject obvious private hosts unless you want them
    if (/\blocal(host)?$/.test(url.hostname)) return false;

    // No TLD allowlist — TLDs change and PSL exists for registrable checks
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
  storedApiData.apiDetails    = blob.apiDetails || null;
  storedApiData.loading = false;
  storedApiData.isLoading = false;

  console.log('♻️ Loaded cached API data', {
    domain: savedDomain,
    mobileDetails: !!storedApiData.mobileDetails,
    apiDetails: !!storedApiData.apiDetails
  });
}

/**
 * Fetch missing API data in the background on startup.
 * This runs if we have a saved domain and there is no cached data yet.
 */
function fetchApiDataOnStartup() {
  if (__didFetchApiDataOnStartup) return;
  __didFetchApiDataOnStartup = true;

  const raw = (localStorage.getItem('enteredUrl') || '').trim();
  if (!raw) return;

  const domain = extractDomain(raw);
  const needsMobileData = !storedApiData.mobileDetails;
  const needsApiData = !storedApiData.apiDetails;

  if ((needsMobileData || needsApiData) && !storedApiData.loading) {
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
  const urlInput = document.getElementById('websiteUrl');
  if (!urlInput) return;

  // Restore saved value on load (already normalised if we saved it that way)
  const savedUrl = localStorage.getItem('enteredUrl');
  if (savedUrl) {
    urlInput.value = savedUrl;
    // Do NOT dispatch 'input' here — it causes unintended loading
    // urlInput.dispatchEvent(new Event('input')); // ✅ Only trigger if restoring
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
  const domain = extractDomain(enteredUrl);
  localStorage.setItem('enteredUrl', domain);
  loadAndProcessApiData(domain);
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

  // Disable buttons explicitly
  const generateBtn = document.getElementById('generateProgramButton');
  if (generateBtn) generateBtn.disabled = true;

  const viewDataBtn = document.getElementById('viewDataButton');
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
