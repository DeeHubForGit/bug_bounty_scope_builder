/**
 * Render reward tiers based on the loaded data
 */
function renderRewardTiers(rewards) {
    const rewardTierCards = document.getElementById('rewardTierCards');
  
    if (!rewardTierCards || !rewards || !rewards.tiers) {
      console.error('Cannot render reward tiers: missing elements or data');
      return;
    }
  
    const tiers = rewards.tiers;
    const savedTier = localStorage.getItem('selectedRewardTier'); // ✅ Restore previous selection
  
    const tierHTML = Object.entries(tiers).map(([key, tier]) => {
      const levels = tier.levels || {};
  
      const levelList = Object.entries(levels)
        .filter(([_, val]) => val && val.trim() !== "")
        .map(([severity, amount]) => {
          const label = severity.charAt(0).toUpperCase() + severity.slice(1);
          return `<li>${label}: ${amount}</li>`;
        }).join('');
  
      // Check if this tier was previously selected
      const isSelected = savedTier === key;
  
      return `
        <label class="reward-tier-card block border rounded-md p-4 mb-4 cursor-pointer transition-all duration-200 ${isSelected ? 'border-blue-500 bg-blue-50' : ''}" data-tier="${key}">
          <div class="flex items-start gap-3">
            <input type="radio" name="rewardTier" value="${key}" class="mt-1" ${isSelected ? 'checked' : ''}>
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
    
    rewardTierCards.forEach(card => {
      const radioInput = card.querySelector('input[type="radio"]');
      
      card.addEventListener('click', () => {
        // Clear all selections
        rewardTierCards.forEach(c => {
          c.classList.remove('border-blue-500', 'bg-blue-50');
        });
  
        // Select this card
        if (radioInput) radioInput.checked = true;
        card.classList.add('border-blue-500', 'bg-blue-50');
  
        // Save selection to localStorage
        const tierKey = card.getAttribute('data-tier');
        localStorage.setItem('selectedRewardTier', tierKey);
      });
    });
  }  

  /**
 * Build the full Rewards text for the Scope step (Trix-friendly)
 */
function getRewardsTextForScope(rewards) {
    const savedTierKey = localStorage.getItem('selectedRewardTier');

    if (!savedTierKey || !rewards || !rewards.tiers[savedTierKey]) {
        return `--START REWARDS--<strong>Rewards</strong><br>
        Please select a reward tier to define your bounty structure.<br>
        --END REWARDS--`;
    }

    const tier = rewards.tiers[savedTierKey];
    const definitions = rewards.definitions || {};
    const examples = rewards.examples || {};

    let rewardHTML = `
        <strong>Rewards</strong>
        We offer bounties based on the severity and impact of the vulnerability:<br>
    `;

    Object.entries(tier.levels || {}).forEach(([severity, amount]) => {
        const label = severity.charAt(0).toUpperCase() + severity.slice(1);
        const def = definitions[severity] || '';
        const ex = Array.isArray(examples[severity])
            ? examples[severity].join(', ')
            : (examples[severity] || '');

        rewardHTML += `
            <br><strong>${label}: ${amount} – ${def}</strong>
            ${ex ? `${ex}` : ''}
        `;
    });

    rewardHTML += `
        <br><em>Note: Reports without clear security implications or that require unrealistic attack scenarios will not be rewarded.</em>
    `;

    // Normalize spacing
    rewardHTML = rewardHTML
        .replace(/^\s+/gm, '') // strip indentation
        .replace(/<br>\s*<br>/g, '<br><br>'); // clean up excess line breaks

    // Remove blank line right after --START REWARDS--
    return (`--START REWARDS--${rewardHTML}--END REWARDS--`)
        .replace(/--START REWARDS--\s+/, '--START REWARDS--');
}

export { renderRewardTiers, setupRewardTierListeners, getRewardsTextForScope };
