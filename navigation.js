const StepIndex = Object.freeze({
  BUILDER: 0,
  FINAL: 1
});  

// Global state
let currentStepIndex = 0;
let steps = [];

// Callback registered from script.js
let loadApiDataFn = null;
function registerLoadApiDataFn(fn) { loadApiDataFn = fn; }

// Callback registered from script.js
let displayScopeTextFn = null;
function registerDisplayScopeText(fn) { displayScopeTextFn = fn; }

/**
 * Initialize the steps array and set up initial state
 */
function initializeSteps() {
  // Get all step elements
  const builderStep = document.getElementById('builderContainer');
  const finalStep = document.getElementById('final-step');
  
  // Two pages: Page 1 (URL + Rewards), Page 2 (Final)
  steps = [builderStep, finalStep];
  
  // Restore saved step if available, else show first step
  const savedStep = localStorage.getItem('currentStepIndex');
  if (savedStep !== null && steps[parseInt(savedStep, 10)]) {
    showStep(parseInt(savedStep, 10));
  } else {
    showStep(currentStepIndex);
  }
  
  // Update the step tracker
  updateStepTracker();
}

/**
 * Set up event listeners for navigation buttons
 */
function setupEventListeners() {
  
  // Back button in the top navigation
  const backButton = document.getElementById('backButton');
  if (backButton) backButton.addEventListener('click', goToPreviousStep);
  
}

/**
 * Show a specific step and hide others
 * @param {number} stepIndex Index of the step to show
 */
function showStep(stepIndex) {
  // Update step visibility
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]) {
      if (i === stepIndex) steps[i].classList.remove('hidden');
      else steps[i].classList.add('hidden');
    }
  }
  
  // Update current step index
  currentStepIndex = stepIndex;

  // Save current step index
  localStorage.setItem('currentStepIndex', stepIndex);
  
  // Update UI elements
  updateNavigationButtons();
  updateStepTracker();
  updateStepIconsHighlight(stepIndex);
  
  // If we're showing the final scope step, update its content
  if (stepIndex === StepIndex.FINAL && typeof displayScopeTextFn === 'function') {
    displayScopeTextFn(); // 🔑 call the registered function
  }
  
  // Show or hide the API Data button on Page 1 (URL + Rewards)
  const apiButton = document.getElementById('viewApiButton');
  if (apiButton) {
    const showButtonInConfig = window.config?.showApiDataButton;
    if (stepIndex === StepIndex.BUILDER && showButtonInConfig) {
      apiButton.classList.remove('hidden');
    } else {
      apiButton.classList.add('hidden');
    }
  }

  // Hide "Generate Program" button on Scope step
  const genBtn = document.getElementById('generateProgramButton');
  if (genBtn) {
    if (stepIndex === StepIndex.FINAL) {
      genBtn.classList.add('hidden');
    } else {
      genBtn.classList.remove('hidden');
    }
  }

  // For debugging
  updateDebugInfo();
}

/**
 * Go to the next step
 */
function goToNextStep() {
  if (currentStepIndex < steps.length - 1) {
    // When going from Page 1 (URL + Rewards) to Final, manage UI elements
    if (currentStepIndex === StepIndex.BUILDER) {
      // Show step icons when moving forward
      const stepIcons = document.getElementById('stepIcons');
      if (stepIcons) stepIcons.classList.remove('hidden');

      // Trigger registered background loader on first transition
      if (typeof loadApiDataFn === 'function') {
        loadApiDataFn();
      }
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
  
  // Back buttons - always show, but disable and style differently on initial step
  if (backButton) {
    backButton.disabled = (currentStepIndex === StepIndex.BUILDER);
    if (currentStepIndex === StepIndex.BUILDER) {
      backButton.classList.remove('bg-blue-200', 'hover:bg-blue-300');
      backButton.classList.add('bg-gray-300', 'text-gray-500');
    } else {
      backButton.classList.add('bg-blue-200', 'hover:bg-blue-300');
      backButton.classList.remove('bg-gray-300', 'text-gray-500');
    }
  }
  
}

/**
 * Update UI elements for the current step
 */
function updateStepTracker() {
  const stepIcons = document.getElementById('stepIcons');

  // On initial step: hide icons
  if (currentStepIndex === StepIndex.BUILDER) {
    if (stepIcons) stepIcons.classList.add('hidden');
  } else {
    // On final step: show icons
    if (stepIcons) stepIcons.classList.remove('hidden');
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
    
    // Page 1 (BUILDER) → highlight Rewards
    if (stepIndex === StepIndex.BUILDER) {
      rewardsIcon.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      if (rewardsLabel) {
        rewardsLabel.classList.remove('font-normal');
        rewardsLabel.classList.add('font-bold');
      }
    }
    // Page 2 (FINAL) → highlight Scope
    else if (stepIndex === StepIndex.FINAL) {
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

export { 
  initializeSteps,
  setupEventListeners,
  showStep,
  goToNextStep,
  goToPreviousStep,
  updateNavigationButtons,
  updateStepTracker,
  updateStepIconsHighlight,
  updateDebugInfo,
  registerDisplayScopeText,
  registerLoadApiDataFn
};
