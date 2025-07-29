// Popup script for NetSuite Spotlight Search
document.addEventListener('DOMContentLoaded', function() {
    const openBtn = document.getElementById('openSpotlight');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusDiv = document.getElementById('status');

    // Check if we're on a NetSuite page
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        const isNetSuite = currentTab.url.includes('netsuite.com') || currentTab.url.includes('suiteapp.com');
        
        if (isNetSuite) {
            // Check NetSuite session status
            checkNetSuiteSession();
        } else {
            statusIcon.textContent = '❌';
            statusText.textContent = 'Not on a NetSuite page';
            statusDiv.className = 'status disconnected';
            openBtn.disabled = true;
            openBtn.textContent = 'Navigate to NetSuite first';
            openBtn.style.background = '#ccc';
            openBtn.style.cursor = 'not-allowed';
        }
    });

    // Open spotlight when button is clicked
    openBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'toggle-spotlight'});
            window.close(); // Close popup
        });
    });

    function checkNetSuiteSession() {
        chrome.storage.local.get(['netsuiteSession'], function(result) {
            const session = result.netsuiteSession;
            
            if (session && session.authenticated && session.accountId) {
                statusIcon.textContent = '✅';
                statusText.textContent = `Connected to Account ${session.accountId}`;
                statusDiv.className = 'status connected';
                openBtn.disabled = false;
            } else {
                statusIcon.textContent = '⚠️';
                statusText.textContent = 'NetSuite session not detected';
                statusDiv.className = 'status disconnected';
                
                // Try to refresh session info
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: 'refresh-session'}, function(response) {
                        if (response && response.success) {
                            setTimeout(checkNetSuiteSession, 1000);
                        }
                    });
                });
            }
        });
    }
});