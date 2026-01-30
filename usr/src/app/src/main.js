// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
// Crawlee - web scraping and browser automation library (Read more at https://crawlee.dev)
import { CheerioCrawler, Dataset } from 'crawlee';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Structure of input is defined in input_schema.json
const { startUrls = ['https://www.zillow.com/homes/for_sale/'], maxRequestsPerCrawl = 100 } = (await Actor.getInput()) ?? {};

// Proxy configuration to rotate IP addresses and prevent blocking (https://docs.apify.com/platform/proxy)
const proxyConfiguration = await Actor.createProxyConfiguration();

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler({ enqueueLinks, request, $, log }) {
        log.info('Processing', { url: request.loadedUrl });

        // Enqueue more property pages and listing pages found on search results
        await enqueueLinks({
            globs: ['**/homedetails/**', '**/homes/*', '**/b/*', '**/for_sale/**', '**/homes/for_sale/**'],
        });

        const url = request.loadedUrl ?? request.url;

        // Simple heuristic: if URL looks like a property details page, try to extract metadata.
        // Note: Zillow heavily uses client-side JS; this Cheerio example works only when required fields are present in server response.
        if (/homedetails|\/b\/|\/homes\/\d+/.test(url) || url.includes('/homedetails/')) {
            try {
                // Example selectors — may need updates for Zillow's current HTML structure.
                const address = $('h1').first().text().trim() || $('h1.ds-address-container').text().trim();
                const price = $('[data-testid="price"]').first().text().trim() || $('span.ds-value').first().text().trim();
                const beds = $('[data-testid="bed-bath-beyond"] li').first().text().trim() || $('span.ds-bed-bath-living-area').first().text().trim();
                // Cleanbeds/baths/area parsing may be needed; this is a starter approach.
                const zpidMatch = url.match(/\/(\d+)_zpid/) || url.match(/homedetails\/[^/]+\/(\d+)_zpid/);
                const zpid = zpidMatch ? zpidMatch[1] : '';
                const area = $('span.ds-home-fact-value').filter((i, el) => $(el).text().includes('sqft')).text().trim();

                log.info('Extracted (partial)', { address, price, zpid });

                await Dataset.pushData({
                    address,
                    price,
                    beds,
                    baths: '', // placeholder; refine selectors if needed
                    area,
                    zpid,
                    url,
                });
            } catch (err) {
                log.warning('Extraction failed for page', { url, error: err.message });
            }
        } else {
            log.debug('Not a property page; skipping structured extraction', { url });
        }
    },
});

await crawler.run(startUrls);

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
