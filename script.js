const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_GAL = 35;
const TANK_LITERS = TANK_GAL * 3.78541;
const CA_IMPACT_FACTOR = 1.4 * (100 / TANK_LITERS); 

let logs = [];
let chartInstance = null;

const RANGES = {
    alk: { min: 8.0, max: 10.0 }, ca: { min: 400, max: 460 }, no3: { min: 1, max: 15 }
};

// Elements
const statusDisplay = document.getElementById('statusDisplay');
const historyTbody = document.querySelector('#historyTable tbody');
const dateInput = document.getElementById('date');
const calcCurrentCaInput = document.getElementById('calcCurrentCa');
const calcTargetCaInput = document.getElementById('calcTargetCa');
const tankCtx = document.getElementById('tankChart');

const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const getStatusClass = (t, v) => {
    if(v==null || !RANGES[t]) return '';
    const r = RANGES[t];
    return (v >= r.min && v <= r.max) ? 'good' : (v < r.min - 0.5 || v > r.max + 0.5) ? 'bad' : 'warn';
};

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

async function loadData(force) {
    if(force) statusDisplay.innerHTML = `<div class="spinner"></div>`;
    const d = await (await fetch(API_URL)).json();
    logs = d.map(i => ({
        date: i.date.split('T')[0], alk: toNum(i.alk), ca: toNum(i.ca), mg: toNum(i.mg),
        no3: toNum(i.no3), po4: toNum(i.po4), ph: toNum(i.ph)
    })).sort((a,b) => new Date(a.date) - new Date(b.date));
    renderAll();
}

function renderAll() {
    const l = logs[logs.length-1];
    statusDisplay.innerHTML = `
        <div class="status-box ${getStatusClass('alk',l.alk)}">Alk: ${l.alk??'?'}</div>
        <div class="status-box ${getStatusClass('ca',l.ca)}">Ca: ${l.ca??'?'}</div>
        <div class="status-box ${getStatusClass('no3',l.no3)}">NO3: ${l.no3??'?'}</div>`;

    if(l.ca) calcCurrentCaInput.value = l.ca;

    historyTbody.innerHTML = [...logs].reverse().map(i => `
        <tr><td>${i.date}</td><td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td>${i.mg??'-'}</td><td>${i.no3??'-'}</td><td>${i.po4??'-'}</td><td>${i.ph??'-'}</td></tr>`).join('');

    updateChart();
}

function updateChart() {
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(tankCtx, {
        type: 'line',
        data: {
            labels: logs.map(x => x.date),
            datasets: [
                { label: 'Alk', data: logs.map(x => x.alk), borderColor: '#06b6d4', yAxisID: 'y' },
                { label: 'Ca', data: logs.map(x => x.ca), borderColor: '#a855f7', yAxisID: 'y1' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function calculateDosing() {
    const p1Now = toNum(document.getElementById('currentP1').value);
    const n = logs[logs.length-1], o = logs[logs.length-2];
    const days = Math.abs((new Date(n.date) - new Date(o.date)) / 8.64e7) || 1;
    const drop = (o.ca - n.ca) / days;
    const p1 = (drop / CA_IMPACT_FACTOR) + (p1Now || 0);
    const corr = ((toNum(calcTargetCaInput.value) - toNum(calcCurrentCaInput.value)) / CA_IMPACT_FACTOR);

    document.getElementById('calc-results').style.display = 'block';
    document.getElementById('calc-results').innerHTML = `
        <h4>P1: ${p1.toFixed(1)} | P2: ${(p1*2).toFixed(1)}</h4>
        <p>Boost: ${corr.toFixed(1)}mL Part 1 today.</p>`;
}

document.getElementById('calcBtn').onclick = calculateDosing;
document.getElementById('refreshBtn').onclick = () => loadData(true);
loadData(true);
