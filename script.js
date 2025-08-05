import { renderRewardTiers, getRewardsTextForScope } from './rewards.js';

// Global state
let currentStepIndex = 0;
let steps = [];
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
        initializeSteps();
        setupUrlPersistence(); 
        renderRewardTiers(rewards);
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

/**
 * Initialize the steps array and set up initial state
 */
function initializeSteps() {
  // Get all step elements
  const builderStep = document.getElementById('builderContainer');
  const rewardsStep = document.getElementById('rewards-step');
  const finalStep = document.getElementById('final-step');
  
  // Add steps to the array in the order they should appear
  steps = [builderStep, rewardsStep, finalStep];
  
  // Show the first step
  showStep(currentStepIndex);
  
  // Update the step tracker dots
  updateStepTracker();
}

/**
 * Set up event listeners for navigation buttons
 */
function setupEventListeners() {
  // Next button in the top navigation
  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.addEventListener('click', goToNextStep);
  }
  
  // Next button in the bottom navigation
  const nextButtonBottom = document.getElementById('nextButtonBottom');
  if (nextButtonBottom) {
    nextButtonBottom.addEventListener('click', goToNextStep);
  }
  
  // Back button in the top navigation
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', goToPreviousStep);
  }
  
  // Back button in the bottom navigation
  const backButtonBottom = document.getElementById('backButtonBottom');
  if (backButtonBottom) {
    backButtonBottom.addEventListener('click', goToPreviousStep);
  }
}

/**
 * Show a specific step and hide others
 * @param {number} stepIndex Index of the step to show
 */
function showStep(stepIndex) {
  // Update step visibility
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]) {
      if (i === stepIndex) {
        steps[i].classList.remove('hidden');
      } else {
        steps[i].classList.add('hidden');
      }
    }
  }
  
  // Update current step index
  currentStepIndex = stepIndex;
  
  // Update UI elements
  updateNavigationButtons();
  updateStepTracker();
  updateStepIconsHighlight(stepIndex);
  
  // If we're showing the final scope step, update its content
  if (stepIndex === 2) {
    displayScopeText();
  }
  
  // For debugging
  updateDebugInfo();
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

/**
 * Go to the next step
 */
function goToNextStep() {
  if (currentStepIndex < steps.length - 1) {
    // When going from initial step to rewards step, explicitly manage UI elements
    if (currentStepIndex === 0) {
      // Hide bug image and show step icons when moving from initial to rewards step
      const introImageContainer = document.getElementById('introImageContainer');
      const stepIcons = document.getElementById('stepIcons');
      
      if (introImageContainer) introImageContainer.classList.add('hidden');
      if (stepIcons) stepIcons.classList.remove('hidden');
    }
    
    showStep(currentStepIndex + 1);
  }
}

/**
 * Go to the previous step
 */
function goToPreviousStep() {
  if (currentStepIndex > 0) {
    showStep(currentStepIndex - 1);
  }
}

/**
 * Update the state of navigation buttons based on current step
 */
function updateNavigationButtons() {
  const backButton = document.getElementById('backButton');
  const nextButton = document.getElementById('nextButton');
  const backButtonBottom = document.getElementById('backButtonBottom');
  const nextButtonBottom = document.getElementById('nextButtonBottom');
  
  // Back buttons - always show, but disable and style differently on initial step
  if (backButton) {
    backButton.disabled = (currentStepIndex === 0);
    
    // Change style based on disabled state
    if (currentStepIndex === 0) {
      backButton.classList.remove('bg-blue-200', 'hover:bg-blue-300');
      backButton.classList.add('bg-gray-300', 'text-gray-500');
    } else {
      backButton.classList.add('bg-blue-200', 'hover:bg-blue-300');
      backButton.classList.remove('bg-gray-300', 'text-gray-500');
    }
  }
  
  if (backButtonBottom) {
    backButtonBottom.disabled = (currentStepIndex === 0);
    
    // Change style based on disabled state
    if (currentStepIndex === 0) {
      backButtonBottom.classList.remove('bg-blue-200', 'hover:bg-blue-300');
      backButtonBottom.classList.add('bg-gray-300', 'text-gray-500');
    } else {
      backButtonBottom.classList.add('bg-blue-200', 'hover:bg-blue-300');
      backButtonBottom.classList.remove('bg-gray-300', 'text-gray-500');
    }
  }
  
  // Next buttons - always show, but disable on the last step
  if (nextButton) {
    nextButton.disabled = (currentStepIndex === steps.length - 1);
    
    // Change style based on disabled state
    if (currentStepIndex === steps.length - 1) {
      nextButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
      nextButton.classList.add('bg-gray-300', 'text-gray-500');
    } else {
      nextButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
      nextButton.classList.remove('bg-gray-300', 'text-gray-500');
    }
  }
  
  if (nextButtonBottom) {
    // Disable the button if it's the last step
    nextButtonBottom.disabled = (currentStepIndex === steps.length - 1);
    
    // Change style based on disabled state
    if (currentStepIndex === steps.length - 1) {
      nextButtonBottom.classList.remove('bg-blue-500', 'hover:bg-blue-600');
      nextButtonBottom.classList.add('bg-gray-300', 'text-gray-500');
    } else {
      nextButtonBottom.classList.add('bg-blue-500', 'hover:bg-blue-600');
      nextButtonBottom.classList.remove('bg-gray-300', 'text-gray-500');
    }
  }
}

/**
 * Update UI elements for the current step
 */
function updateStepTracker() {
    const introImageContainer = document.getElementById('introImageContainer');
    const stepIcons = document.getElementById('stepIcons');
  
    // On initial step: show bug image, hide icons
    if (currentStepIndex === 0) {
      if (introImageContainer) {
        introImageContainer.classList.remove('hidden');
      }
      if (stepIcons) {
        stepIcons.classList.add('hidden');
      }
    } else {
      // On rewards/scope steps: hide bug image, show icons
      if (introImageContainer) {
        introImageContainer.classList.add('hidden');
      }
      if (stepIcons) {
        stepIcons.classList.remove('hidden');
      }
    }
  }  

/**
 * Highlight the appropriate step icon based on current step
 * @param {number} stepIndex Index of the current step
 */
function updateStepIconsHighlight(stepIndex) {
  const rewardsIcon = document.getElementById('rewardsIcon');
  const scopeIcon = document.getElementById('scopeIcon');
  const rewardsLabel = document.getElementById('rewardsLabel');
  const scopeLabel = document.getElementById('scopeLabel');
  
  if (rewardsIcon && scopeIcon) {
    // Clear all highlights first
    rewardsIcon.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
    scopeIcon.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
    
    // Reset label font weights
    if (rewardsLabel) {
      rewardsLabel.classList.remove('font-bold');
      rewardsLabel.classList.add('font-normal');
    }
    
    if (scopeLabel) {
      scopeLabel.classList.remove('font-bold');
      scopeLabel.classList.add('font-normal');
    }
    
    // Add highlight for rewards step (step index 1)
    if (stepIndex === 1) {
      rewardsIcon.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      if (rewardsLabel) {
        rewardsLabel.classList.remove('font-normal');
        rewardsLabel.classList.add('font-bold');
      }
    }
    // Add highlight for scope step (step index 2)
    else if (stepIndex === 2) {
      scopeIcon.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      if (scopeLabel) {
        scopeLabel.classList.remove('font-normal');
        scopeLabel.classList.add('font-bold');
      }
    }
  }
}

/**
 * Update debug information
 */
function updateDebugInfo() {
  const currentStepIndexDisplay = document.getElementById('currentStepIndexDisplay');
  const stepList = document.getElementById('stepList');
  
  if (currentStepIndexDisplay) {
    currentStepIndexDisplay.textContent = currentStepIndex.toString();
  }
  
  if (stepList) {
    stepList.innerHTML = '';
    steps.forEach((step, index) => {
      const li = document.createElement('li');
      li.textContent = `Step ${index}: ${step.id || 'unnamed'} ${index === currentStepIndex ? '(active)' : ''}`;
      stepList.appendChild(li);
    });
  }
}