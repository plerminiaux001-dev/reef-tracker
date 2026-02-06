// --- 🕵️ ENVIRONMENT DETECTION 🕵️ ---
(function checkEnvironment() {
    const isDev = window.location.hostname.includes('dev--');
    const titleHeader = document.getElementById('appTitle');
    if (isDev) {
        document.title = '(DEV) Reef Command Center';
        if (titleHeader) {
            titleHeader.innerHTML = '🚧 DEV: 389 Reef Command Center';
            titleHeader.style.color = '#d63384';
        }
    }
})();

// --- ⬇️ CONFIGURATION AREA ⬇️ ---
const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_GAL = 35;
const TANK_LITERS = TANK_GAL * 3.78541;
const CA_IMPACT_PER_100L = 1.4; 
const CA_IMPACT_FACTOR = CA_IMPACT_PER_100L * (100 / TANK_LITERS); 

// Track current dosing to calculate "True Uptake"
const P1_CURRENT = 4.0; // Your current P1 setting during the drop

const RANGES = {
    alk: { min: 8.0, max: 10.0 }, ca: { min: 400, max: 460 }, mg: { min: 1250, max: 1450 },
    no3: { min: 1, max: 15 }, po4: { min: 0.02, max: 0.1 }, ph: { min: 8.0, max: 8.4 }
};

let logs = [];
let chartInstance = null;
let lightChartInstance = null;

// Elements
const statusDisplay = document.getElementById('statusDisplay');
const historyTbody = document.querySelector('#historyTable tbody');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const refreshBtn = document.getElementById('refreshBtn');
const calcBtn = document.getElementById('calcBtn');
const calcResults = document.getElementById('calc-results');
const dateInput = document.getElementById('date');
const calcCurrentCaInput = document.getElementById('calcCurrentCa');
const calcTargetCaInput = document.getElementById('calcTargetCa');
const tankCtx = document.getElementById('tankChart').getContext('2d');
const chartCheckboxes = document.querySelectorAll('.chart-check-label input');

const btnMix = document.getElementById('btnMix');
const mixVol = document.getElementById('mixVol');
const mixTarget = document.getElementById('mixTarget');
const mixResult = document.getElementById('mixResult');
const resGrams = document.getElementById('resGrams');
const resCups = document.getElementById('resCups');

// Helpers
const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const formatDate = s => {
    if(!s) return '-';
    let clean = s.toString().split('T')[0];
    const p = clean.split('-');
    return p.length===3 ? `${p[1]}/${p[2]}/${p[0]}` : clean;
};
const getStatusClass = (t, v) => {
    if(v==null) return '';
    const r = RANGES[t]; if(!r) return '';
    if(v>=r.min && v<=r.max) return 'good';
    const b = (r.max-r.min)*0.5;
    return (v>=r.min-b && v<=r.max+b) ? 'warn' : 'bad';
};

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const target = document.getElementById(btn.dataset.target);
        if(target) target.classList.add('active');
        btn.classList.add('active');
    });
});

// Init
if(dateInput) dateInput.valueAsDate = new Date();
if(saveEntryBtn) saveEntryBtn.addEventListener('click', submitLog);
if(refreshBtn) refreshBtn.addEventListener('click', () => loadData(true));
if(calcBtn) calcBtn.addEventListener('click', calculateDosing);

// Load Data
async function loadData(force) {
    if(!statusDisplay) return;
    if(logs.length===0 || force) statusDisplay.innerHTML = `<div style="grid-column:span 3;text-align:center;"><div class="spinner"></div></div>`;
    try {
        const d = await (await fetch(API_URL)).json();
        logs = d.map(i => ({
            date: formatDate(i.date),
            alk: toNum(i.alk), ca: toNum(i.ca), mg: toNum(i.mg),
            no3: toNum(i.no3), po4: toNum(i.po4), ph: toNum(i.ph)
        })).filter(i => i.date !== '-').sort((a,b) => new Date(a.date) - new Date(b.date));
        renderAll();
    } catch(e) { statusDisplay.innerHTML = '<div class="status-box bad">Connection Failed</div>'; }
}

async function submitLog() {
    const btn = saveEntryBtn; const txt = btn.innerText;
    btn.innerText = "Saving..."; btn.disabled = true;
    const rawD = (dateInput.value||'').trim();
    const entry = {
        date: rawD, alk: document.getElementById('alk').value, ca: document.getElementById('ca').value,
        mg: document.getElementById('mg').value, no3: document.getElementById('no3').value,
        po4: document.getElementById('po4').value, ph: document.getElementById('ph').value
    };
    try { await fetch(API_URL, { method:'POST', mode:'no-cors', body:JSON.stringify(entry) }); } 
    catch(e) { console.error(e); }
    logs.push({ date: formatDate(rawD), alk: toNum(entry.alk), ca: toNum(entry.ca), mg: toNum(entry.mg) });
    renderAll();
    btn.innerText=txt; btn.disabled=false;
}

function renderAll() {
    if(!logs.length) return;
    const l = logs[logs.length-1];
    statusDisplay.innerHTML = `
        <div class="status-box ${getStatusClass('alk',l.alk)}">Alk: ${l.alk??'?'}</div>
        <div class="status-box ${getStatusClass('ca',l.ca)}">Ca: ${l.ca??'?'}</div>
        <div class="status-box ${getStatusClass('no3',l.no3)}">NO3: ${l.no3??'?'}</div>`;
    
    if(calcCurrentCaInput && l.ca) calcCurrentCaInput.value = l.ca;

    historyTbody.innerHTML = [...logs].slice().reverse().map(i => `
        <tr><td>${i.date}</td><td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td>${i.mg??'-'}</td><td>${i.no3??'-'}</td><td>${i.po4??'-'}</td><td>${i.ph??'-'}</td></tr>`
    ).join('');
}

// --- 🧪 THE CALCULATOR LOGIC ---
function calculateDosing() {
    const cur = toNum(calcCurrentCaInput.value), tgt = toNum(calcTargetCaInput.value);
    if(!cur || !tgt) return alert("Enter Calcium values");
    
    let drop = 0, maintP1 = P1_CURRENT;
    const cl = logs.filter(l => l.ca != null);
    
    // 1. Calculate True Uptake (Maintenance)
    if(cl.length >= 2) {
        const n = cl[cl.length-1], o = cl[cl.length-2];
        const days = Math.abs((new Date(n.date) - new Date(o.date)) / (8.64e7)) || 1;
        drop = (o.ca - n.ca) / days; // ppm per day drop
        
        // True maintenance dose = (Daily Drop / Impact) + Current Dose
        maintP1 = (drop / CA_IMPACT_FACTOR) + P1_CURRENT;
    }

    // 2. Calculate Correction (Gap)
    const gap = tgt - cur;
    const totalCorrNeeded = gap > 2 ? (gap / CA_IMPACT_FACTOR) : 0;
    const daysToSplit = gap > 20 ? 3 : 1;
    const corrToday = totalCorrNeeded / daysToSplit;

    // 3. Define Pump Settings
    const pump1 = Math.max(0, maintP1);
    const pump2 = pump1 * 2.0;
    const pump3 = pump1 * 0.5;
    const pump4 = pump1 * 0.5;

    calcResults.style.display = 'block';
    calcResults.innerHTML = `
        <h3 style="color:#f1f5f9;">🧪 Calculated Plan</h3>
        <p style="font-size:0.9em; color:#94a3b8;">Consumption: <b>${drop.toFixed(1)} ppm/day</b></p>
        
        <div style="display:grid; grid-template-columns:1fr auto; gap:8px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
            <div style="color:#cbd5e1;">Base Part 1 (Ca)</div><div style="font-weight:bold; color:#a855f7;">${pump1.toFixed(1)} mL</div>
            <div style="color:#cbd5e1;">Base Part 2 (Alk)</div><div style="color:#38bdf8;">${pump2.toFixed(1)} mL</div>
        </div>

        <div style="margin-top:15px; padding:10px; border:1px dashed #475569; border-radius:8px;">
            <h4 style="margin:0 0 5px 0; color:#38bdf8; text-transform:uppercase;">📱 Blenny Pump Settings</h4>
            <div style="font-family:monospace; color:#cbd5e1;">
                P1: ${pump1.toFixed(1)} | P2: ${pump2.toFixed(1)} | P3: ${pump3.toFixed(1)} | P4: ${pump4.toFixed(1)}
            </div>
            <p style="margin:5px 0 0 0; font-size:0.8em; color:#94a3b8;">
                Manual Boost: <b>${corrToday.toFixed(1)}mL</b> Part 1 today.
            </p>
        </div>`;
}

loadData();
