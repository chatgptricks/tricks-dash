const base = process.env.PROMOS_BASE_URL || 'http://127.0.0.1:4175';
const response = await fetch(`${base}/promos.html`);
if (!response.ok) throw new Error(`Promos page returned ${response.status}`);
const html = await response.text();
if (!html.includes('<title>Promos · sentientdash.app</title>')) throw new Error('Unexpected Promos title');
if (!html.includes('/src/promos.jsx') && !html.includes('assets/promos-')) throw new Error('Promos entry is missing');
console.log('Promos smoke passed');
