// --- 🕵️ ENVIRONMENT DETECTION 🕵️ ---
(function checkEnvironment() {
    const isDev = window.location.hostname.includes('dev--');
    const titleHeader = document.getElementById('appTitle');
    if (isDev) {
        document.title = '(DEV) Reef Command Center';
        if (titleHeader) {
            titleHeader.innerHTML = '🚧 DEV MODE: 389 Reef Command Center';
            titleHeader.style.color = '#d63384';
        }
        console.log("⚠️ Running in DEV environment");
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
const btnResetLights = document.getElementById('btnResetLights');
const btnExportLights = document.getElementById('btnExportLights');
const qrArea = document.getElementById('qrArea');
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
        
        if(btn.dataset.target === 'lighting' && !lightChartInstance && lightCtx) {
            initLightChart();
        }
    });
});

// Init
if(dateInput) dateInput.valueAsDate = new Date();
if(saveEntryBtn) saveEntryBtn.addEventListener('click', submitLog);
if(refreshBtn) refreshBtn.addEventListener('click', () => loadData(true));
if(calcBtn) calcBtn.addEventListener('click', calculateDosing);

// Salt Mix
if(btnMix) {
    btnMix.addEventListener('click', () => {
        const vol = parseFloat(mixVol.value);
        const sg = parseFloat(mixTarget.value);
        if(!vol || !sg) return;
        const baseGramsPerGal = 145; 
        const ratio = (sg - 1) / 0.026;
        const totalGrams = vol * baseGramsPerGal * ratio;
        const totalCups = totalGrams / 280; 
        resGrams.innerText = Math.round(totalGrams);
        resCups.innerText = totalCups.toFixed(2);
        mixResult.style.display = 'block';
    });
}

// Checkboxes
chartCheckboxes.forEach(cb => cb.addEventListener('change', () => {
    if(chartInstance) {
        chartInstance.data.datasets[parseInt(cb.dataset.idx)].hidden = !cb.checked;
        chartInstance.update();
    }
}));

// --- 💡 LIGHTING EDITOR ---
// Populate Hour Dropdown
if(editorHour) {
    for(let i=0; i<24; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.text = i.toString().padStart(2, '0') + ":00";
        editorHour.add(opt);
    }
    // Set default to 10am (start of typical peak)
    editorHour.value = 10;
    editorHour.addEventListener('change', refreshManualInputs);
}

if(btnResetLights) btnResetLights.addEventListener('click', () => initLightChart());
if(btnExportLights) btnExportLights.addEventListener('click', generateQR);

// Channel Config (Matches Noopsyche K7 Pro III Order)
const CHANNELS = [
    { name: 'White',  color: '#fcd34d', dsIndex: 0 },
    { name: 'Blue',   color: '#0096ff', dsIndex: 1 },
    { name: 'Royal',  color: '#0047ab', dsIndex: 2 },
    { name: 'Violet', color: '#8b5cf6', dsIndex: 3 },
    { name: 'UV',     color: '#701a75', dsIndex: 4 },
    { name: 'Red',    color: '#ef4444', dsIndex: 5 } // Using Red for Ch6 (Red/Green)
];

function initLightChart() {
    if(lightChartInstance) { lightChartInstance.destroy(); }

    const hours = Array.from({length: 24}, (_, i) => i + ":00");

    // Defaults for "Reef Spec" (High Blue/UV, Low White/Red)
    const curveBlue = [0,0,0,0,0,0,0,0,10,40,70,80,80,80,80,70,40,10,0,0,0,0,0,0];
    const curveWhite = [0,0,0,0,0,0,0,0,0,5,20,20,20,20,20,20,5,0,0,0,0,0,0,0];

    lightChartInstance = new Chart(lightCtx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                { label: 'A: White',      data: [...curveWhite], borderColor: CHANNELS[0].color, backgroundColor:'transparent', tension: 0.4 },
                { label: 'B: Blue',       data: [...curveBlue],  borderColor: CHANNELS[1].color, backgroundColor:'transparent', tension: 0.4 },
                { label: 'C: Royal Blue', data: [...curveBlue],  borderColor: CHANNELS[2].color, backgroundColor:'transparent', tension: 0.4 },
                { label: 'D: Violet/UV',  data: [...curveBlue],  borderColor: CHANNELS[3].color, backgroundColor:'transparent', tension: 0.4 },
                { label: 'E: UV/Purple',  data: [...curveBlue],  borderColor: CHANNELS[4].color, backgroundColor:'transparent', tension: 0.4 },
                { label: 'F: Red/Green',  data: [...curveWhite], borderColor: CHANNELS[5].color, backgroundColor:'transparent', tension: 0.4, hidden: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            onClick: (e) => {
                // Feature: Click chart to select Hour
                const points = lightChartInstance.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
                if (points.length) {
                    const hourIndex = points[0].index;
                    editorHour.value = hourIndex;
                    refreshManualInputs();
                }
            },
            plugins: {
                dragData: {
                    round: 0, showTooltip: true,
                    onDragStart: function(e) { return true; },
                    onDrag: function(e, datasetIndex, index, value) { e.target.style.cursor = 'grabbing'; },
                    onDragEnd: function(e, datasetIndex, index, value) { 
                        e.target.style.cursor = 'default'; 
                        // If we dragged the currently selected hour, update inputs
                        if(index == editorHour.value) {
                            refreshManualInputs();
                        }
                    }
                },
                legend: { labels: { color: '#f1f5f9' } }
            }
        }
    });

    // Build the Manual Inputs for the first time
    buildManualEditorUI();
    refreshManualInputs();
}

function buildManualEditorUI() {
    if(!manualInputs) return;
    manualInputs.innerHTML = ''; // Clear

    CHANNELS.forEach((ch, idx) => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.style.marginBottom = '0';
        
        const label = document.createElement('label');
        label.innerText = ch.name;
        label.style.color = ch.color;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0; input.max = 100;
        input.id = `input_ch_${idx}`;
        // EVENT: Update Chart when typing
        input.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 0;
            const hour = parseInt(editorHour.value);
            // Update Chart Data
            lightChartInstance.data.datasets[idx].data[hour] = val;
            lightChartInstance.update('none'); // Update without animation for speed
        });

        div.appendChild(label);
        div.appendChild(input);
        manualInputs.appendChild(div);
    });
}

function refreshManualInputs() {
    if(!lightChartInstance || !manualInputs) return;
    const hour = parseInt(editorHour.value);

    // Loop through 6 channels and set input values
    for(let i=0; i<6; i++) {
        const val = lightChartInstance.data.datasets[i].data[hour];
        const input = document.getElementById(`input_ch_${i}`);
        if(input) input.value = Math.round(val);
    }
}

function generateQR() {
    if(!lightChartInstance) return;
    
    // Dataset Indices in Chart now match A-F perfectly
    const ds = lightChartInstance.data.datasets;
    let hexString = "";

    // Loop 24 Hours
    for(let h=0; h<24; h++) {
        // 1. Hour
        hexString += h.toString(16).padStart(2, '0').toUpperCase();
        // 2. Minute (00)
        hexString += "00";
        // 3. Channels A-F
        for(let c=0; c<6; c++) {
            let val = Math.round(ds[c].data[h]);
            if(val > 100) val = 100; if(val < 0) val = 0;
            hexString += val.toString(16).padStart(2, '0').toUpperCase();
        }
    }

    console.log("Noopsyche Hex:", hexString);
    qrArea.style.display = 'block';
    document.getElementById('qrcode').innerHTML = ""; 
    
    new QRCode(document.getElementById("qrcode"), {
        text: hexString,
        width: 256,
        height: 256,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.L
    });
}

// Load Data
async function loadData(force) {
    if(!statusDisplay) return;
    if(logs.length===0 || force) statusDisplay.innerHTML = `<div style="grid-column:span 3;text-align:center;"><div class="spinner"></div><div style="margin-top:10px;color:#94a3b8;">Connecting...</div></div>`;
    
    try {
        const d = await (await fetch(API_URL)).json();
        logs = d.map(i => ({
            date: formatDate(i.date),
            alk: toNum(i.alk), ca: toNum(i.ca), mg: toNum(i.mg),
            no3: toNum(i.no3), po4: toNum(i.po4), ph: toNum(i.ph)
        })).filter(i => i.date !== '-').sort((a,b) => new Date(a.date) - new Date(b.date));
        renderAll();
    } catch(e) { statusDisplay.innerHTML = '<div class="status-box bad" style="grid-column:span 3;">Connection Failed</div>'; }
}

// Submit Log
async function submitLog() {
    const btn = saveEntryBtn; const txt = btn.innerText;
    btn.innerText = "Saving..."; btn.disabled = true;
    const rawD = (dateInput.value||'').trim();
    const entry = {
        date: rawD, alk: document.getElementById('alk').value, ca: document.getElementById('ca').value,
        mg: document.getElementById('mg').value, no3: document.getElementById('no3').value,
        po4: document.getElementById('po4').value, ph: document.getElementById('ph').value
    };
    if(!entry.date || !entry.alk) { alert('Date/Alk required'); btn.innerText=txt; btn.disabled=false; return; }

    try { await fetch(API_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body:JSON.stringify(entry) }); } 
    catch(e) { alert("Error: "+e); }
    
    logs.push({ date: formatDate(rawD), alk: toNum(entry.alk), ca: toNum(entry.ca), mg: toNum(entry.mg), no3: toNum(entry.no3), po4: toNum(entry.po4), ph: toNum(entry.ph) });
    renderAll();
    alert("Saved!"); btn.innerText=txt; btn.disabled=false;
    document.querySelectorAll('input[type=number]').forEach(i => i.value='');
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
        <tr><td>${i.date}</td>
        <td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td class="${getStatusClass('mg',i.mg)}">${i.mg??'-'}</td><td class="${getStatusClass('no3',i.no3)}">${i.no3??'-'}</td>
        <td class="${getStatusClass('po4',i.po4)}">${i.po4??'-'}</td><td class="${getStatusClass('ph',i.ph)}">${i.ph??'-'}</td></tr>`
    ).join('');

    const lbl = logs.map(x=>x.date);
    const ds = [
        {l:'Alk',d:'alk',c:'#06b6d4',y:'y'}, {l:'Ca',d:'ca',c:'#a855f7',y:'y1'},
        {l:'Mg',d:'mg',c:'#f97316',y:'y1'}, {l:'NO3',d:'no3',c:'#10b981',y:'y'},
        {l:'PO4',d:'po4',c:'#14b8a6',y:'y'}, {l:'pH',d:'ph',c:'#ef4444',y:'y'}
    ].map((cfg,i) => ({
        label: cfg.l, data: logs.map(x=>x[cfg.d]), borderColor: cfg.c, backgroundColor: cfg.c, 
        yAxisID: cfg.y, spanGaps: true, hidden: !chartCheckboxes[i].checked
    }));

    if(chartInstance) { chartInstance.data.labels=lbl; chartInstance.data.datasets.forEach((d,i)=>d.data=ds[i].data); chartInstance.update(); }
    else {
        Chart.defaults.color = '#94a3b8'; 
        Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';
        chartInstance = new Chart(tankCtx, {
            type: 'line', data: { labels: lbl, datasets: ds },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode:'index', intersect:false },
                plugins: { legend: { display:false } },
                scales: { 
                    x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { position:'left', title:{display:true, text:'Alk / Nutrients', color:'#cbd5e1'}, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y1: { position:'right', grid:{drawOnChartArea:false}, title:{display:true, text:'Ca / Mg', color:'#cbd5e1'} }
                }
            }
        });
    }
}

function calculateDosing() {
    const cur = toNum(calcCurrentCaInput.value), tgt = toNum(calcTargetCaInput.value);
    if(!cur || !tgt) return alert("Enter Calcium values");
    let drop = 0, p1 = 0;
    const cl = logs.filter(l=>l.ca!=null);
    if(cl.length>=2) {
        const n = cl[cl.length-1], o = cl[cl.length-2];
        const d = Math.abs((new Date(n.date)-new Date(o.date))/(8.64e7))||1;
        drop = Math.max(0, (o.ca-n.ca)/d);
        p1 = drop / CA_IMPACT_FACTOR;
    }
    const gap = tgt - cur;
    let corr = gap > 5 ? (gap/CA_IMPACT_FACTOR)/(gap>20?3:1) : 0;
    const tot = p1+corr;
    calcResults.style.display='block';
    calcResults.innerHTML = `
        <h3>🧪 Red Sea Plan</h3>
        <p>Consumption: <b>${drop.toFixed(1)} ppm/day</b></p>
        <div style="display:grid; grid-template-columns:1fr auto; gap:10px; margin-top:10px;">
            <div><b>Part 1 (Ca)</b></div><div>${tot.toFixed(1)} mL</div>
            <div><b>Part 2 (Alk)</b></div><div>${(tot*2).toFixed(1)} mL</div>
            <div><b>Part 3 (Iodine)</b></div><div>${(tot*0.5).toFixed(1)} mL</div>
            <div><b>Part 4 (Bio)</b></div><div>${(tot*0.5).toFixed(1)} mL</div>
        </div>
        <p style="margin-top:10px;font-size:0.9em;color:#94a3b8;">${gap>5?'⚠️ Correction included':'✅ Levels match target'}</p>`;
}

loadData();
