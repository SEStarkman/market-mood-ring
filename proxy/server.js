const http = require('http');
const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        }).on('error', reject);
    });
}

let cache = null;
let cacheTime = 0;

async function getData() {
    if (cache && Date.now() - cacheTime < 60000) return cache;
    const [spxData, vixData] = await Promise.all([
        fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d'),
        fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d'),
    ]);
    const spxMeta = spxData.chart.result[0].meta;
    const vixMeta = vixData.chart.result[0].meta;
    cache = {
        spx: { price: spxMeta.regularMarketPrice, prevClose: spxMeta.chartPreviousClose,
               change: ((spxMeta.regularMarketPrice - spxMeta.chartPreviousClose) / spxMeta.chartPreviousClose * 100) },
        vix: { value: vixMeta.regularMarketPrice },
        ts: new Date().toISOString(),
    };
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
