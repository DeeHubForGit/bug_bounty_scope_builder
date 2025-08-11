import { initializeSteps, setupEventListeners, registerLoadApiDataFn, registerDisplayScopeText } from './navigation.js';
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

function replaceBlockByMarker(existingHTML, sectionName, replacementBlock) {
  const startMarker = `--START ${sectionName.toUpperCase()}--`;
  const endMarker = `--END ${sectionName.toUpperCase()}--`;

  const startIndex = existingHTML.indexOf(startMarker);
  const endIndex = existingHTML.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    console.warn(`⚠️ Missing markers for "${sectionName}"`);
    return existingHTML;
  }

  const before = existingHTML.slice(0, startIndex).trimEnd();
  const after = existingHTML.slice(endIndex + endMarker.length).trimStart();

  return `${before}${replacementBlock}${after}`;
}

/**
 * Display the scope text in the Trix editor
 */
function displayScopeText() {
  const finalInput  = document.getElementById('final-step-input');
  const finalEditor = document.getElementById('finalScopeContent');
  if (!finalInput || !finalEditor || !finalEditor.editor) {
    console.error('Missing Trix editor elements');
    return;
  }

  const savedUrl = (localStorage.getItem('enteredUrl') || '').trim();
  const programUrlHTML = `<p><strong>Program URL:</strong> ${savedUrl || '(No URL entered)'}</p>`;

  // 1) Base template from JSON
  const templateHTML = getScopeTextFromJSON();

  // 2) Build rewards block (includes START/END markers) and ensure header is on a new line
  let rewardsBlock = getRewardsTextForScope(rewards);

  // 3) Inject rewards into the template at the marker
  let scopeHTML = replaceBlockByMarker(templateHTML, 'REWARDS', rewardsBlock);

  // 4) Append Program URL after the template
  scopeHTML = `${scopeHTML}\n${programUrlHTML}`;

  // 5) Render
  finalInput.value = scopeHTML;
  finalInput.dispatchEvent(new Event('input', { bubbles: true }));
  finalEditor.editor.loadHTML(scopeHTML);

  console.log('✅ Scope text displayed in Trix editor (rewards injected with line break)');
}

function clearMemoryForNewUserTest() {
  localStorage.removeItem('enteredUrl');

  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('apiData_')) localStorage.removeItem(key);
  });

  localStorage.removeItem('selectedRewardTier');
  ['formState','sectionSelections','sectionCounts','currentStepIndex'].forEach(k => localStorage.removeItem(k));

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