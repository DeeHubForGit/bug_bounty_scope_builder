import { initializeSteps, setupEventListeners, registerLoadApiDataFn, registerDisplayScopeText } from './navigation.js';
import { renderRewardTiers, getRewardsTextForScope } from './rewards.js';
import { loadApiDataInBackground } from './api.js';

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
