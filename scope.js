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
    
    // Process alternative apps
    if (mobileDetails.alternatives) {
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
  
  // Build the In‑Scope Assets block for the Scope editor
  function buildAssetsBlockForScope(storedApiData) {
    // Use the same URL you already store for scope
    const domain = (localStorage.getItem('enteredUrl') || '').trim();
  
    // Reuse your existing helpers (from your “old code”)
    const websitesHTML = domain ? formatWebsiteDataForSummary(domain) : '';
    const mobilesHTML  = formatMobileDataForSummary(storedApiData.mobileDetails);
    const apisHTML     = formatApiDataForSummary(storedApiData.apiDetails);
  
    // Mirror spacing logic used elsewhere
    const sections = [];
    if (websitesHTML) sections.push(websitesHTML);
    if (mobilesHTML)  sections.push(mobilesHTML);
    if (apisHTML)     sections.push(apisHTML);
  
    const assetsContent = sections
      .map((block, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + block : block))
      .join('');
  
    return [
      '--START IN-SCOPE--',
      '<p><strong>In-Scope Assets</strong></p>',
      assetsContent,
      '\n--END IN-SCOPE--'
    ].join('');
  }
  
  function replaceBlockByMarker(existingHTML, sectionName, replacementBlock) {
    const name = sectionName.toUpperCase();
    const start = `--START ${name}--`;
    const end   = `--END ${name}--`;
  
    // Match the marker block, optionally wrapped in a single <p> ... </p>
    const pattern = new RegExp(
      `(?:<p>)?\\s*${start}[\\s\\S]*?${end}\\s*(?:</p>)?`,
      'i'
    );
  
    if (!pattern.test(existingHTML)) {
      console.warn(`⚠️ Missing markers for "${sectionName}"`);
      return existingHTML;
    }
  
    return existingHTML.replace(pattern, replacementBlock);
  }
  
/**
 * Build partial scope text using API result (Assets injected only).
 * Saves result in memory and localStorage but does not render it.
 */
function buildPartialScopeTextFromApi() {
    const storedApiData = window.storedApiData || {};
    
    // 1) Try API result first
    let scopeText = storedApiData.scopeText;
  
    // 2) Fallback to JSON-loaded default (window.scopeText)
    if (!Array.isArray(scopeText) || scopeText.length === 0) {
      console.warn('⚠️ No valid scopeText from API — using window.scopeText');
      scopeText = window.scopeText;
    }
    
    // 3) Final check
    if (!Array.isArray(scopeText)) {
      console.error('❌ scopeText is still invalid — aborting');
      return;
    }
  
    // 4) Convert to HTML
    const templateHTML = getScopeTextFromJSON(scopeText);
  
    // 5) Inject assets
    const assetsBlock = buildAssetsBlockForScope(storedApiData);
    const partialScopeHTML = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
  
    // 6) Save
    storedApiData.partialScopeHTML = partialScopeHTML;
    localStorage.setItem('partialScopeHTML', partialScopeHTML);
  
    console.log('✅ Partial scope text saved in memory and localStorage (not rendered yet)');
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
  
    // 2) Establish a base HTML that already includes IN‑SCOPE (assets)
    let baseWithAssets = (storedApiData && storedApiData.partialScopeHTML) || '';
  
    // If not available yet, try building it now from what we have
    if (!baseWithAssets) {
      // Try to build from API-provided scope text (array of template lines)
      const rawScopeText = storedApiData?.scopeText;
      if (rawScopeText && Array.isArray(rawScopeText) && rawScopeText.length > 0) {
        const templateHTML = rawScopeText.join('\n').trim();
        const assetsBlock  = buildAssetsBlockForScope(storedApiData);
        baseWithAssets     = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
      } else {
        // Final fallback: use local JSON template helper
        const templateHTML = getScopeTextFromJSON(scopeText);
        const assetsBlock  = buildAssetsBlockForScope(storedApiData);
        baseWithAssets     = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
      }
    }

    // 3) Build rewards block using your existing helper (expects global `rewards`)
    const rewardsBlock = getRewardsTextForScope(rewards);
  
    // 4) Inject rewards into the template
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

  const selectedTier = localStorage.getItem('selectedRewardTier');
  const initialTier = localStorage.getItem('initialRewardTier');
  const hasChangedTier = selectedTier !== initialTier;

  localStorage.setItem('initialRewardTier', selectedTier);
  ensureCopyButtonOnce();

  let existing = finalInput.value?.trim() || localStorage.getItem('finalScopeHTML');

  if (existing && hasChangedTier) {
    console.log('♻️ Reward tier changed — replacing only the rewards section.');
    const newRewards = getRewardsTextForScope(rewards); // assumes it returns wrapped HTML

    // Replace the section between --START REWARDS-- and --END REWARDS--
    existing = existing.replace(
      /--START REWARDS--[\s\S]*?--END REWARDS--/,
      newRewards
    );
  }

  if (existing) {
    console.log('🔁 Displaying scope (existing text with any updates).');
    finalInput.value = existing;
    finalInput.dispatchEvent(new Event('input', { bubbles: true }));
    finalEditor.editor.loadHTML(existing);
    setFinalScopeHTML(existing); // keep storage in sync
  } else {
    console.log('🆕 Generating new scope (no saved version).');
    const scopeHTML = getFinalScopeHTML(storedApiData, rewards, scopeText);
    finalInput.value = scopeHTML;
    finalInput.dispatchEvent(new Event('input', { bubbles: true }));
    finalEditor.editor.loadHTML(scopeHTML);
    setFinalScopeHTML(scopeHTML); // save initial render
  }
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
    console.log('[copy] Copy button wired');
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
