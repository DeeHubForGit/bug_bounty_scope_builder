import { initializeSteps, registerDisplayScopeText, goToScope } from './navigation.js';
import { renderRewardTiers, getRewardsTextForScope } from './rewards.js';
import { loadApiDataInBackground, storedApiData } from './api.js';

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
      registerDisplayScopeText(displayScopeText);
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
      showDomainValidationError();  // ⛔ new helper function
      return;
    }

    hideDomainValidationError();
    loadApiDataInBackground(domain)
      .then(() => console.log("✅ API data successfully loaded for", domain))
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

function getScopeTextFromJSON() {
  if (!Array.isArray(scopeText)) {
      console.error('❌ scopeText is not loaded or not an array');
      return '';
  }

  let html = '';

  scopeText.forEach(block => {
      if (block.type === 'paragraph') {
          html += `<p>${block.text}</p>`;
      } else if (block.type === 'list' && Array.isArray(block.items)) {
          html += '<ul>';
          block.items.forEach(item => {
              html += `<li>${item}</li>`;
          });
          html += '</ul>';
      }
  });

  return html.trim();
}

/**
 * Helper: Format the website URL in the same format as manual mode
 */
function formatWebsiteDataForSummary(domain) {
  if (!domain) return '';
  const lines = ['🌐 WEBSITE'];
  lines.push(`<strong>URL:</strong> ${domain}`);
  return `<div class="mb-2">${lines.join('<br>')}</div>`;
}

/**
 * Helper: Format mobile app data in the same format as manual mode
 */
function formatMobileDataForSummary(mobileDetails) {
  if (!mobileDetails) return '';
  
  // Array to collect all mobile app entries
  const appEntries = [];
  
  // Process main app - use suggested app(s) if available
  if (Array.isArray(mobileDetails.suggested_apps) && mobileDetails.suggested_apps.length > 0) {
    const appName = mobileDetails.suggested_name || mobileDetails.suggested_apps[0].name;
    let hasIOS = false;
    let hasAndroid = false;
    
    // Process iOS platform
    const iosApp = mobileDetails.suggested_apps.find(app => app.platform === 'iOS');
    if (iosApp) {
      hasIOS = true;
      const lines = ['📱MOBILE APP'];
      lines.push(`<strong>App Name:</strong> ${appName}`);
      lines.push(`<strong>Platform:</strong> Apple: ${iosApp.url}`);
      lines.push(`<strong>Version:</strong> Current`);
      appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
    }
    
    // Process Android platform
    const androidApp = mobileDetails.suggested_apps.find(app => app.platform === 'Android');
    if (androidApp) {
      hasAndroid = true;
      const lines = ['📱MOBILE APP'];
      lines.push(`<strong>App Name:</strong> ${appName}`);
      lines.push(`<strong>Platform:</strong> Android: ${androidApp.url}`);
      lines.push(`<strong>Version:</strong> Current`);
      appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
    }
    
    // If no platforms were found, create a generic entry
    if (!hasIOS && !hasAndroid && mobileDetails.suggested_apps.length > 0) {
      const lines = ['📱MOBILE APP'];
      lines.push(`<strong>App Name:</strong> ${appName}`);
      lines.push(`<strong>Version:</strong> Current`);
      appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
    }
  }
  
  // Process alternative apps
  if (mobileDetails.alternatives) {
    // Process iOS alternatives
    if (Array.isArray(mobileDetails.alternatives.iOS)) {
      mobileDetails.alternatives.iOS.forEach(app => {
        const lines = ['📱MOBILE APP'];
        lines.push(`<strong>App Name:</strong> ${app.name}`);
        lines.push(`<strong>Platform:</strong> Apple: ${app.url}`);
        lines.push(`<strong>Version:</strong> Current`);
        appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
      });
    }
    
    // Process Android alternatives
    if (Array.isArray(mobileDetails.alternatives.Android)) {
      mobileDetails.alternatives.Android.forEach(app => {
        const lines = ['📱MOBILE APP'];
        lines.push(`<strong>App Name:</strong> ${app.name}`);
        lines.push(`<strong>Platform:</strong> Android: ${app.url}`);
        lines.push(`<strong>Version:</strong> Current`);
        appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
      });
    }
  }
  
  // Use the same spacing approach as extractSectionHTML
  return appEntries
    .map((entry, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + entry : entry))
    .join('');
}

/**
 * Helper: format the stored API data in the same format as manual mode
 * "🧩API" HTML snippet
 */
function formatApiDataForSummary(apiData) {
  if (!apiData) return '';
  
  // Check if there's any meaningful API data
  const hasApiUrl = apiData.suggestedApi || (Array.isArray(apiData.apiUrls) && apiData.apiUrls.length > 0);
  const hasDocUrl = Array.isArray(apiData.documentationUrls) && apiData.documentationUrls.length > 0;
  
  // If no meaningful API data exists, return empty string to prevent showing just the heading
  if (!hasApiUrl && !hasDocUrl) {
    return '';
  }
  
  const lines = ['🧩API'];

  if (apiData.suggestedApi) {
    lines.push(`<strong>URL:</strong> ${apiData.suggestedApi}`);
  } else if (Array.isArray(apiData.apiUrls) && apiData.apiUrls.length) {
    lines.push(`<strong>URL:</strong> ${apiData.apiUrls[0]}`);
  }
  
  if (Array.isArray(apiData.documentationUrls) && apiData.documentationUrls.length) {
    lines.push(`<strong>Documentation:</strong> ${apiData.documentationUrls[0]}`);
  }

  return `<div class="mb-2">${lines.join('<br>')}</div>`;
}

// Build the In‑Scope Assets block for the Scope editor
function buildAssetsBlockForScope() {
  // Use the same URL you already store for scope
  const domain = (localStorage.getItem('enteredUrl') || '').trim();

  // Reuse your existing helpers (from your “old code”)
  const websitesHTML = domain ? formatWebsiteDataForSummary(domain) : '';
  const mobilesHTML  = formatMobileDataForSummary(storedApiData.mobileDetails);
  const apisHTML     = formatApiDataForSummary(storedApiData.apiDetails);

  // Mirror spacing logic used elsewhere
  const sections = [];
  if (websitesHTML) sections.push(websitesHTML);
  if (mobilesHTML)  sections.push(mobilesHTML);
  if (apisHTML)     sections.push(apisHTML);

  const assetsContent = sections
    .map((block, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + block : block))
    .join('');

  return [
    '--START IN-SCOPE--',
    '<p><strong>In-Scope Assets</strong></p>',
    assetsContent,
    '\n--END IN-SCOPE--'
  ].join('');
}

function replaceBlockByMarker(existingHTML, sectionName, replacementBlock) {
  const name = sectionName.toUpperCase();
  const start = `--START ${name}--`;
  const end   = `--END ${name}--`;

  // Match the marker block, optionally wrapped in a single <p> ... </p>
  const pattern = new RegExp(
    `(?:<p>)?\\s*${start}[\\s\\S]*?${end}\\s*(?:</p>)?`,
    'i'
  );

  if (!pattern.test(existingHTML)) {
    console.warn(`⚠️ Missing markers for "${sectionName}"`);
    return existingHTML;
  }

  return existingHTML.replace(pattern, replacementBlock);
}

/**
 * Build partial scope text using API result (Assets injected only).
 * Saves result in memory and localStorage but does not render it.
 */
function buildPartialScopeTextFromApi() {
  // Validate scopeText from stored API data
  const rawScopeText = storedApiData?.scopeText;
  if (!rawScopeText || !Array.isArray(rawScopeText) || rawScopeText.length === 0) {
    console.warn('⚠️ No valid scope text returned from API');
    return;
  }

  // 1) Join API scope array into template HTML
  const templateHTML = rawScopeText.join('\n').trim();

  // 2) Build the Assets block
  const assetsBlock = buildAssetsBlockForScope();

  // 3) Inject only the asset block (do not touch rewards)
  const partialScopeHTML = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);

  // 4) Save in memory
  storedApiData.partialScopeHTML = partialScopeHTML;

  // 5) Save in localStorage for persistence
  localStorage.setItem('partialScopeHTML', partialScopeHTML);

  console.log('✅ Partial scope text saved in memory and localStorage (not rendered yet)');
}

function loadPartialScopeFromStorage() {
  const saved = localStorage.getItem('partialScopeHTML');
  if (saved) {
    storedApiData.partialScopeHTML = saved;
    console.log('✅ Loaded partial scope from localStorage');
  }
}

/**
 * Return the final Scope HTML by combining:
 * - the saved partial scope (scope + assets) from memory/localStorage
 * - the current rewards block
 *
 * Falls back carefully if partial not found yet.
 */
function getFinalScopeHTML() {
  // 1) Ensure we have the most recent partial scope in memory
  if (!storedApiData?.partialScopeHTML) {
    loadPartialScopeFromStorage();
  }

  // 2) Establish a base HTML that already includes IN‑SCOPE (assets)
  let baseWithAssets = (storedApiData && storedApiData.partialScopeHTML) || '';

  // If not available yet, try building it now from what we have
  if (!baseWithAssets) {
    // Try to build from API-provided scope text (array of template lines)
    const rawScopeText = storedApiData?.scopeText;
    if (rawScopeText && Array.isArray(rawScopeText) && rawScopeText.length > 0) {
      const templateHTML = rawScopeText.join('\n').trim();
      const assetsBlock  = buildAssetsBlockForScope();
      baseWithAssets     = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
    } else {
      // Final fallback: use local JSON template helper
      const templateHTML = getScopeTextFromJSON();
      const assetsBlock  = buildAssetsBlockForScope();
      baseWithAssets     = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
    }
  }

  // 3) Build rewards block using your existing helper (expects global `rewards`)
  const rewardsBlock = getRewardsTextForScope(rewards);

  // 4) Inject rewards into the template
  const finalHTML = replaceBlockByMarker(baseWithAssets, 'REWARDS', rewardsBlock).trim();

  return finalHTML;
}

/**
 * Display the final Scope (scope + assets + rewards) in the Trix editor.
 * John’s step 8: “Add the rewards section to the template and show the finished product on the next page.”
 */
function displayScopeText() {
  const finalInput  = document.getElementById('final-step-input');
  const finalEditor = document.getElementById('finalSummaryContent');

  if (!finalInput || !finalEditor || !finalEditor.editor) {
    console.error('❌ Missing Trix editor elements: #final-step-input and/or #finalSummaryContent');
    return;
  }

  // Wire the Copy button once (safe to call repeatedly)
  ensureCopyButtonOnce();

  // Build the finished product
  const scopeHTML = getFinalScopeHTML();

  // Render into Trix (keep both value + loadHTML for consistency with your existing pattern)
  finalInput.value = scopeHTML;
  finalInput.dispatchEvent(new Event('input', { bubbles: true }));
  finalEditor.editor.loadHTML(scopeHTML);

  console.log('✅ Finished scope displayed in Trix (scope + assets from memory + rewards).');
}

/**
 * OLD: Display the scope text in the Trix editor (with Assets + Rewards injected)
 */
/* function displayScopeText() {
  const finalInput  = document.getElementById('final-step-input');
  const finalEditor = document.getElementById('finalSummaryContent');
  if (!finalInput || !finalEditor || !finalEditor.editor) {
    console.error('Missing Trix editor elements');
    return;
  }
  // TEMP: Add the copy button in here.  This will be restructured.
  addCopyButton();

  // 1) Base template from JSON
  const templateHTML = getScopeTextFromJSON();

  // 2) Build blocks
  const assetsBlock  = buildAssetsBlockForScope();
  const rewardsBlock = getRewardsTextForScope(rewards); // already has <br> after START marker

  // 3) Inject into template markers
  let scopeHTML = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
  scopeHTML     = replaceBlockByMarker(scopeHTML,   'REWARDS',  rewardsBlock);

  // (No extra Program URL line here to avoid duplicate URL; it’s inside In‑Scope → WEBSITE)

  // 4) Render
  finalInput.value = scopeHTML;
  finalInput.dispatchEvent(new Event('input', { bubbles: true }));
  finalEditor.editor.loadHTML(scopeHTML);

  console.log('✅ Scope text displayed in Trix editor (assets + rewards injected)');
}*/

// Attach a 📋 Copy button to the *final scope* Trix editor toolbar
// Idempotent: attach a 📋 Copy button to the final Trix toolbar once.
function ensureCopyButtonOnce() {
  const editor = document.getElementById('finalSummaryContent');
  if (!editor || !editor.toolbarElement) return;

  // Already wired? bail.
  if (editor.dataset.copyButtonWired === '1') return;

  const fileGroup = editor.toolbarElement.querySelector('[data-trix-button-group="file-tools"]');
  if (!fileGroup) return;

  // If a copy button exists (e.g., after a hot reload), mark and exit
  if (fileGroup.querySelector('#copyButton')) {
    editor.dataset.copyButtonWired = '1';
    return;
  }

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.id        = 'copyButton';
  btn.title     = 'Copy to Clipboard';
  btn.className = 'trix-button copy-button';
  btn.textContent = '📋 Copy';
  btn.addEventListener('click', copyFinalSummary);

  fileGroup.appendChild(btn);
  editor.dataset.copyButtonWired = '1';
  console.log('[copy] Copy button wired');
}

function showMessageModal(title, message) {
  const modal = document.getElementById('messageModal');
  const titleEl = document.getElementById('messageModalTitle');
  const bodyEl = document.getElementById('messageModalBody');
  const closeBtn = document.getElementById('closeMessageModal');

  titleEl.textContent = title || 'Notice';
  bodyEl.textContent = message || '';
  modal.classList.remove('hidden');

  closeBtn.onclick = () => {
    modal.classList.add('hidden');
  };
}

// Copy button 
function copyFinalSummary() {
  const content = document.getElementById('finalSummaryContent'); 
  if (!content) return;

  // Get the rendered HTML
  let html = content.innerHTML;

  // Strip visible markers
  html = html.replace(/--START [\w-]+--/g, '');
  html = html.replace(/--END [\w-]+--/g, '');

  // Use a temp element to select and copy the cleaned HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  document.body.appendChild(tempDiv);

  const range = document.createRange();
  range.selectNodeContents(tempDiv);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    document.execCommand('copy');
    if (typeof showMessageModal === 'function') {
      showMessageModal("Copied!", "Formatted content copied to clipboard.");
    }
  } catch (err) {
    console.error('Copy failed:', err);
  }

  document.body.removeChild(tempDiv);
  window.getSelection().removeAllRanges();
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