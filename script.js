import { initializeSteps, setupEventListeners, registerLoadApiDataFn, registerDisplayScopeText, goToNextStep } from './navigation.js';
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

      // B) If a domain exists and cached API data is missing, preload it
      fetchApiDataOnStartup();

      // C) Initialise UI
      registerDisplayScopeText(displayScopeText);
      renderRewardTiers(rewards);
      initializeSteps();
      setupUrlPersistence();
      setupEventListeners();

      // D) Setup "Generate Program" button (footer button)
      const genBtn = document.getElementById('generateProgramButton');
      const urlInput = document.getElementById('websiteUrl');

      if (genBtn && urlInput) {
        const syncState = () => {
          genBtn.disabled = !urlInput.value.trim();
        };
        urlInput.addEventListener('input', syncState);
        setTimeout(syncState, 50);  // small delay to wait for localStorage restore

        genBtn.addEventListener('click', () => {
          goToNextStep();
        });
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

    console.log('✅ Data loaded:', { scopeText, rewards, config });
    return { scopeText, rewards, config };

  } catch (error) {
    console.error('❌ Error loading app data:', error);
    throw error;
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

// Register function so it can be used by navigation
registerLoadApiDataFn(handleLoadApiData);

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
 * Display the scope text in the Trix editor (with Assets + Rewards injected)
 */
function displayScopeText() {
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
}

// Attach a 📋 Copy button to the *final scope* Trix editor toolbar
function addCopyButton() {
  const editor = document.getElementById('finalSummaryContent');
  if (!editor) {
    console.warn('[addCopyButton] No editor found yet');
    return;
  }

  const toolbar = editor.toolbarElement;
  if (!toolbar) {
    console.warn('[addCopyButton] No toolbar found yet');
    return;
  }

  const fileGroup = toolbar.querySelector('[data-trix-button-group="file-tools"]');
  if (!fileGroup) {
    console.warn('[addCopyButton] No file-tools group found');
    return;
  }

  // remove any old copy-button so we don't double-up
  const old = fileGroup.querySelector('#copyButton');
  if (old) old.remove();

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.id        = 'copyButton';
  btn.title     = 'Copy to Clipboard';
  btn.className = 'trix-button copy-button';
  btn.innerHTML = '📋 Copy';
  btn.addEventListener('click', copyFinalSummary);

  fileGroup.appendChild(btn);
  console.log('[addCopyButton] Copy button added');
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

function clearMemoryForNewUserTest() {
  localStorage.removeItem('enteredUrl');

  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('apiData_')) localStorage.removeItem(key);
  });

  localStorage.removeItem('selectedRewardTier');
  ['formState','sectionSelections','sectionCounts','currentStepIndex'].forEach(k => localStorage.removeItem(k));
  
  clearRewardsSelection();  // Ensures no default is selected

  // reset in-memory store exported from api.js
  storedApiData.apiDetails = null;
  storedApiData.mobileDetails = null;
  storedApiData.error = null;
  storedApiData.loading = false;
  storedApiData.isLoading = false;

  const urlInput = document.getElementById('websiteUrl');
  if (urlInput) urlInput.value = '';

  alert('🧹 Cleared! Simulating first-time user experience.');
}

// wire up the button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('clearMemoryBtn')
    ?.addEventListener('click', clearMemoryForNewUserTest);
});

export { config };