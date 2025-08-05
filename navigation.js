// Global state
let currentStepIndex = 0;
let steps = [];

// Callback registered from script.js
let displayScopeTextFn = null;

function registerDisplayScopeText(fn) {
  displayScopeTextFn = fn;
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
    
    // Update the step tracker
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
    if (stepIndex === 2 && typeof displayScopeTextFn === 'function') {
        displayScopeTextFn(); // 🔑 call the registered function
    }
    
    // For debugging
    updateDebugInfo();
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
    registerDisplayScopeText
  };
  