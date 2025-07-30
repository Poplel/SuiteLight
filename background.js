// Background script for NetSuite Spotlight Search
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-spotlight') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const tab = tabs[0];
      if (tab.url.includes('netsuite.com') || tab.url.includes('suiteapp.com')) {
        // Send message with error handling
        chrome.tabs.sendMessage(tab.id, {action: 'toggle-spotlight'}, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Content script not ready, injecting...', chrome.runtime.lastError.message);
            // If content script isn't ready, try to inject it
            injectContentScript(tab.id);
          }
        });
      }
    });
  }
});

// Function to inject content script if it's not already loaded
function injectContentScript(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to inject content script:', chrome.runtime.lastError);
    } else {
      // Try sending the message again after a brief delay
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {action: 'toggle-spotlight'}, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Content script still not ready after injection');
          }
        });
      }, 500);
    }
  });
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('NetSuite Spotlight Search extension installed');
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'search-netsuite') {
    // Forward search requests to content script for API calls
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'perform-search',
          query: request.query,
          filters: request.filters
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Failed to forward search request:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
  return true; // Indicates async response
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

// Handle tab updates to ensure content script is loaded on NetSuite pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      tab.url && 
      (tab.url.includes('netsuite.com') || tab.url.includes('suiteapp.com'))) {
    
    // Small delay to ensure page is fully loaded
    setTimeout(() => {
      // Check if content script is already loaded
      chrome.tabs.sendMessage(tabId, {action: 'ping'}, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded, inject it
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }, () => {
            if (chrome.runtime.lastError) {
              console.log('Could not inject content script:', chrome.runtime.lastError.message);
            } else {
              console.log('Content script injected successfully');
            }
          });
        } else {
          console.log('Content script already loaded');
        }
      });
    }, 2000); // Increased delay for page stability
  }
});