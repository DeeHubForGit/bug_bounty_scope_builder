import { initializeSteps, setupEventListeners, registerDisplayScopeText, registerFetchMobileApps } from './navigation.js';
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

  function fetchAndDisplayMobileApps() {
    const urlInput = document.getElementById('websiteUrl');
    const enteredUrl = urlInput?.value?.trim() || localStorage.getItem('enteredUrl');
  
    if (!enteredUrl) {
      console.log('ℹ️ No URL entered, skipping mobile apps fetch');
      return;
    }
  
    fetchMobileAppDetailsForDomain(enteredUrl)
      .then(mobileData => {
        if (mobileData && mobileData.suggested_apps) {
          showMobileAppsMessage(mobileData);
        } else {
          console.log('ℹ️ No mobile app data found for domain:', enteredUrl);
        }
      })
      .catch(err => {
        console.error('❌ Error fetching mobile apps:', err);
      });
  }  

  registerFetchMobileApps(fetchAndDisplayMobileApps);

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
