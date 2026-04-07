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

// Light Elements
const lightCtx = document.getElementById('lightChart');
const editorHour = document.getElementById('editorHour');
const manualInputs = document.getElementById('manualInputs');

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
        if(btn.dataset.target === 'lighting' && !lightChartInstance && lightCtx) initLightChart();
    });
});

// Init
if(dateInput) dateInput.valueAsDate = new Date();
if(saveEntryBtn) saveEntryBtn.addEventListener('click', submitLog);
if(refreshBtn) refreshBtn.addEventListener('click', () => loadData(true));
if(calcBtn) calcBtn.addEventListener('click', calculateDosing);

// --- ADD THIS LISTENER ---
chartCheckboxes.forEach(cb => {
    cb.addEventListener('change', (e) => {
        if(!chartInstance) return;
        const idx = parseInt(e.target.dataset.idx);
        // Toggle visibility in Chart.js using the checkbox's index
        chartInstance.setDatasetVisibility(idx, e.target.checked);
        chartInstance.update();
    });
});

// Salt Mix
if(btnMix) {
    btnMix.addEventListener('click', () => {
        const vol = parseFloat(mixVol.value), sg = parseFloat(mixTarget.value);
        if(!vol || !sg) return;
        const totalGrams = vol * 145 * ((sg - 1) / 0.026);
        resGrams.innerText = Math.round(totalGrams);
        resCups.innerText = (totalGrams / 280).toFixed(2);
        mixResult.style.display = 'block';
    });
}

// Lighting Logic (Restored)
function initLightChart() {
    if(lightChartInstance) lightChartInstance.destroy();
    const hours = Array.from({length: 24}, (_, i) => i + ":00");
    lightChartInstance = new Chart(lightCtx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                { label: 'White', data: new Array(24).fill(0), borderColor: '#fcd34d' },
                { label: 'Blue', data: new Array(24).fill(0), borderColor: '#0096ff' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// Load & Render
async function loadData(force) {
    if(!statusDisplay) return;
    statusDisplay.innerHTML = `<div class="spinner"></div>`;
    try {
        const d = await (await fetch(API_URL)).json();
        logs = d.map(i => ({
            date: formatDate(i.date), alk: toNum(i.alk), ca: toNum(i.ca), mg: toNum(i.mg),
            no3: toNum(i.no3), po4: toNum(i.po4), ph: toNum(i.ph)
        })).filter(i => i.date !== '-').sort((a,b) => new Date(a.date) - new Date(b.date));
        renderAll();
    } catch(e) { statusDisplay.innerHTML = 'Error Loading Data'; }
}

async function submitLog() {
    const entry = {
        date: dateInput.value, alk: document.getElementById('alk').value, ca: document.getElementById('ca').value,
        mg: document.getElementById('mg').value, no3: document.getElementById('no3').value,
        po4: document.getElementById('po4').value, ph: document.getElementById('ph').value
    };
    await fetch(API_URL, { method:'POST', mode:'no-cors', body:JSON.stringify(entry) });
    loadData(true);
}

function renderAll() {
    if(!logs.length) return;
    const l = logs[logs.length-1];
    statusDisplay.innerHTML = `
        <div class="status-box ${getStatusClass('alk',l.alk)}">Alk: ${l.alk??'?'}</div>
        <div class="status-box ${getStatusClass('ca',l.ca)}">Ca: ${l.ca??'?'}</div>
        <div class="status-box ${getStatusClass('no3',l.no3)}">NO3: ${l.no3??'?'}</div>`;

    historyTbody.innerHTML = [...logs].slice().reverse().map(i => `
        <tr><td>${i.date}</td><td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td>${i.mg??'-'}</td><td>${i.no3??'-'}</td><td>${i.po4??'-'}</td><td>${i.ph??'-'}</td></tr>`).join('');

    // Re-init the Trend Chart
    if(chartInstance) chartInstance.destroy();
    
    // 1. Build all 6 datasets (matching the HTML data-idx order 0-5)
    const allDatasets = [
        { label: 'Alk', data: logs.map(x=>x.alk), borderColor: '#06b6d4', yAxisID: 'yAlk' },
        { label: 'Ca',  data: logs.map(x=>x.ca),  borderColor: '#a855f7', yAxisID: 'yCa' },
        { label: 'Mg',  data: logs.map(x=>x.mg),  borderColor: '#f97316', yAxisID: 'yMg' },
        { label: 'NO3', data: logs.map(x=>x.no3), borderColor: '#22c55e', yAxisID: 'yNo3' },
        { label: 'PO4', data: logs.map(x=>x.po4), borderColor: '#78716c', yAxisID: 'yPo4' },
        { label: 'pH',  data: logs.map(x=>x.ph),  borderColor: '#ef4444', yAxisID: 'yPh' }
    ];

    // 2. Read the checkboxes to see what should be hidden on initial load
    chartCheckboxes.forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        allDatasets[idx].hidden = !cb.checked;
    });

    chartInstance = new Chart(tankCtx, {
        type: 'line',
        data: {
            labels: logs.map(x=>x.date),
            datasets: allDatasets
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            // 👇 ADD THIS PLUGINS BLOCK 👇
            plugins: {
                legend: {
                    display: false 
                }
            },
            // 👆 ======================= 👆
            scales: { 
                yAlk: { position:'left' }, 
                yCa:  { position:'right', grid:{drawOnChartArea:false} },
                yMg:  { position:'right', display:false }, 
                yNo3: { position:'left', display:false },
                yPo4: { position:'right', display:false },
                yPh:  { position:'left', display:false }
            }
        }
    });
}

// --- 🧪 THE FIXED CALCULATOR LOGIC ---
function calculateDosing() {
    const cur = toNum(calcCurrentCaInput.value), tgt = toNum(calcTargetCaInput.value);
    if(!cur || !tgt) return alert("Enter Calcium values");

    const p1Curr = toNum(document.getElementById('currP1').value) || 0;
    const p2Curr = toNum(document.getElementById('currP2').value) || 0;
    const p3Curr = toNum(document.getElementById('currP3').value) || 0;
    const p4Curr = toNum(document.getElementById('currP4').value) || 0;
    
    let trueConsumptionPpm = 0;
    const cl = logs.filter(l => l.ca != null).sort((a,b) => new Date(a.date) - new Date(b.date));
    
    if(cl.length >= 2) {
        const n = cl[cl.length-1], o = cl[cl.length-2];
        const days = Math.max(1, Math.abs((new Date(n.date) - new Date(o.date)) / 8.64e7));
        
        // 1. Calculate the raw change in ppm
        const rawPpmChange = (o.ca - n.ca); // e.g., 394 - 413 = -19
        
        // 2. Add back what the doser supplied (1.4ppm per ml per 100L)
        const ppmDosedPerDay = p1Curr * CA_IMPACT_FACTOR;
        const totalPpmAddedByDoser = ppmDosedPerDay * days;
        
        // 3. True Consumption = (What went missing + what we added) / days
        trueConsumptionPpm = (rawPpmChange + totalPpmAddedByDoser) / days;
    }

    // New Daily Dose to maintain stability
    const newP1 = Math.max(0, trueConsumptionPpm / CA_IMPACT_FACTOR);
    
    // Scale Trace parts proportionally (Red Sea Ratios: 1 : 2 : 0.5 : 0.5)
    const newP2 = newP1 * 2.0;
    const newP3 = newP1 * 0.5;
    const newP4 = newP1 * 0.5;

    const gap = tgt - cur;
    const corrToday = (gap / CA_IMPACT_FACTOR);

    calcResults.style.display = 'block';
    calcResults.innerHTML = `
        <h3 style="color:#f1f5f9;">🧪 True Consumption Update</h3>
        <p style="font-size:0.9em; color:#94a3b8;">True Daily Uptake: <b>${trueConsumptionPpm.toFixed(1)} ppm/day</b></p>
        <div style="margin-top:10px; padding:10px; border:1px dashed #475569; border-radius:8px;">
            <h4 style="margin:0 0 5px 0; color:#38bdf8;">📱 Suggested Blenny Settings</h4>
            <div style="font-family:monospace; color:#cbd5e1; font-size:1.1em; display:grid; grid-template-columns: 1fr 1fr;">
                <div>P1 (Ca): <b>${newP1.toFixed(1)}</b></div>
                <div>P2 (Alk): <b>${newP2.toFixed(1)}</b></div>
                <div>P3 (Tr): <b>${newP3.toFixed(1)}</b></div>
                <div>P4 (Tr): <b>${newP4.toFixed(1)}</b></div>
            </div>
            <p style="margin:10px 0 0 0; font-size:0.8em; color:#94a3b8;">
                One-time Adjustment: <b>${corrToday.toFixed(1)}mL</b> Part 1.
            </p>
        </div>`;
}

loadData();
