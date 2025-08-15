// navigation.js — minimal two-step navigator
const StepIndex = Object.freeze({
  BUILDER: 0,
  FINAL: 1,
});

// Global state
let currentStepIndex = 0;
let steps = [];

// Callback registered from script.js
let displayScopeTextFn = null;
function registerDisplayScopeText(fn) { displayScopeTextFn = fn; }

/**
 * Initialize the two steps and show initial state.
 */
function initializeSteps() {
  const builderStep = document.getElementById('builderContainer');
  const finalStep   = document.getElementById('final-step');

  steps = [builderStep, finalStep];

  // Wire Back button to go to the Builder (first) page
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.onclick = goToBuilder;
  }

  // Wire Back button to go to the Builder (first) page
  const generateButton = document.getElementById('generateProgramButton');
  if (generateButton) {
    generateButton.onclick = goToScope;
  }
  
  // Restore saved step if valid; else show first step
  const saved = localStorage.getItem('currentStepIndex');
  const savedIdx = Number.parseInt(saved, 10);
  const hasValidSaved =
    Number.isInteger(savedIdx) &&
    savedIdx >= 0 &&
    savedIdx < steps.length &&
    !!steps[savedIdx];

  showStep(hasValidSaved ? savedIdx : StepIndex.BUILDER);
}

/**
 * Show a specific step and hide others.
 */
function showStep(stepIndex) {
  if (stepIndex === currentStepIndex) return; // no-op if already showing

  // Toggle step visibility
  for (let i = 0; i < steps.length; i++) {
    const el = steps[i];
    if (!el) continue;
    if (i === stepIndex) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  currentStepIndex = stepIndex;
  localStorage.setItem('currentStepIndex', stepIndex);

  // If we're showing the final scope step, render its content
  if (stepIndex === StepIndex.FINAL && typeof displayScopeTextFn === 'function') {
    displayScopeTextFn();
  }

  // Show/hide the Data button on the Builder page
  const dataBtn = document.getElementById('viewDataButton');
  if (dataBtn) {
    const showButton = window.config?.showApiDataButton; // same config flag
    if (stepIndex === StepIndex.BUILDER && showButton) {
      dataBtn.classList.remove('hidden');
    } else {
      dataBtn.classList.add('hidden');
    }
  }

  // Hide "Generate Program" button on Scope step
  const genBtn = document.getElementById('generateProgramButton');
  if (genBtn) {
    genBtn.classList.toggle('hidden', stepIndex === StepIndex.FINAL);
  }

  // Show Back button on FINAL, hide on BUILDER
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.classList.toggle('hidden', stepIndex === StepIndex.BUILDER);
  }
}

/**
 * Public: go straight to the Scope (FINAL) screen.
 */
function goToScope() {
  if (currentStepIndex !== StepIndex.FINAL) {
    showStep(StepIndex.FINAL);
  }
}

/**
 * Public: go straight to the Builder (first) screen.
 */
function goToBuilder() {
  if (currentStepIndex !== StepIndex.BUILDER) {
    showStep(StepIndex.BUILDER);
  }
}

export {
  StepIndex,
  initializeSteps,
  showStep,
  goToScope,
  goToBuilder,
  registerDisplayScopeText
};
