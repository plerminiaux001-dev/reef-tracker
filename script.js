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

const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const formatDate = s => s ? s.toString().split('T')[0] : '-';
const getStatusClass = (t, v) => {
    if(v==null || !RANGES[t]) return '';
    const r = RANGES[t];
    return (v >= r.min && v <= r.max) ? 'good' : (v < r.min - 0.5 || v > r.max + 0.5) ? 'bad' : 'warn';
};

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(btn.dataset.target).classList.add('active');
        btn.classList.add('active');
    });
});

// Load Data
async function loadData(force) {
    if(logs.length === 0 || force) statusDisplay.innerHTML = `<div class="spinner"></div>`;
    try {
        const d = await (await fetch(API_URL)).json();
        logs = d.map(i => ({
            date: formatDate(i.date), alk: toNum(i.alk), ca: toNum(i.ca), mg: toNum(i.mg),
            no3: toNum(i.no3), po4: toNum(i.po4), ph: toNum(i.ph)
        })).sort((a,b) => new Date(a.date) - new Date(b.date));
        renderAll();
    } catch(e) { statusDisplay.innerHTML = '<div class="status-box bad">Error Loading</div>'; }
}

async function submitLog() {
    saveEntryBtn.innerText = "Saving...";
    const entry = {
        date: dateInput.value, alk: document.getElementById('alk').value, ca: document.getElementById('ca').value,
        mg: document.getElementById('mg').value, no3: document.getElementById('no3').value,
        po4: document.getElementById('po4').value, ph: document.getElementById('ph').value
    };
    await fetch(API_URL, { method:'POST', mode:'no-cors', body:JSON.stringify(entry) });
    location.reload();
}

function renderAll() {
    if(!logs.length) return;
    const l = logs[logs.length-1];
    statusDisplay.innerHTML = `
        <div class="status-box ${getStatusClass('alk',l.alk)}">Alk: ${l.alk??'?'}</div>
        <div class="status-box ${getStatusClass('ca',l.ca)}">Ca: ${l.ca??'?'}</div>
        <div class="status-box ${getStatusClass('no3',l.no3)}">NO3: ${l.no3??'?'}</div>`;

    if(calcCurrentCaInput && l.ca) calcCurrentCaInput.value = l.ca;

    historyTbody.innerHTML = [...logs].reverse().map(i => `
        <tr><td>${i.date}</td><td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td>${i.mg??'-'}</td><td>${i.no3??'-'}</td><td>${i.po4??'-'}</td><td>${i.ph??'-'}</td></tr>`).join('');

    updateChart();
}

function updateChart() {
    const dates = logs.map(x => x.date);
    const datasets = [
        { label: 'Alk', data: logs.map(x => x.alk), borderColor: '#06b6d4', yAxisID: 'y' },
        { label: 'Ca', data: logs.map(x => x.ca), borderColor: '#a855f7', yAxisID: 'y1' },
        { label: 'Mg', data: logs.map(x => x.mg), borderColor: '#f97316', yAxisID: 'y1' },
        { label: 'NO3', data: logs.map(x => x.no3), borderColor: '#10b981', yAxisID: 'y' },
        { label: 'PO4', data: logs.map(x => x.po4), borderColor: '#14b8a6', yAxisID: 'y' },
        { label: 'pH', data: logs.map(x => x.ph), borderColor: '#ef4444', yAxisID: 'y' }
    ];

    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(tankCtx, {
        type: 'line',
        data: { labels: dates, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { position: 'left', title: { display: true, text: 'Alk/Nutrients/pH' } },
                y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Ca/Mg' } }
            }
        }
    });

    document.querySelectorAll('.param-check').forEach(cb => {
        cb.onchange = () => {
            chartInstance.data.datasets[cb.dataset.idx].hidden = !cb.checked;
            chartInstance.update();
        };
    });
}

function calculateDosing() {
    const curCa = toNum(calcCurrentCaInput.value), tgtCa = toNum(calcTargetCaInput.value),
          p1Now = toNum(document.getElementById('currentP1').value);

    if(!curCa || !tgtCa || !p1Now) return alert("Enter Cur Ca, Tgt Ca, and Current P1");

    let drop = 0, maintP1 = p1Now;
    const cl = logs.filter(l => l.ca != null);
    if(cl.length >= 2) {
        const n = cl[cl.length-1], o = cl[cl.length-2];
        const days = Math.abs((new Date(n.date) - new Date(o.date)) / 8.64e7) || 1;
        drop = (o.ca - n.ca) / days;
        maintP1 = (drop / CA_IMPACT_FACTOR) + p1Now;
    }

    const corr = ((tgtCa - curCa) / CA_IMPACT_FACTOR) / ( (tgtCa - curCa) > 20 ? 3 : 1);
    const p1 = Math.max(0, maintP1);

    calcResults.style.display = 'block';
    calcResults.innerHTML = `
        <h3>📋 New Blenny Settings</h3>
        <div style="font-family:monospace; background:rgba(255,255,255,0.1); padding:10px; border-radius:8px;">
            P1: ${p1.toFixed(1)} | P2: ${(p1*2).toFixed(1)} | P3: ${(p1*0.5).toFixed(1)} | P4: ${(p1*0.5).toFixed(1)}
        </div>
        <p style="margin-top:10px; color: #06b6d4;">Manual Boost: <b>${corr.toFixed(1)}mL</b> Part 1 today.</p>`;
}

if(dateInput) dateInput.valueAsDate = new Date();
if(saveEntryBtn) saveEntryBtn.onclick = submitLog;
if(refreshBtn) refreshBtn.onclick = () => loadData(true);
if(calcBtn) calcBtn.onclick = calculateDosing;
loadData();
