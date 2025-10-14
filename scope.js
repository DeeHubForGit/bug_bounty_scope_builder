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
 * Helper: Collect all mobile apps to render based on config
 */
function getMobileAppsToRender(mobileDetails, config) {
  if (!mobileDetails) return [];

  const apps = [];
  const suggestedOnly = !!(config && config.suggestedAppsOnly);

  // Add main suggested apps
  if (Array.isArray(mobileDetails.suggested_apps) && mobileDetails.suggested_apps.length > 0) {
    const suggestedName = mobileDetails.suggested_name || mobileDetails.suggested_apps[0].name;
    
    // Add iOS and Android suggested apps with the suggested name
    mobileDetails.suggested_apps.forEach(app => {
      apps.push({ ...app, name: suggestedName });
    });
  }

  // Add alternatives if config allows
  if (!suggestedOnly && mobileDetails.alternatives) {
    if (Array.isArray(mobileDetails.alternatives.iOS)) {
      apps.push(...mobileDetails.alternatives.iOS);
    }
    if (Array.isArray(mobileDetails.alternatives.Android)) {
      apps.push(...mobileDetails.alternatives.Android);
    }
  }

  return apps;
}

  /**
   * Helper: Format mobile app data in the same format as manual mode
   */
  function formatMobileDataForSummary(mobileDetails) {
    const apps = getMobileAppsToRender(mobileDetails, window.config);
    if (!Array.isArray(apps) || apps.length === 0) return '';

    const appEntries = apps.map(app => {
      const appName = app.name || 'Unknown App';
      const platformLabel = app.platform === 'iOS' ? 'Apple' : app.platform === 'Android' ? 'Android' : '';
      const lines = [`📱MOBILE APP: <strong>${appName}${platformLabel ? ` (${platformLabel})` : ''}</strong>`];
      
      if (app.url) {
        lines.push(`<strong>URL:</strong> ${app.url}`);
      }
      lines.push(`<strong>Version:</strong> Current`);
      
      return `<div class="mb-2">${lines.join('<br>')}</div>`;
    });

    // Use the same spacing approach as extractSectionHTML
    return appEntries
      .map((entry, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + entry : entry))
      .join('');
  }

function getApisToRender(apiData, config) {
  if (!apiData) return [];

  const apis = [];
  const suggestedOnly = !!(config && config.suggestedApisOnly);

  if (Array.isArray(apiData.suggestedApis)) {
    apis.push(...apiData.suggestedApis);
  }

  if (!suggestedOnly && Array.isArray(apiData.alternativeApis)) {
    apis.push(...apiData.alternativeApis);
  }

  return apis;
}

/**
 * Helper: format the stored API data in the ai_recommend_apis format
 * "🧩 API" HTML snippet
 */
function formatApiDataForSummary(apiData) {
  const apis = getApisToRender(apiData, window.config);
  if (!Array.isArray(apis) || apis.length === 0) return '';

  const apiEntries = apis.map(api => {
    const lines = [`🧩 API: <strong>${api.name || 'Unknown API'}</strong>`];
    if (api.mainPage) lines.push(`<strong>URL:</strong> ${api.mainPage}`);

    if (Array.isArray(api.documentationUrls) && api.documentationUrls.length > 0) {
      if (api.documentationUrls.length === 1) {
        lines.push(`<strong>Documentation:</strong> ${api.documentationUrls[0]}`);
      } else {
        lines.push(`<strong>Documentation:</strong>`);
        api.documentationUrls.forEach(docUrl => lines.push(docUrl));
      }
    }

    return `<div class="mb-2">${lines.join('<br>')}</div>`;
  });

  return apiEntries
    .map((entry, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + entry : entry))
    .join('');
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

// Strict replace: only START..END, never swallow neighbors
function replaceBlockByMarker(existingHTML, sectionName, replacementBlock) {
  const name = sectionName.toUpperCase();
  const start = `--START ${name}--`;
  const end   = `--END ${name}--`;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pattern = new RegExp(esc(start) + '[\\s\\S]*?' + esc(end), 'i');
  if (!pattern.test(existingHTML)) {
    console.warn(`⚠️ Missing markers for "${sectionName}"`);
    return existingHTML;
  }
  return existingHTML.replace(pattern, replacementBlock);
}

function extractBlockByMarker(html, sectionName, { innerOnly = false } = {}) {
  const name = sectionName.toUpperCase();
  const start = `--START ${name}--`;
  const end   = `--END ${name}--`;
  const re = new RegExp(
    start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '([\\s\\S]*?)' +
    end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'i'
  );
  const m = html.match(re);
  if (!m) return '';
  return innerOnly ? m[1].trim() : m[0];
}

// Generic inserter: put block before a <strong>Heading</strong>, else append
function insertBlockBeforeSection(html, blockHTML, headingText) {
  try {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re  = new RegExp(`(<strong>\\s*${esc(headingText)}\\s*</strong>)`, 'i');
    return re.test(html) ? html.replace(re, blockHTML + '\n$1') : (html + '\n' + blockHTML);
  } catch {
    return html + '\n' + blockHTML;
  }
}

/**
 * Build or update the full scope text (used by both partial and final render).
 * - For new/reset: Use template from JSON and insert assets and rewards.
 * - For edit mode: Reuse existing text and update changed sections only.
 */
function constructScopeText(storedApiData, rewards, scopeText) {
  const scopeHTML = localStorage.getItem('scopeHTML');

  // Domain-based guard to avoid overwriting user edits
  const currentDomain = (localStorage.getItem('enteredUrl') || '').trim().toLowerCase();
  const lastAssetsDomain = (localStorage.getItem('initialDomain') || '').trim().toLowerCase();
  // Treat first-time (no previous domain) as a change
  const urlChanged = (!lastAssetsDomain) || (lastAssetsDomain !== currentDomain);

  // Reuse saved HTML unless domain changed
  let html = urlChanged ? '' : (scopeHTML || '');

  const assetsBlock  = buildAssetsBlockForScope(storedApiData);
  const rewardsBlock = getRewardsTextForScope(rewards);

  if (html) {
    // Scope text exists
    // --- assets ---
    const hasAssets = !!extractBlockByMarker(html, 'IN-SCOPE');
    if (!hasAssets) {
      console.log('🆕 Adding assets block (missing)');
      html = insertBlockBeforeSection(html, assetsBlock, 'Out-of-Scope Assets');
    } else if (urlChanged) {
      console.log('🔄 Updating assets block (URL changed)');
      html = replaceBlockByMarker(html, 'IN-SCOPE', assetsBlock);
    }

    // --- rewards ---
    const selectedTier     = localStorage.getItem('selectedRewardTier') || '';
    const lastRenderedTier = localStorage.getItem('lastRenderedRewardTier') || '';
    const hasRewards       = !!extractBlockByMarker(html, 'REWARDS');
    const tierChanged      = selectedTier !== lastRenderedTier;

    if (!hasRewards) {
      console.log('🆕 Adding rewards block (missing)');
      html = insertBlockBeforeSection(html, rewardsBlock, 'Submission Guidelines');
      localStorage.setItem('lastRenderedRewardTier', selectedTier);
    } else if (tierChanged) {
      console.log('🔁 Updating rewards block (tier changed)');
      html = replaceBlockByMarker(html, 'REWARDS', rewardsBlock);
      localStorage.setItem('lastRenderedRewardTier', selectedTier);
    }
  } else {
    // New scope text
    console.log('🆕 Creating new scope from JSON template');
    const templateHTML = getScopeTextFromJSON(scopeText);
    html = replaceBlockByMarker(templateHTML, 'IN-SCOPE', assetsBlock);
    html = replaceBlockByMarker(html, 'REWARDS', rewardsBlock);

    // Record current tier as rendered so we don't immediately re-render on next pass
    const selectedTier = localStorage.getItem('selectedRewardTier') || '';
    localStorage.setItem('lastRenderedRewardTier', selectedTier);
  }

  // Persist only if changed
  const previousHTML = scopeHTML || '';
  const scopeChanged = previousHTML.trim() !== html.trim();
  if (scopeChanged) {
    storedApiData.scopeHTML = html;
    localStorage.setItem('scopeHTML', html);
    console.log('💾 Scope text updated and saved in localStorage');
  }

  // Save the domain we built the assets for
  if (currentDomain) {
    localStorage.setItem('initialDomain', currentDomain);
  }

  return html;
}

/**
 * Build or update the partial scope text for the Scope step.
 * - For new/reset: Use template from JSON and insert assets.
 * - For edit mode: Reuse existing scope text and patch only the assets section.
 */
function buildPartialScopeTextFromApi() {
  const storedApiData = window.storedApiData || {};
  const html = constructScopeText(storedApiData, window.rewards, window.scopeText);
  // keep scopeHTML untouched here; this function only refreshes partial
  return html;
}

// Persist final scope HTML helper
function setScopeHTML(html) {
  if (!html) return;
  localStorage.setItem('scopeHTML', html);
  if (window.storedApiData) {
    window.storedApiData.scopeHTML = html;
  }
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
  const finalInput  = document.getElementById('final-step-input');
  const finalEditor = document.getElementById('finalSummaryContent');
  if (!finalInput || !finalEditor || !finalEditor.editor) return;

  ensureCopyButtonOnce();

  const html = constructScopeText(storedApiData, rewards, scopeText);

  finalInput.value = html;
  finalInput.dispatchEvent(new Event('input', { bubbles: true }));
  finalEditor.editor.loadHTML(html);
  setScopeHTML(html);
}

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
