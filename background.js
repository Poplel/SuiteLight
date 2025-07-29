// Background script for NetSuite Spotlight Search
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-spotlight') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const tab = tabs[0];
      if (tab.url.includes('netsuite.com') || tab.url.includes('suiteapp.com')) {
        chrome.tabs.sendMessage(tab.id, {action: 'toggle-spotlight'});
      }
    });
  }
});

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('NetSuite Spotlight Search extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'search-netsuite') {
    // Forward search requests to content script for API calls
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'perform-search',
        query: request.query,
        filters: request.filters
      });
    });
  }
});

// Store NetSuite credentials/session info
chrome.storage.local.get(['netsuiteSession'], (result) => {
  if (!result.netsuiteSession) {
    // Initialize empty session storage
    chrome.storage.local.set({
      netsuiteSession: {
        authenticated: false,
        accountId: null,
        baseUrl: null
      }
    });
  }
});