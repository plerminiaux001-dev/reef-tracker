const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_LITERS = 35 * 3.78541;
const CA_IMPACT_FACTOR = 1.4 * (100 / TANK_LITERS); 

let logs = [];
let chartInstance = null;
let lightChartInstance = null;

const RANGES = { alk: { min: 8.0, max: 10.0 }, ca: { min: 400, max: 460 }, mg: { min: 1250, max: 1450 }, no3: { min: 1, max: 15 }, po4: { min: 0.02, max: 0.1 }, ph: { min: 8.0, max: 8.4 } };

const CHANNELS = [
    { name: 'White', color: '#fcd34d' }, { name: 'Blue', color: '#0096ff' },
    { name: 'Royal', color: '#0047ab' }, { name: 'Violet', color: '#8b5cf6' },
    { name: 'UV', color: '#701a75' }, { name: 'Red', color: '#ef4444' }
];

// Environment & Tab Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
        if(btn.dataset.target === 'lighting' && !lightChartInstance) initLightChart();
    });
});

async function loadData(force) {
    if(force) document.getElementById('statusDisplay').innerHTML = `<div class="spinner"></div>`;
    const d = await (await fetch(API_URL)).json();
    logs = d.map(i => ({
        date: i.date.split('T')[0], alk: parseFloat(i.alk), ca: parseFloat(i.ca), mg: parseFloat(i.mg),
        no3: parseFloat(i.no3), po4: parseFloat(i.po4), ph: parseFloat(i.ph)
    })).sort((a,b) => new Date(a.date) - new Date(b.date));
    renderAll();
}

function renderAll() {
    const l = logs[logs.length-1];
    document.getElementById('statusDisplay').innerHTML = `
        <div class="status-box ${getStatusClass('alk',l.alk)}">Alk: ${l.alk??'?'}</div>
        <div class="status-box ${getStatusClass('ca',l.ca)}">Ca: ${l.ca??'?'}</div>
        <div class="status-box ${getStatusClass('no3',l.no3)}">NO3: ${l.no3??'?'}</div>`;
    
    document.querySelector('#historyTable tbody').innerHTML = [...logs].reverse().map(i => `
        <tr><td>${i.date}</td><td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td>${i.mg??'-'}</td><td>${i.no3??'-'}</td><td>${i.po4??'-'}</td><td>${i.ph??'-'}</td></tr>`).join('');
    
    updateTrendChart();
}

function updateTrendChart() {
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('tankChart'), {
        type: 'line',
        data: {
            labels: logs.map(x => x.date),
            datasets: [
                { label: 'Alk', data: logs.map(x => x.alk), borderColor: '#06b6d4', yAxisID: 'y' },
                { label: 'Ca', data: logs.map(x => x.ca), borderColor: '#a855f7', yAxisID: 'y1' },
                { label: 'Mg', data: logs.map(x => x.mg), borderColor: '#f97316', yAxisID: 'y1', hidden: true },
                { label: 'NO3', data: logs.map(x => x.no3), borderColor: '#10b981', yAxisID: 'y', hidden: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function calculateDosing() {
    const p1Now = parseFloat(document.getElementById('currentP1').value);
    const n = logs[logs.length-1], o = logs[logs.length-2];
    const days = Math.abs((new Date(n.date) - new Date(o.date)) / 8.64e7) || 1;
    const drop = (o.ca - n.ca) / days;
    const p1 = (drop / CA_IMPACT_FACTOR) + (p1Now || 0);
    const corr = (parseFloat(document.getElementById('calcTargetCa').value) - parseFloat(document.getElementById('calcCurrentCa').value)) / CA_IMPACT_FACTOR;

    const res = document.getElementById('calc-results');
    res.style.display = 'block';
    res.innerHTML = `
        <h3 style="margin-bottom:10px;">📋 Blenny Settings</h3>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-family:monospace; background:rgba(255,255,255,0.1); padding:10px; border-radius:8px;">
            <div>P1: <b>${p1.toFixed(1)}mL</b></div><div>P2: <b>${(p1*2).toFixed(1)}mL</b></div>
            <div>P3: <b>${(p1*0.5).toFixed(1)}mL</b></div><div>P4: <b>${(p1*0.5).toFixed(1)}mL</b></div>
        </div>
        <p style="margin-top:10px; font-size:0.9em;">Manual Boost: <b>${corr.toFixed(1)}mL</b> Part 1.</p>`;
}

// --- 💡 LIGHTING ENGINE ---
function initLightChart() {
    if(lightChartInstance) lightChartInstance.destroy();
    const hours = Array.from({length: 24}, (_, i) => i + ":00");
    lightChartInstance = new Chart(document.getElementById('lightChart'), {
        type: 'line',
        data: {
            labels: hours,
            datasets: CHANNELS.map(ch => ({ label: ch.name, data: new Array(24).fill(0), borderColor: ch.color, tension: 0.4 }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { dragData: { round: 0, onDragEnd: () => refreshManualInputs() } }
        }
    });
    buildManualEditorUI();
}

function buildManualEditorUI() {
    const container = document.getElementById('manualInputs');
    container.innerHTML = '';
    CHANNELS.forEach((ch, idx) => {
        const div = document.createElement('div');
        div.innerHTML = `<label style="color:${ch.color}">${ch.name}</label><input type="number" id="ch_${idx}" value="0" min="0" max="100">`;
        div.querySelector('input').oninput = (e) => {
            const h = document.getElementById('editorHour').value;
            lightChartInstance.data.datasets[idx].data[h] = parseInt(e.target.value);
            lightChartInstance.update('none');
        };
        container.appendChild(div);
    });
}

function refreshManualInputs() {
    const h = document.getElementById('editorHour').value;
    CHANNELS.forEach((_, idx) => {
        document.getElementById(`ch_${idx}`).value = lightChartInstance.data.datasets[idx].data[h];
    });
}

document.getElementById('btnExportLights').onclick = () => {
    let hex = "";
    for(let h=0; h<24; h++) {
        hex += h.toString(16).padStart(2,'0').toUpperCase() + "00";
        for(let c=0; c<6; c++) hex += Math.round(lightChartInstance.data.datasets[c].data[h]).toString(16).padStart(2,'0').toUpperCase();
    }
    document.getElementById('qrArea').style.display = 'block';
    document.getElementById('qrcode').innerHTML = "";
    new QRCode(document.getElementById('qrcode'), { text: hex, width: 200, height: 200 });
};

// Start
document.getElementById('btnMix').onclick = () => {
    const grams = parseFloat(document.getElementById('mixVol').value) * 145 * ((parseFloat(document.getElementById('mixTarget').value) - 1) / 0.026);
    document.getElementById('resGrams').innerText = Math.round(grams);
    document.getElementById('resCups').innerText = (grams / 280).toFixed(2);
    document.getElementById('mixResult').style.display = 'block';
};

document.getElementById('calcBtn').onclick = calculateDosing;
document.getElementById('refreshBtn').onclick = () => loadData(true);
loadData(true);
