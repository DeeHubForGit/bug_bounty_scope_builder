import { getRewardsTextForScope } from './rewards.js';

function getScopeTextFromJSON(scopeText) {

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
    const suggestedOnly = !!(window.config && window.config.suggestedAppsOnly);
    
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
    
    // Process alternative apps (only when not limited to suggested apps)
    if (!suggestedOnly && mobileDetails.alternatives) {
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
  
// Build the In-Scope Assets block for the Scope editor
function buildAssetsBlockForScope(storedApiData) {
  const domain = (localStorage.getItem('enteredUrl') || '').trim();

  // Build sections
  const websitesHTML = domain ? formatWebsiteDataForSummary(domain) : '';
  const mobilesHTML  = formatMobileDataForSummary(storedApiData.mobileDetails);
  const apisHTML     = formatApiDataForSummary(storedApiData.apiDetails);

  const sections = [];
  if (websitesHTML) sections.push(websitesHTML);
  if (mobilesHTML)  sections.push(mobilesHTML);
  if (apisHTML)     sections.push(apisHTML);

  // Spacer only BETWEEN blocks (none after the last)
  const assetsContent = sections
    .map((block, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + block : block))
    .join('');

  // NOTE: no newline before END marker; put END in its own paragraph
  return [
    '--START IN-SCOPE--',
    '<p><strong>In-Scope Assets</strong></p>',
    assetsContent,
    '<p>--END IN-SCOPE--</p>'
  ].join('');
}

function replaceBlockByMarker(existingHTML, sectionName, replacementBlock) {
  const name = sectionName.toUpperCase();
  const start = `--START ${name}--`;
  const end   = `--END ${name}--`;

  // Match exactly from START..END (optionally wrapped by a single <p>),
  // but DO NOT consume any whitespace/<br> that appears BEFORE START.
  const pattern = new RegExp(
    // optional opening <p>
    '(?:<p>)?' +
    // START marker (no leading whitespace/br eater here)
    start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    // content up to END
    '[\\s\\S]*?' +
    // END marker
    end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    // optional whitespace or <br> after END
    '\\s*(?:<br\\s*\\/?>\\s*)*' +
    // optional closing </p>
    '(?:</p>)?',
    'i'
  );

  if (!pattern.test(existingHTML)) {
    console.warn(`⚠️ Missing markers for "${sectionName}"`);
    return existingHTML;
  }

  return existingHTML.replace(pattern, replacementBlock);
}  

function extractBlockByMarker(html, sectionName) {
  const name = sectionName.toUpperCase();
  const start = `--START ${name}--`;
  const end   = `--END ${name}--`;
  const re = new RegExp(
    start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'i'
  );
  const m = html.match(re);
  return m ? m[0] : '';
}

/**
 * Build or update the partial scope text for the Scope step.
 * - For new/reset: Use template from JSON and insert assets.
 * - For edit mode: Reuse existing scope text and patch only the assets section.
 */
function buildPartialScopeTextFromApi() {
  const storedApiData = window.storedApiData || {};
  const currentDomain = (document.getElementById('websiteUrl')?.value || '').trim().toLowerCase();
  
  // Use JSON-loaded default (window.scopeText) exclusively
  let scopeText = window.scopeText;

  // Validate
  if (!Array.isArray(scopeText) || scopeText.length === 0) {
    console.error('❌ window.scopeText is not loaded or empty — aborting');
    return;
  }

  // Build assets block from current data
  const assetsBlock = buildAssetsBlockForScope(storedApiData);
  let finalHTML;

  // Check existing scope (edit mode)
  // Prefer user's edited final HTML if present; fall back to partial
  const existingFinal   = localStorage.getItem('finalScopeHTML');
  const existingPartial = localStorage.getItem('partialScopeHTML');
  const existing = existingFinal || existingPartial;
  const initialDomain = localStorage.getItem('initialDomain');

  if (existing && existing.includes('--START IN-SCOPE--')) {
    const isUrlChanged = !!(initialDomain && initialDomain !== currentDomain);

    // Compare old vs new assets to detect actual content changes
    const oldAssets = extractBlockByMarker(existing, 'IN-SCOPE').trim();
    const newAssets = assetsBlock.trim();
    const assetsChanged = oldAssets !== newAssets;

    if (isUrlChanged || assetsChanged) {
      console.log('🔄 Replacing assets block',
        isUrlChanged ? '(URL changed)' : '(data changed)');
      finalHTML = replaceBlockByMarker(existing, 'IN-SCOPE', assetsBlock);
    } else {
      console.log('✅ Keeping existing assets block (no change)');
      finalHTML = existing;
    }
  } else {
    console.log('🆕 Creating new scope from JSON template');
    const templateHTML = getScopeTextFromJSON(scopeText);
    finalHTML = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
  }

  // Save updated version
  storedApiData.partialScopeHTML = finalHTML;
  localStorage.setItem('partialScopeHTML', finalHTML);
  // If user had a final version, keep it in sync with updated assets as well
  try { if (existingFinal) setFinalScopeHTML(finalHTML); } catch {}

  // Save current domain only AFTER logic completes
  localStorage.setItem('initialDomain', currentDomain);

  console.log('💾 Partial scope text saved in memory and localStorage (not rendered yet)');
}

function loadPartialScopeFromStorage(storedApiData) {
  const saved = localStorage.getItem('partialScopeHTML');
  if (saved) {
    storedApiData.partialScopeHTML = saved;
    console.log('✅ Loaded partial scope from localStorage');
  }
}

// Persist final scope HTML helper
function setFinalScopeHTML(html) {
  if (!html) return;
  localStorage.setItem('finalScopeHTML', html);
  if (window.storedApiData) {
    window.storedApiData.finalScopeHTML = html;
  }
}

  /**
   * Return the final Scope HTML by combining:
   * - the saved partial scope (scope + assets) from memory/localStorage
   * - the current rewards block
   *
   * Falls back carefully if partial not found yet.
   */
  function getFinalScopeHTML(storedApiData, rewards, scopeText) {
    // 1) Ensure we have the most recent partial scope in memory
    if (!storedApiData?.partialScopeHTML) {
      loadPartialScopeFromStorage(storedApiData);
    }
  
    let baseWithAssets = storedApiData.partialScopeHTML || '';
  
    // 2) If partialScopeHTML is missing or asset data is outdated, rebuild assets
    const newAssetsBlock = buildAssetsBlockForScope(storedApiData);
  
    if (!baseWithAssets) {
      // Build from JSON template only
      const templateHTML = getScopeTextFromJSON(scopeText);
      baseWithAssets = replaceBlockByMarker(templateHTML, 'IN-SCOPE', newAssetsBlock);
    } else {
      // Replace only the assets block (preserving edits to rewards if any)
      baseWithAssets = replaceBlockByMarker(baseWithAssets, 'IN-SCOPE', newAssetsBlock);
    }
  
    // 3) Build rewards block using your existing helper
    const rewardsBlock = getRewardsTextForScope(rewards);
  
    // 4) Inject rewards into the updated template
    const finalHTML = replaceBlockByMarker(baseWithAssets, 'REWARDS', rewardsBlock).trim();
  
    return finalHTML;
  }  
  
/**
 * Display the final Scope (scope + assets + rewards) in the Trix editor.
 * - If the user has previously edited the scope, their version is restored.
 * - If the reward tier changed, only the rewards section is regenerated.
 * - Otherwise, a new version is generated and shown.
 * 
 * John’s step 8: “Add the rewards section to the template and show the finished product on the next page.”
 */
function displayScopePage(rewards, scopeText) {
  const storedApiData = window.storedApiData || {};
  const finalInput = document.getElementById('final-step-input');
  const finalEditor = document.getElementById('finalSummaryContent');

  if (!finalInput || !finalEditor || !finalEditor.editor) {
    console.error('❌ Missing Trix editor elements: #final-step-input and/or #finalSummaryContent');
    return;
  }

  // Keep tier tracking if used elsewhere, but we will always refresh rewards below
  const selectedTier = localStorage.getItem('selectedRewardTier');
  localStorage.setItem('initialRewardTier', selectedTier);
  ensureCopyButtonOnce();

  // 1) Load existing scope (assets already injected)
  // Prefer user's edited final HTML, with fallback to partial
  let existing = localStorage.getItem('finalScopeHTML')
             || storedApiData.partialScopeHTML
             || localStorage.getItem('partialScopeHTML');

  if (!existing) {
    console.log('No partialScopeHTML found (data may not have been retrieved for the domain). Fallback to generating full scope.');
    const scopeHTML = getFinalScopeHTML(storedApiData, rewards, scopeText);
    finalInput.value = scopeHTML;
    finalInput.dispatchEvent(new Event('input', { bubbles: true }));
    finalEditor.editor.loadHTML(scopeHTML);
    setFinalScopeHTML(scopeHTML);
    return;
  }

  // 2) Always inject or replace rewards with the latest block
  const rewardsBlock = getRewardsTextForScope(rewards);
  if (existing.includes('--START REWARDS--')) {
    console.log('♻️ Refreshing rewards section.');
    existing = existing.replace(/--START REWARDS--[\s\S]*?--END REWARDS--/i, rewardsBlock);
  } else {
    console.log('➕ Adding rewards section.');
    existing += '\n' + rewardsBlock;
  }

  // 3) Display final scope
  console.log('🖋️ Rendering scope in final editor.');
  finalInput.value = existing;
  finalInput.dispatchEvent(new Event('input', { bubbles: true }));
  finalEditor.editor.loadHTML(existing);
  setFinalScopeHTML(existing);
}
  
  /**
   * OLD: Display the scope text in the Trix editor (with Assets + Rewards injected)
   */
  /* function displayScopeText() {
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
  }*/
  
  // Attach a 📋 Copy button to the *final scope* Trix editor toolbar
  // Idempotent: attach a 📋 Copy button to the final Trix toolbar once.
  function ensureCopyButtonOnce() {
    const editor = document.getElementById('finalSummaryContent');
    if (!editor || !editor.toolbarElement) return;
  
    // Already wired? bail.
    if (editor.dataset.copyButtonWired === '1') return;
  
    const fileGroup = editor.toolbarElement.querySelector('[data-trix-button-group="file-tools"]');
    if (!fileGroup) return;
  
    // If a copy button exists (e.g., after a hot reload), mark and exit
    if (fileGroup.querySelector('#copyButton')) {
      editor.dataset.copyButtonWired = '1';
      return;
    }
  
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.id        = 'copyButton';
    btn.title     = 'Copy to Clipboard';
    btn.className = 'trix-button copy-button';
    btn.textContent = '📋 Copy';
    btn.addEventListener('click', copyFinalSummary);
  
    fileGroup.appendChild(btn);
    editor.dataset.copyButtonWired = '1';
  }
  
  export function showMessageModal(title, message) {
    const modal = document.getElementById('messageModal');
    const titleEl = document.getElementById('messageModalTitle');
    const bodyEl = document.getElementById('messageModalBody');
    const closeBtn = document.getElementById('closeMessageModal');
  
    if (!modal || !titleEl || !bodyEl || !closeBtn) {
      console.warn('[modal] Elements missing; falling back to alert.');
      alert(message || 'Notice'); // last‑ditch fallback
      return;
    }
  
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

  export {
    buildPartialScopeTextFromApi,
    displayScopePage
  };
