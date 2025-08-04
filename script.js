// Global state
let currentStepIndex = 0;
let steps = [];
let rewardsData = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  // Load the rewards data first
  loadRewardsData()
    .then(() => {
      // Then initialize steps and render reward tiers
      initializeSteps();
      renderRewardTiers();
      
      // Set up event listeners
      setupEventListeners();
    })
    .catch(error => {
      console.error('Error loading rewards data:', error);
    });
});

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
    // Don't force visibility here, let updateNavigationButtons handle it
    // nextButton.classList.remove('hidden');
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
  
  // Auto start button removed - using top nav buttons instead
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
  
  // If we're showing the final summary step, update its content
  if (stepIndex === 2) {
    updateFinalSummary();
  }
  
  // For debugging
  updateDebugInfo();
}

/**
 * Updates the final summary step with program scope content
 */
function updateFinalSummary() {
  const inputEl = document.getElementById('final-step-input');
  const trixEditorEl = document.querySelector('trix-editor[input="final-step-input"]');
  if (!inputEl || !trixEditorEl) return;

  // Get the URL from the input field
  const urlInput = document.getElementById('url');
  const url = urlInput ? urlInput.value : '';

  // Make sure we have the template data
  if (!rewardsData || !rewardsData.template) {
    console.error('Template data not loaded');
    return;
  }

  // Use the template from the JSON file
  const template = [...rewardsData.template];

  // Find the in-scope marker and inject the URL
  let inScopeIndex = template.findIndex(item => 
    item.type === 'paragraph' && 
    item.text && 
    item.text.includes('--START IN-SCOPE--')
  );

  if (inScopeIndex !== -1) {
    // Insert URL after the in-scope marker
    template.splice(inScopeIndex + 1, 0, 
      { type: 'paragraph', text: '🌐 WEBSITE' },
      { type: 'paragraph', text: `URL: ${url}` }
    );
  }

  // Find the rewards section marker and inject rewards content
  const rewardsBlockText = buildRewardsBlock();
  const rewardsMarkerIndex = template.findIndex(item => 
    item.type === 'paragraph' && 
    item.text && 
    item.text.includes('--START REWARDS--')
  );

  if (rewardsMarkerIndex !== -1) {
    // Insert rewards info after the rewards marker
    template.splice(rewardsMarkerIndex + 1, 0, 
      { type: 'paragraph', text: '<strong>Rewards</strong>' },
      { type: 'paragraph', text: 'We offer bounties based on the severity and impact of the vulnerability:' },
      { type: 'paragraph', text: getRewardsDescription() }
    );
  }

  // Render the template
  let fullHTML = renderTemplate(template);

  // Push into the Trix editor
  inputEl.value = fullHTML;
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  trixEditorEl.editor.loadHTML(fullHTML);
}

/**
 * Renders a template array into HTML
 * @param {Array} template Array of template blocks
 * @returns {string} HTML string
 */
function renderTemplate(template) {
  let html = '';

  template.forEach(block => {
    if (block.type === 'paragraph') {
      const text = block.text || '';
      
      // Avoid wrapping paragraphs that already contain markers or full tags
      if (
        text.includes('<!--') ||
        text.trim().startsWith('<p') ||
        text.trim().startsWith('<div')
      ) {
        html += text;
      } else {
        html += `<p>${text}</p>`;
      }
    }

    if (block.type === 'list') {
      html += '<ul class="bullet-list">';
      block.items.forEach(item => {
        html += `<li>${item}</li>`;
      });
      html += '</ul>';
    }
  });

  return html;
}

/**
 * Builds the rewards block HTML
 * @returns {string} Formatted rewards block with markers
 */
function buildRewardsBlock() {
  // Check if a reward tier has been selected
  const selectedTier = localStorage.getItem('selectedRewardTier');
  
  // If no reward tier selected, return empty rewards section
  if (!selectedTier || !rewardsData || !rewardsData.rewards || !rewardsData.rewards.tiers) {
    return '--START REWARDS--<p><strong>Rewards</strong></p><p>Please select a reward tier to define your bounty structure.</p>--END REWARDS--';
  }
  
  // Start building the rewards HTML
  const sentence = 'We offer bounties based on the severity and impact of the vulnerability:';
  const intro = `<p><strong>Rewards</strong></p><p>${sentence}</p><br>`;
  
  // Get the rewards description
  const rewardsDescription = getRewardsDescription();
  
  return `--START REWARDS--${intro}${rewardsDescription}--END REWARDS--`;
}

/**
 * Gets the rewards description from the selected reward tier
 * @returns {string} HTML string with rewards description
 */
function getRewardsDescription() {
  // Get the selected reward tier
  const selectedTier = localStorage.getItem('selectedRewardTier');
  
  if (!selectedTier || !rewardsData || !rewardsData.rewards || !rewardsData.rewards.tiers) {
    return 'Please select a reward tier to define your bounty structure.';
  }
  
  const tier = rewardsData.rewards.tiers[selectedTier];
  if (!tier) {
    return 'Please select a reward tier to define your bounty structure.';
  }
  
  // Format rewards based on the selected tier
  let html = '';
  
  // Add tier name and description
  html += `<strong>${tier.name}</strong><br>`;
  html += `<p>${tier.description}</p><br>`;
  
  // Add severity levels
  if (tier.levels) {
    html += '<ul>';
    tier.levels.forEach(level => {
      html += `<li><strong>${level.name}: ${level.range}</strong> - ${level.description}</li>`;
    });
    html += '</ul>';
  }
  
  // Add note
  html += '<p class="text-sm italic mt-2"><strong>Note:</strong> These ranges reflect industry averages across all severity levels. Actual bounties should be tailored to your organization\'s specific security needs, risk profile, and budget.</p>';
  
  return html;
}

/**
 * Load rewards data and template from bug-bounty-document-template.json
 * @returns {Promise} Promise resolving with the data
 */
async function loadRewardsData() {
  try {
    const response = await fetch('bug-bounty-document-template.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const templateData = await response.json();
    // Store the full template data, not just rewards
    rewardsData = templateData;
    console.log('Template data loaded:', rewardsData);
    return rewardsData;
  } catch (error) {
    console.error('Error loading rewards data:', error);
    throw error;
  }
}

/**
 * Render reward tiers based on the loaded data
 */
function renderRewardTiers() {
  const rewardTierCards = document.getElementById('rewardTierCards');
  if (!rewardTierCards || !rewardsData || !rewardsData.rewards || !rewardsData.rewards.tiers) {
    console.error('Cannot render reward tiers: missing elements or data');
    return;
  }
  
  const tiers = rewardsData.rewards.tiers;
  
  const tierHTML = Object.entries(tiers).map(([key, tier]) => {
    const levels = tier.levels;
    
    const levelList = Object.entries(levels)
      .filter(([_, val]) => val && val.trim() !== "")
      .map(([severity, amount]) => {
        const label = severity.charAt(0).toUpperCase() + severity.slice(1);
        return `<li>${label}: ${amount}</li>`;
      }).join('');
    
    return `
      <label class="reward-tier-card block border rounded-md p-4 mb-4 cursor-pointer transition-all duration-200" data-tier="${key}">
        <div class="flex items-start gap-3">
          <input type="radio" name="rewardTier" value="${key}" class="mt-1">
          <div class="w-full">
            <strong class="text-gray-800 text-base">${tier.title}</strong>
            <div class="mt-2 flex flex-col md:flex-row gap-4">
              <ul class="list-disc list-inside text-sm text-gray-700 md:basis-[35%] md:shrink-0">
                ${levelList}
              </ul>
              <p class="text-sm text-gray-600 md:basis-[65%]">
                <strong>What to Expect:</strong> ${tier.description}
              </p>
            </div>
          </div>
        </div>
      </label>
    `;
  }).join('');
  
  rewardTierCards.innerHTML = tierHTML;
  
  // Add event listeners to reward tier cards
  setupRewardTierListeners();
}

/**
 * Set up event listeners for reward tier selection
 */
function setupRewardTierListeners() {
  const rewardTierCards = document.querySelectorAll('.reward-tier-card');
  const rewardDetails = document.getElementById('rewardDetails');
  
  rewardTierCards.forEach(card => {
    const radioInput = card.querySelector('input[type="radio"]');
    
    card.addEventListener('click', () => {
      // Clear all selections
      rewardTierCards.forEach(c => {
        c.classList.remove('border-blue-500', 'bg-blue-50');
      });
      
      // Select this card
      radioInput.checked = true;
      card.classList.add('border-blue-500', 'bg-blue-50');
      
      // Show reward details if needed
      const tierKey = card.getAttribute('data-tier');
      if (rewardDetails && tierKey && rewardsData.rewards.tiers[tierKey]) {
        const tier = rewardsData.rewards.tiers[tierKey];
        rewardDetails.innerHTML = `<strong>Selected:</strong> ${tier.title}`;
        rewardDetails.style.display = 'block';
      }
    });
  });
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
 * Update the step tracker dots and manage step UI elements
 */
function updateStepTracker() {
  const stepTracker = document.getElementById('stepTracker');
  const introImageContainer = document.getElementById('introImageContainer');
  const stepIcons = document.getElementById('stepIcons');
  
  if (!stepTracker) return;
  
  // Always keep step tracker hidden - we're not showing dots anymore
  stepTracker.classList.add('hidden');
  
  // Manage UI elements based on the current step
  if (currentStepIndex === 0) {
    // On initial step: show bug image, hide icons
    if (introImageContainer) {
      introImageContainer.classList.remove('hidden');
    }
    if (stepIcons) {
      stepIcons.classList.add('hidden');
    }
    return; // Exit early
  } else {
    // On other steps: hide bug image, show icons
    if (introImageContainer) {
      introImageContainer.classList.add('hidden');
    }
    if (stepIcons) {
      stepIcons.classList.remove('hidden');
    }
  }
  
  // Clear existing dots
  stepTracker.innerHTML = '';
  
  // Create a dot for each step
  steps.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.className = 'step-dot w-3 h-3 rounded-full transition-colors duration-300';
    
    // Add active class to current step dot
    if (index === currentStepIndex) {
      dot.classList.add('bg-blue-500');
    } else {
      dot.classList.add('bg-gray-300');
    }
    
    // Add click event to navigate to this step
    dot.addEventListener('click', () => showStep(index));
    
    stepTracker.appendChild(dot);
  });
}

/**
 * Highlight the appropriate step icon based on current step
 * @param {number} stepIndex Index of the current step
 */
function updateStepIconsHighlight(stepIndex) {
  const rewardsIcon = document.getElementById('rewardsIcon');
  const summaryIcon = document.getElementById('summaryIcon');
  const rewardsLabel = document.getElementById('rewardsLabel');
  const summaryLabel = document.getElementById('summaryLabel');
  
  if (rewardsIcon && summaryIcon) {
    // Clear all highlights first
    rewardsIcon.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
    summaryIcon.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
    
    // Reset label font weights
    if (rewardsLabel) {
      rewardsLabel.classList.remove('font-bold');
      rewardsLabel.classList.add('font-normal');
    }
    
    if (summaryLabel) {
      summaryLabel.classList.remove('font-bold');
      summaryLabel.classList.add('font-normal');
    }
    
    // Add highlight for rewards step (step index 1)
    if (stepIndex === 1) {
      rewardsIcon.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      if (rewardsLabel) {
        rewardsLabel.classList.remove('font-normal');
        rewardsLabel.classList.add('font-bold');
      }
    }
    // Add highlight for summary step (step index 2)
    else if (stepIndex === 2) {
      summaryIcon.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      if (summaryLabel) {
        summaryLabel.classList.remove('font-normal');
        summaryLabel.classList.add('font-bold');
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