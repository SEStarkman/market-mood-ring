const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

exports.marketData = async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cache-Control', 'public, max-age=60');
    
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
        const [spxRaw, vixRaw] = await Promise.all([
            fetchUrl('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d'),
            fetchUrl('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d'),
        ]);

        const spx = JSON.parse(spxRaw);
        const vix = JSON.parse(vixRaw);
        
        const spxMeta = spx.chart.result[0].meta;
        const vixMeta = vix.chart.result[0].meta;
        
        res.json({
            spx: {
                price: spxMeta.regularMarketPrice,
                prevClose: spxMeta.chartPreviousClose,
                change: ((spxMeta.regularMarketPrice - spxMeta.chartPreviousClose) / spxMeta.chartPreviousClose * 100),
            },
            vix: {
                value: vixMeta.regularMarketPrice,
            },
            ts: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
