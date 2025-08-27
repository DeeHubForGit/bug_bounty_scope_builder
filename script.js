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
  // Make the shared API data store available globally for modules that read window.storedApiData
  // (e.g., scope.js uses window.storedApiData inside displayScopePage/builders)
  try { window.storedApiData = storedApiData; } catch (_) {}
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
      // Restore URL first so initial sync in initializeSteps sees it
      setupUrlPersistence();
      initializeSteps();

      // D) Set up autosave so scope is saved when the form is closed
      setupScopeAutosave();
    })
    .catch(error => {
      // If initialization fails, log the error for debugging
      console.error('Error initializing app:', error);
    });
});

document.getElementById('websiteUrl')?.addEventListener('input', () => {
  document.getElementById('urlResolveWarn')?.remove();
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

  // If the user actually changed the URL, unpin persistent message.
  // Do not clear the element here; the loader/error will update it.
  if (domain && domain !== lastProcessedValue) {
    try {
      if (!window.__apiLoadState) window.__apiLoadState = {};
      window.__apiLoadState.pinned = false;
    } catch {}
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
      // Clear any previous DNS warning first
      document.getElementById('urlResolveWarn')?.remove();

      const resolvable = await checkDomainResolvable(domain); // true | false | null (unknown)
      if (resolvable === false) {
        // Confirmed unresolvable -> show warning and BLOCK fetching
        maybeWarnIfUnresolvable(domain, { resolvable: false });
        allowFetch = false;
      } else if (resolvable === true) {
        allowFetch = true;
      } else {
        // null/unknown -> allow fetch (bypass only because resolver couldn't confirm)
        allowFetch = true;
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
async function fetchApiDataOnStartup() {
  if (__didFetchApiDataOnStartup) return;
  __didFetchApiDataOnStartup = true;

  const raw = (localStorage.getItem('enteredUrl') || '').trim();
  if (!raw) return;

  const domain = extractDomain(raw);

  // 1) Validate saved value; scrub if bad
  if (!isValidDomainOrUrl(domain)) {
    localStorage.removeItem('enteredUrl');
    hideDomainValidationError();        // nothing to validate yet
    document.getElementById('urlResolveWarn')?.remove();
    return;
  }
  hideDomainValidationError();

  // 2) DNS check — BLOCK fetch if confirmed unresolvable; allow on error
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

  // 3) Only preload if we actually need data and nothing is in-flight
  const needsMobileData = !storedApiData.mobileDetails;
  const needsApiData    = !storedApiData.apiDetails;
  if ((needsMobileData || needsApiData) && !storedApiData.loading && !storedApiData.isLoading) {
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

  // ✅ Validate here too
  if (!isValidDomainOrUrl(domain)) {
    showDomainValidationError();
    return;
  }
  hideDomainValidationError();

  localStorage.setItem('enteredUrl', domain);

  // DNS gate here too for manual Retry
  (async () => {
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
          allowFetch = true; // unknown -> allow
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
