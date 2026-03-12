const http = require('http');
const https = require('https');

function fetchRaw(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function fetchJson(url) {
    return fetchRaw(url).then(d => JSON.parse(d));
}

let cache = null;
let cacheTime = 0;

async function getData() {
    if (cache && Date.now() - cacheTime < 120000) return cache; // 2 min cache

    const symbols = {
        spx: '%5EGSPC', vix: '%5EVIX', gold: 'GC%3DF', dxy: 'DX-Y.NYB', tnx: '%5ETNX',
    };

    const marketFetches = Object.entries(symbols).map(async ([key, sym]) => {
        try {
            const data = await fetchJson(
                `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`
            );
            const meta = data.chart.result[0].meta;
            return [key, {
                price: meta.regularMarketPrice,
                prevClose: meta.chartPreviousClose,
                change: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100),
            }];
        } catch (e) { return [key, { error: e.message }]; }
    });

    // Fetch news from GDELT
    let news = [];
    try {
        const raw = await fetchRaw(
            'https://api.gdeltproject.org/api/v2/doc/doc?query=(stocks%20OR%20market%20OR%20economy%20OR%20inflation%20OR%20tariff%20OR%20fed)%20sourcelang:english&mode=ArtList&maxrecords=10&format=json&timespan=24h'
        );
        const parsed = JSON.parse(raw);
        if (parsed.articles) {
            news = parsed.articles.map(a => ({
                title: a.title || '',
                url: a.url || '',
                domain: a.domain || '',
                date: a.seendate || '',
            }));
        }
    } catch (e) {
        console.error('GDELT error:', e.message);
    }

    const results = await Promise.all(marketFetches);
    cache = { ts: new Date().toISOString(), news: news };
    for (const [key, val] of results) cache[key] = val;
    cacheTime = Date.now();
    return cache;
}

http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
        const data = await getData();
        res.writeHead(200); res.end(JSON.stringify(data));
    } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
}).listen(3001, '127.0.0.1', () => console.log('Market proxy on :3001'));
