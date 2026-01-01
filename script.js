// --- ⬇️ CONFIGURATION AREA ⬇️ ---
const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_GAL = 35;
const TANK_LITERS = TANK_GAL * 3.78541;
const CA_IMPACT_PER_100L = 1.4; 
const CA_IMPACT_FACTOR = CA_IMPACT_PER_100L * (100 / TANK_LITERS); 

const RATIO_P2 = 2.0; const RATIO_P3 = 0.5; const RATIO_P4 = 0.5;

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
    const clean = s.toString().split('T')[0];
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
        document.getElementById(btn.dataset.target).classList.add('active');
        btn.classList.add('active');
    });
});

// Init
if(dateInput) dateInput.valueAsDate = new Date();
saveEntryBtn.addEventListener('click', submitLog);
refreshBtn.addEventListener('click', () => loadData(true));
calcBtn.addEventListener('click', calculateDosing);
chartCheckboxes.forEach(cb => cb.addEventListener('change', () => {
    if(chartInstance) {
        chartInstance.data.datasets[parseInt(cb.dataset.idx)].hidden = !cb.checked;
        chartInstance.update();
    }
}));

// Salt Mixer
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

// Load Data
async function loadData(force) {
    if(logs.length===0 || force) statusDisplay.innerHTML = `<div style="grid-column:span 3;text-align:center;"><div class="spinner"></div><div style="margin-top:10px;color:#94a3b8;">Syncing...</div></div>`;
    try {
        const d = await (await fetch(API_URL)).json();
        logs = d.map(i => ({
            date: formatDate((i.date||'').toString().split('T')[0]),
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
    // Status
    if(!logs.length) return;
    const l = logs[logs.length-1];
    statusDisplay.innerHTML = `
        <div class="status-box ${getStatusClass('alk',l.alk)}">Alk: ${l.alk??'?'}</div>
        <div class="status-box ${getStatusClass('ca',l.ca)}">Ca: ${l.ca??'?'}</div>
        <div class="status-box ${getStatusClass('no3',l.no3)}">NO3: ${l.no3??'?'}</div>`;
    if(calcCurrentCaInput && l.ca) calcCurrentCaInput.value = l.ca;

    // Table
    historyTbody.innerHTML = [...logs].slice().reverse().map(i => `
        <tr><td>${i.date}</td>
        <td class="${getStatusClass('alk',i.alk)}">${i.alk??'-'}</td><td class="${getStatusClass('ca',i.ca)}">${i.ca??'-'}</td>
        <td class="${getStatusClass('mg',i.mg)}">${i.mg??'-'}</td><td class="${getStatusClass('no3',i.no3)}">${i.no3??'-'}</td>
        <td class="${getStatusClass('po4',i.po4)}">${i.po4??'-'}</td><td class="${getStatusClass('ph',i.ph)}">${i.ph??'-'}</td></tr>`
    ).join('');

    // Chart with DARK MODE COLORS
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
        // FORCE LIGHT TEXT
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
