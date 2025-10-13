// navigation.js — minimal two-step navigator (clean helpers)

const StepIndex = Object.freeze({
  BUILDER: 0,
  FINAL: 1,
});

// Global state
let currentStepIndex = 0;
let steps = [];

// Callback registered from script.js
let displayScopeFn = null;
function registerDisplayScope(fn) { displayScopeFn = fn; }

/* ──────────────────────────────────────────────────────────────
   Wiring / Initialization
   ────────────────────────────────────────────────────────────── */
function initializeSteps() {
  const builderStep = document.getElementById('builderContainer');
  const finalStep   = document.getElementById('final-step');
  steps = [builderStep, finalStep];

  // Wire Back → Builder
  const backButton = document.getElementById('backButton');
  if (backButton) backButton.onclick = goToBuilder;

  // Wire Generate → Scope
  const genBtn = document.getElementById('generateProgramButton');
  if (genBtn) genBtn.onclick = goToScope;  

  // Keep Generate visually in sync with URL field presence
  const urlInput = document.getElementById('websiteUrl');
  if (urlInput) urlInput.addEventListener('input', syncGenerateButtonState);
  syncGenerateButtonState(); // initial paint

  // Keep Generate in sync with API loading/data lifecycle
  try {
    window.addEventListener('api-loading-started', syncGenerateButtonState);
    window.addEventListener('api-loading-finished', syncGenerateButtonState);
    window.addEventListener('api-data-updated', syncGenerateButtonState);
  } catch {}

  // Restore saved step if valid; else show Builder
  const saved = localStorage.getItem('currentStepIndex');
  const savedIdx = Number.parseInt(saved, 10);
  const hasValidSaved =
    Number.isInteger(savedIdx) &&
    savedIdx >= 0 &&
    savedIdx < steps.length &&
    !!steps[savedIdx];

  showStep(hasValidSaved ? savedIdx : StepIndex.BUILDER);
}

/* ──────────────────────────────────────────────────────────────
   Small helpers: one per control
   ────────────────────────────────────────────────────────────── */

// Generate button enabled/visual state depends on URL presence
function syncGenerateButtonState() {
  const urlInput = document.getElementById('websiteUrl');
  const genBtn   = document.getElementById('generateProgramButton');
  if (!genBtn) return;

  const hasUrl = !!(urlInput && urlInput.value.trim());
  const isLoading = !!(window.storedApiData && (window.storedApiData.loading || window.storedApiData.isLoading));

  // Policy: enable when URL is present and we are NOT currently loading.
  // We do NOT require API data to enable scope creation.
  const enable = hasUrl && !isLoading;

  genBtn.disabled = !enable;
  genBtn.setAttribute('aria-disabled', String(!enable));
  genBtn.tabIndex = enable ? 0 : -1; // Remove from tab flow when disabled

  // Visual state
  genBtn.classList.toggle('opacity-50', !enable);
  genBtn.classList.toggle('cursor-not-allowed', !enable);
  genBtn.classList.toggle('bg-blue-600', enable);
  genBtn.classList.toggle('hover:bg-blue-700', enable);
  genBtn.classList.toggle('bg-blue-400', !enable);
}

// Show/hide Data button (config + only on Builder step)
function updateDataButton(stepIndex) {
  const dataBtn = document.getElementById('viewDataButton');
  if (!dataBtn) return;

  // If config says "never show", hide permanently
  if (!window.config?.showApiDataButton) {
    dataBtn.classList.add('hidden');
    dataBtn.setAttribute('aria-hidden', 'true');
    dataBtn.tabIndex = -1;
    return;
  }

  // Otherwise, only show on the Builder step
  const showForStep = (stepIndex === StepIndex.BUILDER);
  dataBtn.classList.toggle('hidden', !showForStep);
  dataBtn.setAttribute('aria-hidden', String(!showForStep));
  dataBtn.tabIndex = showForStep ? 0 : -1;
}

// Show/hide Reset button (config; visible on both steps when enabled)
function updateResetButton() {
  const resetBtn = document.getElementById('resetButton');
  if (!resetBtn) return;

  const show = !!window.config?.showResetButton;
  resetBtn.classList.toggle('hidden', !show);
  resetBtn.setAttribute('aria-hidden', String(!show));
  resetBtn.tabIndex = show ? 0 : -1;
}

// Show/hide Back button (only on FINAL)
function updateBackButton(stepIndex) {
  const backButton = document.getElementById('backButton');
  if (!backButton) return;
  backButton.classList.toggle('hidden', stepIndex === StepIndex.BUILDER);
}

// Show/hide Generate button (hidden on FINAL)
function updateGenerateProgramButton(stepIndex) {
  const genBtn = document.getElementById('generateProgramButton');
  if (!genBtn) return;
  genBtn.classList.toggle('hidden', stepIndex === StepIndex.FINAL);
}

/* ──────────────────────────────────────────────────────────────
   Step switching
   ────────────────────────────────────────────────────────────── */
function showStep(stepIndex) {
  const changed = stepIndex !== currentStepIndex;

  // Only toggle step visibility if the step actually changed
  if (changed) {
    for (let i = 0; i < steps.length; i++) {
      const el = steps[i];
      if (!el) continue;
      if (i === stepIndex) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
    currentStepIndex = stepIndex;
    localStorage.setItem('currentStepIndex', stepIndex);
  }

  // Render final scope only on first entry into FINAL
  if (changed && stepIndex === StepIndex.FINAL && typeof displayScopeFn === 'function') {
    displayScopeFn();
    // NEW: tell script.js that FINAL is now shown so it can toggle loading state immediately
    try { window.dispatchEvent(new CustomEvent('final-step-shown')); } catch {}
  }

  // ✅ Always run control updates (even on initial paint when stepIndex === 0)
  updateDataButton(stepIndex);             // respects config and step
  updateResetButton();                     // respects config
  updateBackButton(stepIndex);             // show on FINAL only
  updateGenerateProgramButton(stepIndex);  // hide on FINAL
  syncGenerateButtonState();               // keep Generate visual state in sync
}

/* ──────────────────────────────────────────────────────────────
   Public navigation
   ────────────────────────────────────────────────────────────── */
function goToScope() {
  if (currentStepIndex !== StepIndex.FINAL) {
    showStep(StepIndex.FINAL);
  }
}

function goToBuilder() {
  if (currentStepIndex === StepIndex.FINAL) {
    const editor = document.querySelector("trix-editor#finalSummaryContent");
    if (editor) {
      const scopeHTML = editor.innerHTML;
      localStorage.setItem("scopeHTML", scopeHTML);
    }
  }

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
  registerDisplayScope,
};
