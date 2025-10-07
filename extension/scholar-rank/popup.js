const STORAGE_KEY = 'scholarRankEnabled';

const toggleCheckbox = document.getElementById('enableToggle');
const statusElement = document.getElementById('status');
const resetDataButton = document.getElementById('resetData');
const manualQueryButton = document.getElementById('manualQuery');

// Load saved state
chrome.storage.sync.get([STORAGE_KEY], (result) => {
  const isEnabled = result[STORAGE_KEY] !== false; // default to true
  toggleCheckbox.checked = isEnabled;
  updateStatus(isEnabled);
  updateManualQueryButton(!isEnabled);
});

// Handle toggle change
toggleCheckbox.addEventListener('change', async (e) => {
  const isEnabled = e.target.checked;

  // Save state
  await chrome.storage.sync.set({ [STORAGE_KEY]: isEnabled });

  // Update UI
  updateStatus(isEnabled);
  updateManualQueryButton(!isEnabled);

  // Notify content scripts
  const tabs = await chrome.tabs.query({ url: '*://scholar.google.com/*' });
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SCHOLAR_RANK_TOGGLE',
      enabled: isEnabled
    }).catch(() => {
      // Ignore errors if content script not loaded
    });
  });

  // Reload Scholar tabs to apply changes
  if (isEnabled) {
    tabs.forEach((tab) => {
      chrome.tabs.reload(tab.id);
    });
  }
});

// Handle manual query button
if (manualQueryButton) {
  manualQueryButton.addEventListener('click', async (e) => {
    e.preventDefault();

    // Visual feedback
    const originalText = manualQueryButton.textContent;
    manualQueryButton.textContent = 'Querying...';
    manualQueryButton.disabled = true;

    // Send message to content scripts to manually query all papers
    const tabs = await chrome.tabs.query({ url: '*://scholar.google.com/*' });
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SCHOLAR_RANK_MANUAL_QUERY'
      }).catch(() => {
        // Ignore errors if content script not loaded
      });
    });

    // Reset button after 2 seconds
    setTimeout(() => {
      manualQueryButton.textContent = originalText;
      manualQueryButton.disabled = false;
      const isEnabled = toggleCheckbox.checked;
      updateManualQueryButton(!isEnabled);
    }, 2000);
  });
}

// Handle reset cache
if (resetDataButton) {
  resetDataButton.addEventListener('click', async (e) => {
    e.preventDefault();

    // Send message to background to clear cache
    await chrome.runtime.sendMessage({ type: 'SCHOLAR_RANK_CLEAR_CACHE' });

    // Visual feedback
    resetDataButton.textContent = 'Cache cleared!';
    setTimeout(() => {
      resetDataButton.textContent = 'Reset Cache';
    }, 1500);

    // Reload Scholar tabs
    const tabs = await chrome.tabs.query({ url: '*://scholar.google.com/*' });
    tabs.forEach((tab) => {
      chrome.tabs.reload(tab.id);
    });
  });
}

function updateStatus(enabled) {
  if (enabled) {
    statusElement.textContent = 'Extension is enabled';
    statusElement.className = 'status enabled';
  } else {
    statusElement.textContent = 'Extension is disabled';
    statusElement.className = 'status disabled';
  }
}

function updateManualQueryButton(shouldEnable) {
  if (manualQueryButton) {
    manualQueryButton.disabled = !shouldEnable;
  }
}
