// Content script for NetSuite Spotlight Search
class NetSuiteSpotlight {
    constructor() {
        this.isVisible = false;
        this.spotlightContainer = null;
        this.overlay = null;
        this.accountId = null;
        this.baseUrl = null;
        this.authToken = null;
        
        this.init();
    }

    async init() {
        // Extract NetSuite session info
        await this.extractNetSuiteSession();
        
        // Create spotlight elements
        this.createSpotlightElements();
        
        // Listen for keyboard shortcuts
        this.setupKeyboardListeners();
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle-spotlight') {
                this.toggle();
            } else if (request.action === 'perform-search') {
                this.performSearch(request.query, request.filters);
            } else if (request.action === 'refresh-session') {
                this.extractNetSuiteSession().then(() => {
                    sendResponse({ success: true });
                });
                return true; // Indicates async response
            }
        });
    }

    async extractNetSuiteSession() {
        try {
            // Extract account ID from URL - multiple patterns
            let accountId = null;
            const hostname = window.location.hostname;
            
            // Pattern 1: 1234567.app.netsuite.com
            let urlMatch = hostname.match(/(\d+)\.app\.netsuite\.com/);
            if (urlMatch) {
                accountId = urlMatch[1];
            }
            
            // Pattern 2: system.netsuite.com or netsuite.com (legacy)
            if (!accountId && (hostname.includes('system.netsuite.com') || hostname.includes('netsuite.com'))) {
                // Try to get account from URL parameters or page content
                const urlParams = new URLSearchParams(window.location.search);
                accountId = urlParams.get('compid') || urlParams.get('account');
                
                // If not in URL, try to extract from page scripts
                if (!accountId) {
                    const scripts = document.getElementsByTagName('script');
                    for (let script of scripts) {
                        if (script.textContent) {
                            const accountMatch = script.textContent.match(/(?:compid|account)["']\s*:\s*["']([^"']+)["']/);
                            if (accountMatch) {
                                accountId = accountMatch[1];
                                break;
                            }
                        }
                    }
                }
            }

            if (accountId) {
                this.accountId = accountId;
                this.baseUrl = `https://${accountId}.suitetalk.api.netsuite.com`;
            }

            // Enhanced session token extraction
            await this.extractAuthToken();

            // Store session info
            chrome.storage.local.set({
                netsuiteSession: {
                    authenticated: !!this.authToken,
                    accountId: this.accountId,
                    baseUrl: this.baseUrl,
                    authToken: this.authToken,
                    sessionId: this.sessionId
                }
            });

            console.log('NetSuite session extracted:', {
                accountId: this.accountId,
                hasToken: !!this.authToken,
                hasSessionId: !!this.sessionId
            });

        } catch (error) {
            console.error('Failed to extract NetSuite session:', error);
        }
    }

    async extractAuthToken() {
        // Method 1: Look for NLAUTH in cookies
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'NS_ROUTING_VERSION' || name === 'JSESSIONID') {
                this.sessionId = value;
            }
        }

        // Method 2: Extract from page scripts
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.textContent && script.textContent.includes('window.require')) {
                // Look for session information in NetSuite's require config
                const sessionMatch = script.textContent.match(/session['"]\s*:\s*['""]([^"']+)['"]/);
                if (sessionMatch) {
                    this.authToken = sessionMatch[1];
                    break;
                }
            }
        }

        // Method 3: Look for CSRF tokens or other auth headers
        const metaTags = document.getElementsByTagName('meta');
        for (let meta of metaTags) {
            if (meta.name === 'csrf-token' || meta.name === '_token') {
                this.authToken = meta.content;
                break;
            }
        }

        // Method 4: Extract from window objects (NetSuite often exposes session data)
        if (window.nlExternal && window.nlExternal.session) {
            this.authToken = window.nlExternal.session;
        }

        // Method 5: Look for authentication in form inputs
        const inputs = document.querySelectorAll('input[name*="session"], input[name*="auth"], input[name*="token"]');
        for (let input of inputs) {
            if (input.value) {
                this.authToken = input.value;
                break;
            }
        }
    }

    createSpotlightElements() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'netsuite-spotlight-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 999999;
            display: none;
        `;

        // Create spotlight container
        this.spotlightContainer = document.createElement('div');
        this.spotlightContainer.innerHTML = this.getSpotlightHTML();
        this.overlay.appendChild(this.spotlightContainer);

        // Add to page
        document.body.appendChild(this.overlay);

        // Setup event listeners
        this.setupEventListeners();
    }

    getSpotlightHTML() {
        return `
            <div class="spotlight-container" style="
                position: absolute;
                top: 15vh;
                left: 50%;
                transform: translateX(-50%);
                width: 600px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                overflow: hidden;
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                animation: fadeIn 0.3s ease;
            ">
                <input type="text" class="search-input" placeholder="Search NetSuite records..." id="spotlightSearch" style="
                    width: 100%;
                    padding: 20px 24px;
                    font-size: 18px;
                    border: none;
                    outline: none;
                    background: #fbf9f8;
                    border-bottom: 1px solid #e9ecef;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ">
                
                <div class="filter-bubbles" id="spotlightFilters" style="
                    padding: 16px 24px;
                    background: #fbf9f8;
                    border-bottom: 1px solid #e9ecef;
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    min-height: 50px;
                ">
                    <div class="filter-bubble active" data-type="all">All</div>
                    <div class="filter-bubble" data-type="customer">Customers</div>
                    <div class="filter-bubble" data-type="salesorder">Sales Orders</div>
                    <div class="filter-bubble" data-type="invoice">Invoices</div>
                    <div class="filter-bubble" data-type="item">Items</div>
                    <div class="filter-bubble" data-type="employee">Employees</div>
                    <div class="filter-bubble" data-type="vendor">Vendors</div>
                    <div class="filter-bubble" data-type="contact">Contacts</div>
                </div>

                <div class="results-container" id="spotlightResults" style="
                    flex: 1;
                    overflow-y: auto;
                    max-height: 400px;
                ">
                    <div class="no-results" style="
                        padding: 40px 24px;
                        text-align: center;
                        color: #5f6368;
                        font-size: 14px;
                    ">Start typing to search NetSuite records...</div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const searchInput = this.overlay.querySelector('#spotlightSearch');
        const filterBubbles = this.overlay.querySelector('#spotlightFilters');
        const resultsContainer = this.overlay.querySelector('#spotlightResults');

        let selectedIndex = -1;
        let currentResults = [];
        let activeFilters = ['all'];
        let searchTimeout = null;

        // Search input handler with debouncing
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.performSearch(e.target.value, activeFilters);
            }, 300);
        });

        // Filter bubble handlers
        filterBubbles.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-bubble')) {
                const filterType = e.target.dataset.type;
                
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
                        activeFilters = activeFilters.filter(f => f !== filterType);
                        e.target.classList.remove('active');
                    } else {
                        activeFilters.push(filterType);
                        e.target.classList.add('active');
                    }
                    
                    if (activeFilters.length === 0) {
                        activeFilters = ['all'];
                        filterBubbles.querySelector('[data-type="all"]').classList.add('active');
                    }
                }
                
                this.performSearch(searchInput.value, activeFilters);
            }
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const results = resultsContainer.querySelectorAll('.result-item');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
                this.updateSelection(results, selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                this.updateSelection(results, selectedIndex);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && results[selectedIndex]) {
                    this.openRecord(currentResults[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                this.hide();
            }
        });

        // Click to close overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            // Cmd+Shift+K or Ctrl+Shift+K to toggle spotlight
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K' && !this.isVisible) {
                e.preventDefault();
                this.show();
            }
        });
    }

    async performSearch(query, filters) {
        if (!query || query.trim().length < 2) {
            this.displayResults([]);
            return;
        }

        const resultsContainer = this.overlay.querySelector('#spotlightResults');
        resultsContainer.innerHTML = '<div class="loading" style="padding: 20px; text-align: center;">Searching...</div>';

        try {
            const results = await this.searchNetSuite(query.trim(), filters);
            this.displayResults(results);
        } catch (error) {
            console.error('Search failed:', error);
            resultsContainer.innerHTML = '<div class="error" style="padding: 20px; text-align: center; color: #dc3545;">Search failed. Please try again.</div>';
        }
    }

    async searchNetSuite(query, filters) {
        // For development/testing - use a simplified approach first
        // This will be replaced with actual NetSuite API calls once session is working
        const results = [];
        
        try {
            // First, try to make a simple NetSuite search using the current page's context
            // We'll use NetSuite's built-in search if REST API isn't immediately available
            
            if (this.accountId) {
                // Attempt REST API call
                try {
                    const recordTypes = filters.includes('all') 
                        ? ['customer', 'salesorder', 'invoice', 'item', 'employee', 'vendor', 'contact']
                        : filters;

                    for (const recordType of recordTypes.slice(0, 3)) { // Limit to first 3 for testing
                        const typeResults = await this.searchRecordType(recordType, query);
                        results.push(...typeResults);
                    }
                } catch (apiError) {
                    console.warn('REST API search failed, falling back to mock data:', apiError);
                    // Return mock data for testing
                    return this.getMockSearchResults(query, filters);
                }
            } else {
                console.warn('No NetSuite account ID found, using mock data');
                return this.getMockSearchResults(query, filters);
            }

            // Sort results by relevance
            return results.sort((a, b) => {
                const aExact = a.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
                const bExact = b.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
                return bExact - aExact;
            });

        } catch (error) {
            console.error('NetSuite search error:', error);
            // Fallback to mock data for development
            return this.getMockSearchResults(query, filters);
        }
    }

    getMockSearchResults(query, filters) {
        // Mock data for testing when NetSuite API isn't available
        const mockData = [
            { id: 'C001', type: 'customer', title: 'Acme Corporation', subtitle: 'Enterprise Customer • Active', url: '/app/common/entity/custjob.nl?id=123' },
            { id: 'SO001', type: 'salesorder', title: 'SO-2024-001', subtitle: '$45,000 • Enterprise Package', url: '/app/accounting/transactions/salesord.nl?id=456' },
            { id: 'I001', type: 'invoice', title: 'INV-2024-001', subtitle: '$4,500 • Paid', url: '/app/accounting/transactions/custinvc.nl?id=789' },
            { id: 'ITM001', type: 'item', title: 'Premium Service', subtitle: 'SKU: PREM-001 • $99.99', url: '/app/common/item/item.nl?id=101' },
            { id: 'E001', type: 'employee', title: 'John Smith', subtitle: 'Sales Manager • john@company.com', url: '/app/common/entity/employee.nl?id=202' }
        ];

        // Filter mock data
        let filteredData = mockData;
        if (!filters.includes('all')) {
            filteredData = mockData.filter(item => filters.includes(item.type));
        }

        // Search mock data
        return filteredData.filter(item => {
            const searchableText = [item.title, item.subtitle, item.id].join(' ').toLowerCase();
            return searchableText.includes(query.toLowerCase());
        });
    }

    async searchRecordType(recordType, query) {
        // Map record types to NetSuite REST API endpoints
        const recordTypeMap = {
            'customer': 'customer',
            'salesorder': 'salesOrder',
            'invoice': 'invoice',
            'item': 'item',
            'employee': 'employee',
            'vendor': 'vendor',
            'contact': 'contact'
        };

        const netsuiteRecordType = recordTypeMap[recordType];
        if (!netsuiteRecordType) return [];

        try {
            // Build search query for NetSuite SuiteQL
            const suiteQL = this.buildSuiteQLQuery(netsuiteRecordType, query);
            
            // Make the API call
            const response = await this.makeNetSuiteAPICall('suiteql', {
                method: 'POST',
                body: JSON.stringify({ q: suiteQL }),
                headers: {
                    'Content-Type': 'application/json',
                    'Prefer': 'transient'
                }
            });

            if (response.items) {
                return response.items.map(item => this.formatSearchResult(item, recordType));
            }

        } catch (error) {
            console.error(`Search failed for ${recordType}:`, error);
        }

        return [];
    }

    buildSuiteQLQuery(recordType, query) {
        // Build SuiteQL queries for different record types
        const queries = {
            customer: `
                SELECT id, companyname, email, phone, entitystatus
                FROM customer 
                WHERE UPPER(companyname) LIKE UPPER('%${query}%') 
                   OR UPPER(email) LIKE UPPER('%${query}%')
                ORDER BY companyname
                LIMIT 20
            `,
            salesOrder: `
                SELECT id, tranid, entity, total, trandate, status
                FROM salesorder 
                WHERE UPPER(tranid) LIKE UPPER('%${query}%')
                ORDER BY trandate DESC
                LIMIT 20
            `,
            invoice: `
                SELECT id, tranid, entity, total, trandate, status
                FROM invoice 
                WHERE UPPER(tranid) LIKE UPPER('%${query}%')
                ORDER BY trandate DESC
                LIMIT 20
            `,
            item: `
                SELECT id, itemid, displayname, salesprice, quantityavailable
                FROM item 
                WHERE UPPER(itemid) LIKE UPPER('%${query}%') 
                   OR UPPER(displayname) LIKE UPPER('%${query}%')
                ORDER BY itemid
                LIMIT 20
            `,
            employee: `
                SELECT id, entityid, firstname, lastname, email, phone
                FROM employee 
                WHERE UPPER(firstname) LIKE UPPER('%${query}%') 
                   OR UPPER(lastname) LIKE UPPER('%${query}%')
                   OR UPPER(email) LIKE UPPER('%${query}%')
                ORDER BY lastname, firstname
                LIMIT 20
            `,
            vendor: `
                SELECT id, companyname, email, phone
                FROM vendor 
                WHERE UPPER(companyname) LIKE UPPER('%${query}%') 
                   OR UPPER(email) LIKE UPPER('%${query}%')
                ORDER BY companyname
                LIMIT 20
            `,
            contact: `
                SELECT id, firstname, lastname, email, phone, company
                FROM contact 
                WHERE UPPER(firstname) LIKE UPPER('%${query}%') 
                   OR UPPER(lastname) LIKE UPPER('%${query}%')
                   OR UPPER(email) LIKE UPPER('%${query}%')
                ORDER BY lastname, firstname
                LIMIT 20
            `
        };

        return queries[recordType] || '';
    }

    formatSearchResult(item, recordType) {
        // Format search results for display
        const formatters = {
            customer: (item) => ({
                id: item.id,
                type: 'customer',
                title: item.companyname || 'Unnamed Customer',
                subtitle: `${item.email || ''} • ${item.phone || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/custjob.nl?id=${item.id}`
            }),
            salesorder: (item) => ({
                id: item.id,
                type: 'salesorder',
                title: item.tranid,
                subtitle: `$${item.total || '0.00'} • ${item.trandate || ''}`,
                url: `/app/accounting/transactions/salesord.nl?id=${item.id}`
            }),
            invoice: (item) => ({
                id: item.id,
                type: 'invoice',
                title: item.tranid,
                subtitle: `$${item.total || '0.00'} • ${item.trandate || ''}`,
                url: `/app/accounting/transactions/custinvc.nl?id=${item.id}`
            }),
            item: (item) => ({
                id: item.id,
                type: 'item',
                title: item.displayname || item.itemid,
                subtitle: `SKU: ${item.itemid} • $${item.salesprice || '0.00'}`,
                url: `/app/common/item/item.nl?id=${item.id}`
            }),
            employee: (item) => ({
                id: item.id,
                type: 'employee',
                title: `${item.firstname || ''} ${item.lastname || ''}`.trim(),
                subtitle: `${item.email || ''} • ${item.phone || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/employee.nl?id=${item.id}`
            }),
            vendor: (item) => ({
                id: item.id,
                type: 'vendor',
                title: item.companyname || 'Unnamed Vendor',
                subtitle: `${item.email || ''} • ${item.phone || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/vendor.nl?id=${item.id}`
            }),
            contact: (item) => ({
                id: item.id,
                type: 'contact',
                title: `${item.firstname || ''} ${item.lastname || ''}`.trim(),
                subtitle: `${item.company || ''} • ${item.email || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/contact.nl?id=${item.id}`
            })
        };

        return formatters[recordType] ? formatters[recordType](item) : item;
    }

    async makeNetSuiteAPICall(endpoint, options = {}) {
        if (!this.baseUrl || !this.accountId) {
            throw new Error('NetSuite session not initialized');
        }

        const url = `${this.baseUrl}/services/rest/query/v1/${endpoint}`;
        
        const defaultHeaders = {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
        };

        const response = await fetch(url, {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`NetSuite API call failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    displayResults(results) {
        const resultsContainer = this.overlay.querySelector('#spotlightResults');
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results" style="padding: 40px 24px; text-align: center; color: #5f6368; font-size: 14px;">No results found</div>';
            return;
        }

        const iconMap = {
            customer: '👤',
            salesorder: '🛒',
            invoice: '📄',
            item: '📦',
            employee: '👨‍💼',
            vendor: '🏢',
            contact: '📞'
        };

        const html = results.map((item, index) => `
            <div class="result-item" data-index="${index}" style="
                padding: 12px 24px;
                border-bottom: 1px solid #f1f3f4;
                cursor: pointer;
                transition: background-color 0.15s ease;
                display: flex;
                align-items: center;
                gap: 12px;
            ">
                <div class="result-icon" style="
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    background: #325c73;
                    flex-shrink: 0;
                ">${iconMap[item.type] || '❓'}</div>
                <div class="result-content" style="flex: 1; min-width: 0;">
                    <div class="result-title" style="
                        font-weight: 500;
                        font-size: 14px;
                        color: #202124;
                        margin-bottom: 2px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">${item.title}</div>
                    <div class="result-subtitle" style="
                        font-size: 12px;
                        color: #5f6368;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">${item.subtitle}</div>
                </div>
                <div class="result-type" style="
                    font-size: 11px;
                    color: #5f6368;
                    background: #fbf9f8;
                    padding: 2px 6px;
                    border-radius: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    flex-shrink: 0;
                ">${item.type}</div>
            </div>
        `).join('');

        resultsContainer.innerHTML = html;

        // Add click handlers
        resultsContainer.querySelectorAll('.result-item').forEach((item, index) => {
            item.addEventListener('click', () => this.openRecord(results[index]));
            item.addEventListener('mouseover', () => {
                resultsContainer.querySelectorAll('.result-item').forEach(r => r.style.background = '');
                item.style.background = '#fbf9f8';
            });
        });
    }

    updateSelection(results, selectedIndex) {
        results.forEach((item, index) => {
            if (index === selectedIndex) {
                item.style.background = '#e8f1f5';
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.style.background = '';
            }
        });
    }

    openRecord(record) {
        // Open the NetSuite record
        if (record.url) {
            window.open(record.url, '_blank');
        } else {
            // Fallback - construct URL based on record type and ID
            const baseRecordUrl = window.location.origin;
            window.open(`${baseRecordUrl}${record.url}`, '_blank');
        }
        this.hide();
    }

    show() {
        if (!this.overlay) return;
        
        this.isVisible = true;
        this.overlay.style.display = 'block';
        
        // Focus search input
        setTimeout(() => {
            const searchInput = this.overlay.querySelector('#spotlightSearch');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }, 100);
    }

    hide() {
        if (!this.overlay) return;
        
        this.isVisible = false;
        this.overlay.style.display = 'none';
        
        // Clear search
        const searchInput = this.overlay.querySelector('#spotlightSearch');
        if (searchInput) {
            searchInput.value = '';
        }
        
        const resultsContainer = this.overlay.querySelector('#spotlightResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<div class="no-results" style="padding: 40px 24px; text-align: center; color: #5f6368; font-size: 14px;">Start typing to search NetSuite records...</div>';
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

// Initialize the spotlight search when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new NetSuiteSpotlight();
    });
} else {
    new NetSuiteSpotlight();
}