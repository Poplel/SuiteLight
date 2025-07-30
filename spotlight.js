// External spotlight script to avoid CSP violations
class NetSuiteSpotlight {
    constructor() {
        this.isVisible = false;
        this.spotlightContainer = null;
        this.overlay = null;
        this.accountId = null;
        this.baseUrl = null;
        this.authToken = null;
        this.sessionId = null;
        
        this.init();
    }

    async init() {
        // Create spotlight elements first
        this.createSpotlightElements();
        
        // Setup keyboard listeners
        this.setupKeyboardListeners();
        
        // Extract NetSuite session info with retry
        await this.extractNetSuiteSessionWithRetry();
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle-spotlight') {
                this.toggle();
                sendResponse({success: true});
            } else if (request.action === 'perform-search') {
                this.performSearch(request.query, request.filters);
                sendResponse({success: true});
            } else if (request.action === 'refresh-session') {
                this.extractNetSuiteSessionWithRetry().then(() => {
                    sendResponse({ success: true });
                });
                return true; // Indicates async response
            } else if (request.action === 'ping') {
                // Respond to ping to indicate content script is loaded
                sendResponse({loaded: true});
            }
        });
    }

    async extractNetSuiteSessionWithRetry() {
        // Try immediately
        await this.extractNetSuiteSession();
        
        // If no session found, try again after a short delay (page might still be loading)
        if (!this.accountId && !this.authToken) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.extractNetSuiteSession();
        }
        
        // One more try after longer delay
        if (!this.accountId && !this.authToken) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.extractNetSuiteSession();
        }
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
        this.overlay.className = 'netsuite-spotlight-overlay';

        // Create spotlight container with external HTML
        this.spotlightContainer = document.createElement('div');
        this.spotlightContainer.innerHTML = this.getSpotlightHTML();
        this.overlay.appendChild(this.spotlightContainer);

        // Add to page
        document.body.appendChild(this.overlay);

        // Setup event listeners using external methods
        this.setupSpotlightEventListeners();
    }

    getSpotlightHTML() {
        return `
            <div class="spotlight-container">
                <input type="text" class="search-input" placeholder="Search NetSuite records..." id="spotlightSearch">
                
                <div class="filter-bubbles" id="spotlightFilters">
                    <div class="filter-bubble active" data-type="all">All</div>
                    <div class="filter-bubble" data-type="customer">Customers</div>
                    <div class="filter-bubble" data-type="salesorder">Sales Orders</div>
                    <div class="filter-bubble" data-type="invoice">Invoices</div>
                    <div class="filter-bubble" data-type="item">Items</div>
                    <div class="filter-bubble" data-type="employee">Employees</div>
                    <div class="filter-bubble" data-type="vendor">Vendors</div>
                    <div class="filter-bubble" data-type="contact">Contacts</div>
                </div>

                <div class="results-container" id="spotlightResults">
                    <div class="no-results">Start typing to search NetSuite records...</div>
                </div>
            </div>
        `;
    }

    setupSpotlightEventListeners() {
        const searchInput = this.overlay.querySelector('#spotlightSearch');
        const filterBubbles = this.overlay.querySelector('#spotlightFilters');
        const resultsContainer = this.overlay.querySelector('#spotlightResults');

        let selectedIndex = -1;
        let currentResults = [];
        let activeFilters = ['all'];
        let searchTimeout = null;

        // Store references for event handlers
        this.currentResults = currentResults;
        this.selectedIndex = selectedIndex;
        this.activeFilters = activeFilters;

        // Search input handler with debouncing
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.performSearch(e.target.value, this.activeFilters);
            }, 300);
        });

        // Filter bubble handlers
        filterBubbles.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-bubble')) {
                this.handleFilterClick(e.target, filterBubbles, searchInput);
            }
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e, resultsContainer);
        });

        // Click to close overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });
    }

    handleFilterClick(target, filterBubbles, searchInput) {
        const filterType = target.dataset.type;
        
        if (filterType === 'all') {
            this.activeFilters = ['all'];
            filterBubbles.querySelectorAll('.filter-bubble').forEach(bubble => {
                bubble.classList.toggle('active', bubble.dataset.type === 'all');
            });
        } else {
            if (this.activeFilters.includes('all')) {
                this.activeFilters = [];
                filterBubbles.querySelector('[data-type="all"]').classList.remove('active');
            }
            
            if (this.activeFilters.includes(filterType)) {
                this.activeFilters = this.activeFilters.filter(f => f !== filterType);
                target.classList.remove('active');
            } else {
                this.activeFilters.push(filterType);
                target.classList.add('active');
            }
            
            if (this.activeFilters.length === 0) {
                this.activeFilters = ['all'];
                filterBubbles.querySelector('[data-type="all"]').classList.add('active');
            }
        }
        
        this.performSearch(searchInput.value, this.activeFilters);
    }

    handleKeyboardNavigation(e, resultsContainer) {
        const results = resultsContainer.querySelectorAll('.result-item');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, results.length - 1);
            this.updateSelection(results, this.selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
            this.updateSelection(results, this.selectedIndex);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.selectedIndex >= 0 && this.currentResults[this.selectedIndex]) {
                this.openRecord(this.currentResults[this.selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            // Cmd+Shift+Space or Ctrl+Shift+Space to toggle spotlight
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space' && !this.isVisible) {
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
        resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

        try {
            const results = await this.searchNetSuite(query.trim(), filters);
            this.currentResults = results;
            this.selectedIndex = -1;
            this.displayResults(results);
        } catch (error) {
            console.error('Search failed:', error);
            resultsContainer.innerHTML = '<div class="error">Search failed. Please try again.</div>';
        }
    }

    async searchNetSuite(query, filters) {
        const results = [];
        
        try {
            // Use NetSuite's built-in search functionality instead of REST API
            // This works within the NetSuite environment without CORS issues
            
            const recordTypes = filters.includes('all') 
                ? ['customer', 'salesorder', 'invoice', 'item', 'employee', 'vendor', 'contact']
                : filters;

            // Search each record type using NetSuite's internal search
            for (const recordType of recordTypes) {
                const typeResults = await this.searchNetSuiteRecordType(recordType, query);
                results.push(...typeResults);
            }

            // Sort results by relevance
            return results.sort((a, b) => {
                const aExact = a.title.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0;
                const bExact = b.title.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0;
                return bExact - aExact;
            });

        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    async searchNetSuiteRecordType(recordType, query) {
        try {
            // Try to use NetSuite's global search or window.require if available
            if (window.require && window.require.defined && window.require.defined('N/search')) {
                return await this.useNetSuiteSearchAPI(recordType, query);
            }
            
            // Fallback: Use NetSuite's page DOM to extract search results
            return await this.searchUsingNetSuitePage(recordType, query);
            
        } catch (error) {
            console.error(`Search failed for ${recordType}:`, error);
            return [];
        }
    }

    async useNetSuiteSearchAPI(recordType, query) {
        return new Promise((resolve) => {
            try {
                window.require(['N/search'], (search) => {
                    try {
                        // Map our record types to NetSuite record types
                        const recordTypeMap = {
                            'customer': search.Type.CUSTOMER,
                            'salesorder': search.Type.SALES_ORDER,
                            'invoice': search.Type.INVOICE,
                            'item': search.Type.ITEM,
                            'employee': search.Type.EMPLOYEE,
                            'vendor': search.Type.VENDOR,
                            'contact': search.Type.CONTACT
                        };

                        const nsRecordType = recordTypeMap[recordType];
                        if (!nsRecordType) {
                            resolve([]);
                            return;
                        }

                        // Create search filters based on record type
                        const filters = [];
                        
                        if (recordType === 'customer' || recordType === 'vendor') {
                            filters.push(['companyname', 'contains', query]);
                            filters.push('OR', ['email', 'contains', query]);
                        } else if (recordType === 'salesorder' || recordType === 'invoice') {
                            filters.push(['tranid', 'contains', query]);
                        } else if (recordType === 'item') {
                            filters.push(['itemid', 'contains', query]);
                            filters.push('OR', ['displayname', 'contains', query]);
                        } else if (recordType === 'employee' || recordType === 'contact') {
                            filters.push(['firstname', 'contains', query]);
                            filters.push('OR', ['lastname', 'contains', query]);
                            filters.push('OR', ['email', 'contains', query]);
                        }

                        // Create and run the search
                        const searchObj = search.create({
                            type: nsRecordType,
                            filters: filters,
                            columns: this.getSearchColumns(recordType)
                        });

                        const searchResults = [];
                        searchObj.run().each((result) => {
                            searchResults.push(result);
                            return searchResults.length < 20; // Limit to 20 results
                        });

                        // Format the results
                        const formattedResults = searchResults.map(result => 
                            this.formatNetSuiteSearchResult(result, recordType)
                        );
                        
                        resolve(formattedResults);

                    } catch (searchError) {
                        console.error('NetSuite search API error:', searchError);
                        resolve([]);
                    }
                });
                
            } catch (requireError) {
                console.error('NetSuite require error:', requireError);
                resolve([]);
            }
        });
    }

    getSearchColumns(recordType) {
        // Define which columns to retrieve for each record type
        const columnMap = {
            'customer': ['companyname', 'email', 'phone', 'entitystatus'],
            'salesorder': ['tranid', 'entity', 'total', 'trandate', 'status'],
            'invoice': ['tranid', 'entity', 'total', 'trandate', 'status'],
            'item': ['itemid', 'displayname', 'salesprice', 'quantityavailable'],
            'employee': ['firstname', 'lastname', 'email', 'phone', 'title'],
            'vendor': ['companyname', 'email', 'phone'],
            'contact': ['firstname', 'lastname', 'email', 'phone', 'company']
        };

        return columnMap[recordType] || ['id'];
    }

    formatNetSuiteSearchResult(result, recordType) {
        // Format NetSuite search results for display
        const getValue = (column) => {
            try {
                const value = result.getValue(column);
                return value && value.value ? value.value : value;
            } catch (e) {
                return '';
            }
        };

        const getText = (column) => {
            try {
                return result.getText(column) || getValue(column);
            } catch (e) {
                return getValue(column);
            }
        };

        const id = result.id;
        
        const formatters = {
            customer: () => ({
                id: id,
                type: 'customer',
                title: getValue('companyname') || 'Unnamed Customer',
                subtitle: `${getValue('email') || ''} • ${getValue('phone') || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/custjob.nl?id=${id}`
            }),
            salesorder: () => ({
                id: id,
                type: 'salesorder',
                title: getValue('tranid'),
                subtitle: `$${getValue('total') || '0.00'} • ${getValue('trandate') || ''}`,
                url: `/app/accounting/transactions/salesord.nl?id=${id}`
            }),
            invoice: () => ({
                id: id,
                type: 'invoice',
                title: getValue('tranid'),
                subtitle: `$${getValue('total') || '0.00'} • ${getValue('trandate') || ''}`,
                url: `/app/accounting/transactions/custinvc.nl?id=${id}`
            }),
            item: () => ({
                id: id,
                type: 'item',
                title: getValue('displayname') || getValue('itemid'),
                subtitle: `SKU: ${getValue('itemid')} • $${getValue('salesprice') || '0.00'}`,
                url: `/app/common/item/item.nl?id=${id}`
            }),
            employee: () => ({
                id: id,
                type: 'employee',
                title: `${getValue('firstname') || ''} ${getValue('lastname') || ''}`.trim(),
                subtitle: `${getValue('email') || ''} • ${getValue('phone') || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/employee.nl?id=${id}`
            }),
            vendor: () => ({
                id: id,
                type: 'vendor',
                title: getValue('companyname') || 'Unnamed Vendor',
                subtitle: `${getValue('email') || ''} • ${getValue('phone') || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/vendor.nl?id=${id}`
            }),
            contact: () => ({
                id: id,
                type: 'contact',
                title: `${getValue('firstname') || ''} ${getValue('lastname') || ''}`.trim(),
                subtitle: `${getValue('company') || ''} • ${getValue('email') || ''}`.replace(/^• |• $/, ''),
                url: `/app/common/entity/contact.nl?id=${id}`
            })
        };

        return formatters[recordType] ? formatters[recordType]() : { id, type: recordType, title: 'Unknown', subtitle: '', url: '' };
    }

    async searchUsingNetSuitePage(recordType, query) {
        // Fallback method: Try to use NetSuite's global search functionality
        try {
            // Look for NetSuite's global search elements
            const globalSearch = document.querySelector('input[name="globalSearch"], input[id*="search"], input[placeholder*="search" i]');
            
            if (globalSearch) {
                // This is a more complex implementation that would simulate using NetSuite's search
                // For now, return empty array to avoid errors
                console.log(`Would search NetSuite for ${recordType}: ${query}`);
                return [];
            }
            
            return [];
            
        } catch (error) {
            console.error('Page search error:', error);
            return [];
        }
    }

    displayResults(results) {
        const resultsContainer = this.overlay.querySelector('#spotlightResults');
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
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
            <div class="result-item" data-index="${index}">
                <div class="result-icon">${iconMap[item.type] || '❓'}</div>
                <div class="result-content">
                    <div class="result-title">${item.title}</div>
                    <div class="result-subtitle">${item.subtitle}</div>
                </div>
                <div class="result-type">${item.type}</div>
            </div>
        `).join('');

        resultsContainer.innerHTML = html;

        // Add click handlers
        resultsContainer.querySelectorAll('.result-item').forEach((item, index) => {
            item.addEventListener('click', () => this.openRecord(results[index]));
            item.addEventListener('mouseover', () => {
                resultsContainer.querySelectorAll('.result-item').forEach(r => r.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedIndex = index;
            });
        });
    }

    updateSelection(results, selectedIndex) {
        results.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });

        if (selectedIndex >= 0 && results[selectedIndex]) {
            results[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
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
            resultsContainer.innerHTML = '<div class="no-results">Start typing to search NetSuite records...</div>';
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