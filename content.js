// NetSuite Spotlight Search - Functional Implementation (No Classes)
(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.netsuiteSpotlightInitialized) {
        console.log('NetSuite Spotlight already initialized');
        return;
    }
    window.netsuiteSpotlightInitialized = true;

    // Global variables for the spotlight functionality
    let isVisible = false;
    let overlay = null;
    let accountId = null;
    let selectedIndex = -1;
    let currentResults = [];
    let activeFilters = ['all'];

    console.log('NetSuite Spotlight: Starting initialization...');

    // Initialize spotlight
    function initSpotlight() {
        console.log('NetSuite Spotlight: Initializing...');
        
        // Extract NetSuite session
        extractNetSuiteSession();
        
        // Create spotlight elements
        createSpotlightElements();
        
        // Setup keyboard listeners
        setupKeyboardListeners();
        
        // Setup message listeners
        setupMessageListeners();
        
        console.log('NetSuite Spotlight: Initialized successfully');
    }

    function extractNetSuiteSession() {
        try {
            const hostname = window.location.hostname;
            const urlMatch = hostname.match(/(\d+)\.app\.netsuite\.com/);
            if (urlMatch) {
                accountId = urlMatch[1];
            }

            chrome.storage.local.set({
                netsuiteSession: {
                    authenticated: true,
                    accountId: accountId,
                    baseUrl: window.location.origin
                }
            });

            console.log('NetSuite session extracted:', { accountId });
        } catch (error) {
            console.error('Failed to extract NetSuite session:', error);
        }
    }

    function createSpotlightElements() {
        if (overlay) {
            console.log('Spotlight overlay already exists');
            return;
        }

        // Create overlay
        overlay = document.createElement('div');
        overlay.id = 'netsuite-spotlight-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0, 0, 0, 0.6) !important;
            z-index: 999999 !important;
            display: none !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        `;

        // Create spotlight container with inline HTML
        overlay.innerHTML = `
            <div style="
                position: absolute !important;
                top: 15vh !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                width: 600px !important;
                max-width: 90vw !important;
                background: white !important;
                border-radius: 12px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                overflow: hidden !important;
                max-height: 70vh !important;
                display: flex !important;
                flex-direction: column !important;
            ">
                <input 
                    type="text" 
                    placeholder="Search NetSuite records..." 
                    id="spotlightSearch" 
                    style="
                        width: 100% !important;
                        padding: 20px 24px !important;
                        font-size: 18px !important;
                        border: none !important;
                        outline: none !important;
                        background: #fbf9f8 !important;
                        border-bottom: 1px solid #e9ecef !important;
                        font-family: inherit !important;
                        box-sizing: border-box !important;
                    "
                >
                
                <div id="spotlightFilters" style="
                    padding: 16px 24px !important;
                    background: #fbf9f8 !important;
                    border-bottom: 1px solid #e9ecef !important;
                    display: flex !important;
                    gap: 8px !important;
                    overflow-x: auto !important;
                    white-space: nowrap !important;
                    box-sizing: border-box !important;
                ">
                    <div class="filter-bubble active" data-type="all">All</div>
                    <div class="filter-bubble" data-type="customer">Customers</div>
                    <div class="filter-bubble" data-type="salesorder">Sales Orders</div>
                    <div class="filter-bubble" data-type="invoice">Invoices</div>
                    <div class="filter-bubble" data-type="item">Items</div>
                    <div class="filter-bubble" data-type="employee">Employees</div>
                    <div class="filter-bubble" data-type="vendor">Vendors</div>
                </div>

                <div id="spotlightResults" style="
                    flex: 1 !important;
                    overflow-y: auto !important;
                    max-height: 400px !important;
                    box-sizing: border-box !important;
                ">
                    <div style="
                        padding: 40px 24px !important; 
                        text-align: center !important; 
                        color: #5f6368 !important; 
                        font-size: 14px !important;
                    ">
                        Start typing to search NetSuite records...
                    </div>
                </div>
            </div>
        `;

        // Add to page
        document.body.appendChild(overlay);

        // Add CSS styles
        addSpotlightStyles();

        // Setup event listeners
        setupSpotlightEventListeners();
        
        console.log('Spotlight elements created successfully');
    }

    function addSpotlightStyles() {
        if (document.getElementById('spotlight-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'spotlight-styles';
        style.textContent = `
            .filter-bubble {
                padding: 8px 14px !important;
                background: #e9ecef !important;
                border: 1px solid #dee2e6 !important;
                border-radius: 20px !important;
                font-size: 13px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                user-select: none !important;
                flex-shrink: 0 !important;
                white-space: nowrap !important;
                color: #495057 !important;
                transition: all 0.2s ease !important;
                box-sizing: border-box !important;
            }
            .filter-bubble.active {
                background: #325c73 !important;
                color: white !important;
                border-color: #325c73 !important;
            }
            .filter-bubble:hover {
                background: #dee2e6 !important;
            }
            .filter-bubble.active:hover {
                background: #2a4f63 !important;
            }
            .result-item {
                padding: 12px 24px !important;
                border-bottom: 1px solid #f1f3f4 !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                transition: background-color 0.15s ease !important;
                box-sizing: border-box !important;
            }
            .result-item:hover {
                background: #fbf9f8 !important;
            }
            .result-item.selected {
                background: #e8f1f5 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function setupSpotlightEventListeners() {
        const searchInput = overlay.querySelector('#spotlightSearch');
        const filterBubbles = overlay.querySelector('#spotlightFilters');
        const resultsContainer = overlay.querySelector('#spotlightResults');

        if (!searchInput || !filterBubbles || !resultsContainer) {
            console.error('Could not find spotlight elements');
            return;
        }

        let searchTimeout = null;

        // Search input handler
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value);
            }, 300);
        });

        // Filter bubble handlers
        filterBubbles.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-bubble')) {
                handleFilterClick(e.target, searchInput);
            }
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const results = resultsContainer.querySelectorAll('.result-item');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
                updateSelection(results);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateSelection(results);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && currentResults[selectedIndex]) {
                    openRecord(currentResults[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                hideSpotlight();
            }
        });

        // Click to close overlay
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideSpotlight();
            }
        });

        console.log('Event listeners setup complete');
    }

    function handleFilterClick(target, searchInput) {
        const filterType = target.dataset.type;
        const filterBubbles = overlay.querySelector('#spotlightFilters');
        
        if (filterType === 'all') {
            activeFilters = ['all'];
            filterBubbles.querySelectorAll('.filter-bubble').forEach(bubble => {
                bubble.classList.toggle('active', bubble.dataset.type === 'all');
            });
        } else {
            if (activeFilters.includes('all')) {
                activeFilters = [];
                filterBubbles.querySelector('[data-type="all"]').classList.remove('active');
            }
            
            if (activeFilters.includes(filterType)) {
                const index = activeFilters.indexOf(filterType);
                activeFilters.splice(index, 1);
                target.classList.remove('active');
            } else {
                activeFilters.push(filterType);
                target.classList.add('active');
            }
            
            if (activeFilters.length === 0) {
                activeFilters = ['all'];
                filterBubbles.querySelector('[data-type="all"]').classList.add('active');
            }
        }
        
        performSearch(searchInput.value);
    }

    function performSearch(query) {
        const resultsContainer = overlay.querySelector('#spotlightResults');
        
        if (!query || query.trim().length < 2) {
            resultsContainer.innerHTML = `
                <div style="
                    padding: 40px 24px !important; 
                    text-align: center !important; 
                    color: #5f6368 !important; 
                    font-size: 14px !important;
                ">
                    Start typing to search NetSuite records...
                </div>
            `;
            currentResults = [];
            selectedIndex = -1;
            return;
        }

        resultsContainer.innerHTML = `
            <div style="
                padding: 20px !important; 
                text-align: center !important; 
                color: #6c757d !important; 
                font-size: 14px !important;
            ">
                Searching...
            </div>
        `;

        // Mock search results for testing
        setTimeout(() => {
            const mockResults = [
                { 
                    id: '123', 
                    type: 'customer', 
                    title: 'Acme Corporation', 
                    subtitle: 'Enterprise Customer • Active', 
                    url: '/app/common/entity/custjob.nl?id=123' 
                },
                { 
                    id: '456', 
                    type: 'salesorder', 
                    title: 'SO-2024-001', 
                    subtitle: '$15,000 • Open', 
                    url: '/app/accounting/transactions/salesord.nl?id=456' 
                },
                { 
                    id: '789', 
                    type: 'invoice', 
                    title: 'INV-2024-001', 
                    subtitle: '$5,500 • Paid', 
                    url: '/app/accounting/transactions/custinvc.nl?id=789' 
                },
                { 
                    id: '101', 
                    type: 'item', 
                    title: 'Premium Service Package', 
                    subtitle: 'SKU: PSP-001 • $299.99', 
                    url: '/app/common/item/item.nl?id=101' 
                },
                { 
                    id: '202', 
                    type: 'employee', 
                    title: 'John Smith', 
                    subtitle: 'Sales Manager • john.smith@company.com', 
                    url: '/app/common/entity/employee.nl?id=202' 
                }
            ].filter(item => 
                activeFilters.includes('all') || activeFilters.includes(item.type)
            ).filter(item =>
                item.title.toLowerCase().includes(query.toLowerCase()) ||
                item.subtitle.toLowerCase().includes(query.toLowerCase())
            );

            currentResults = mockResults;
            selectedIndex = -1;
            displayResults(mockResults);
        }, 300);
    }

    function displayResults(results) {
        const resultsContainer = overlay.querySelector('#spotlightResults');
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div style="
                    padding: 40px 24px !important; 
                    text-align: center !important; 
                    color: #5f6368 !important; 
                    font-size: 14px !important;
                ">
                    No results found
                </div>
            `;
            return;
        }

        const iconMap = {
            customer: '👤',
            salesorder: '🛒',
            invoice: '📄',
            item: '📦',
            employee: '👨‍💼',
            vendor: '🏢'
        };

        const html = results.map((item, index) => `
            <div class="result-item" data-index="${index}">
                <div style="
                    width: 32px !important;
                    height: 32px !important;
                    border-radius: 6px !important;
                    background: #325c73 !important;
                    color: white !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 16px !important;
                    flex-shrink: 0 !important;
                ">${iconMap[item.type] || '📄'}</div>
                <div style="flex: 1 !important; min-width: 0 !important;">
                    <div style="
                        font-weight: 500 !important; 
                        font-size: 14px !important; 
                        color: #202124 !important; 
                        margin-bottom: 2px !important; 
                        white-space: nowrap !important; 
                        overflow: hidden !important; 
                        text-overflow: ellipsis !important;
                    ">${item.title}</div>
                    <div style="
                        font-size: 12px !important; 
                        color: #5f6368 !important; 
                        white-space: nowrap !important; 
                        overflow: hidden !important; 
                        text-overflow: ellipsis !important;
                    ">${item.subtitle}</div>
                </div>
                <div style="
                    font-size: 11px !important; 
                    color: #5f6368 !important; 
                    background: #fbf9f8 !important; 
                    padding: 2px 6px !important; 
                    border-radius: 4px !important; 
                    text-transform: uppercase !important; 
                    letter-spacing: 0.5px !important; 
                    flex-shrink: 0 !important;
                ">${item.type}</div>
            </div>
        `).join('');

        resultsContainer.innerHTML = html;

        // Add click handlers to results
        resultsContainer.querySelectorAll('.result-item').forEach((item, index) => {
            item.addEventListener('click', () => openRecord(results[index]));
            item.addEventListener('mouseover', () => {
                selectedIndex = index;
                updateSelection(resultsContainer.querySelectorAll('.result-item'));
            });
        });
    }

    function updateSelection(results) {
        results.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });

        if (selectedIndex >= 0 && results[selectedIndex]) {
            results[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function openRecord(record) {
        if (record.url) {
            window.open(window.location.origin + record.url, '_blank');
        }
        hideSpotlight();
    }

    function setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space' && !isVisible) {
                e.preventDefault();
                showSpotlight();
            }
        });
    }

    function setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle-spotlight') {
                toggleSpotlight();
                sendResponse({success: true});
            } else if (request.action === 'ping') {
                sendResponse({loaded: true});
            } else if (request.action === 'refresh-session') {
                extractNetSuiteSession();
                sendResponse({success: true});
            }
            return true;
        });
    }

    function showSpotlight() {
        if (!overlay) {
            console.error('Spotlight overlay not found');
            return;
        }
        
        isVisible = true;
        overlay.style.display = 'block';
        
        setTimeout(() => {
            const searchInput = overlay.querySelector('#spotlightSearch');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }, 100);
        
        console.log('Spotlight shown');
    }

    function hideSpotlight() {
        if (!overlay) return;
        
        isVisible = false;
        overlay.style.display = 'none';
        
        const searchInput = overlay.querySelector('#spotlightSearch');
        if (searchInput) {
            searchInput.value = '';
        }
        
        currentResults = [];
        selectedIndex = -1;
        
        const resultsContainer = overlay.querySelector('#spotlightResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div style="
                    padding: 40px 24px !important; 
                    text-align: center !important; 
                    color: #5f6368 !important; 
                    font-size: 14px !important;
                ">
                    Start typing to search NetSuite records...
                </div>
            `;
        }
    }

    function toggleSpotlight() {
        if (isVisible) {
            hideSpotlight();
        } else {
            showSpotlight();
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpotlight);
    } else {
        initSpotlight();
    }

})();