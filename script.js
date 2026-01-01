// --- ⬇️ CONFIGURATION AREA ⬇️ ---
const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_GAL = 35;
const TANK_LITERS = TANK_GAL * 3.78541;
const CA_IMPACT_PER_100L = 1.4; // ppm per 100L per mL
const CA_IMPACT_FACTOR = CA_IMPACT_PER_100L * (100 / TANK_LITERS); // ppm per mL for this tank

// Dosing Multipliers
const RATIO_P2 = 2.0;
const RATIO_P3 = 0.5;
const RATIO_P4 = 0.5;

// 🎨 SAFE RANGES
const RANGES = {
    alk: { min: 8.0, max: 10.0 },
    ca:  { min: 400, max: 460 },
    mg:  { min: 1250, max: 1450 },
    no3: { min: 1,   max: 15 },
    po4: { min: 0.02, max: 0.1 },
    ph:  { min: 8.0, max: 8.4 }
};
// --- END CONFIGURATION ---

let logs = [];
let chartInstance = null;

// Cached elements
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

// Salt Mix Elements
const btnMix = document.getElementById('btnMix');
const mixVol = document.getElementById('mixVol');
const mixTarget = document.getElementById('mixTarget');
const mixResult = document.getElementById('mixResult');
const resGrams = document.getElementById('resGrams');
const resCups = document.getElementById('resCups');

// Helper: safely parse number
const toNum = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

// Helper: Determine color class
const getStatusClass = (type, val) => {
    if (val === null || val === undefined) return '';
    const range = RANGES[type];
    if (!range) return ''; 
    if (val >= range.min && val <= range.max) return 'good';
    const buffer = (range.max - range.min) * 0.5; 
    if (val >= range.min - buffer && val <= range.max + buffer) return 'warn';
    return 'bad';
};

// Helper: Format Date MM/DD/YYYY
const formatDate = (isoString) => {
    if (!isoString) return '-';
    const cleanDate = isoString.toString().split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return cleanDate;
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
};

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const id = btn.dataset.target;
        const target = document.getElementById(id);
        if(target) {
            target.classList.add('active');
            btn.classList.add('active');
        }
    });
});

// Init date field
if (dateInput) dateInput.valueAsDate = new Date();

// Event listeners
saveEntryBtn.addEventListener('click', submitLog);
refreshBtn.addEventListener('click', () => loadData(true));
calcBtn.addEventListener('click', calculateDosing);

// Salt Mix Listener
if(btnMix) {
    btnMix.addEventListener('click', () => {
        const vol = parseFloat(mixVol.value);
        const sg = parseFloat(mixTarget.value);
        if(!vol || !sg) return;
        
        // Red Sea Coral Pro: ~145g/gal
        const baseGramsPerGal = 145; 
        const ratio = (sg - 1) / 0.026;
        const totalGrams = vol * baseGramsPerGal * ratio;
        const totalCups = totalGrams / 280; 

        resGrams.innerText = Math.round(totalGrams);
        resCups.innerText = totalCups.toFixed(2);
        mixResult.style.display = 'block';
    });
}

// Checkbox listener
chartCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
        if(chartInstance) {
            const idx = parseInt(cb.dataset.idx);
            chartInstance.data.datasets[idx].hidden = !cb.checked;
            chartInstance.update();
        }
    });
});

// Fetch data
async function loadData(forceRefresh = false) {
    if (!statusDisplay) return;
    
    if (logs.length === 0 || forceRefresh) {
        statusDisplay.innerHTML = `
            <div style="grid-column: span 3; text-align: center; padding: 20px;">
                <div class="spinner"></div>
                <div style="margin-top: 10px; color: #94a3b8; font-size: 0.9em;">Syncing with Reef Cloud...</div>
            </div>
        `;
    }

    try {
        const resp = await fetch(API_URL);
        if (!resp.ok) throw new Error('Network response was not ok: ' + resp.status);
        const data = await resp.json();

        logs = data.map(item => {
            const rawDate = (item.date || '').toString().split('T')[0];
            return {
                date: formatDate(rawDate),
                alk: toNum(item.alk),
                ca: toNum(item.ca),
                mg: toNum(item.mg),
                no3: toNum(item.no3),
                po4: toNum(item.po4),
                ph: toNum(item.ph)
            };
        }).filter(item => item.date !== '-');

        logs.sort((a,b) => new Date(a.date) - new Date(b.date));
        renderAll();
    } catch (err) {
        console.error('loadData error', err);
        statusDisplay.innerHTML = '<div class="status-box bad" style="grid-column: span 3;">Connection Failed</div>';
    }
}

// Submit log
async function submitLog() {
    const btn = saveEntryBtn;
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    const rawInputDate = (dateInput.value || '').trim();
    const entry = {
        date: rawInputDate, 
        alk: document.getElementById('alk').value.trim(),
        ca: document.getElementById('ca').value.trim(),
        mg: document.getElementById('mg').value.trim(),
        no3: document.getElementById('no3').value.trim(),
        po4: document.getElementById('po4').value.trim(),
        ph: document.getElementById('ph').value.trim()
    };

    if (!entry.date || !entry.alk) {
        alert("Date and Alkalinity are required!");
        btn.innerText = originalText;
        btn.disabled = false;
        return;
    }

    try {
        const resp = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry)
        });
        if (!resp.ok) throw new Error('Server returned ' + resp.status);
        try { await resp.json(); } catch (e) { }

        alert("Saved to Cloud!");
    } catch (err) {
        console.warn('POST failed, attempting no-cors fallback', err);
        try {
            await fetch(API_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(entry)
            });
            alert("Saved to Cloud (fallback).");
        } catch (err2) {
            alert("Error saving: " + err2);
            btn.innerText = originalText;
            btn.disabled = false;
            return;
        }
    }

    logs.push({
        date: formatDate(rawInputDate),
        alk: toNum(entry.alk),
        ca: toNum(entry.ca),
        mg: toNum(entry.mg),
        no3: toNum(entry.no3),
        po4: toNum(entry.po4),
        ph: toNum(entry.ph)
    });
    renderAll();

    document.querySelectorAll('input[type=number]').forEach(i => i.value = '');
    btn.innerText = originalText;
    btn.disabled = false;
}

function renderAll() {
    renderTable();
    renderStatus();
    renderChart();
    if (logs.length > 0 && calcCurrentCaInput) {
        const last = logs[logs.length - 1];
        if (last && toNum(last.ca) !== null) calcCurrentCaInput.value = last.ca;
    }
}

function renderTable() {
    if (!historyTbody) return;
    const frag = document.createDocumentFragment();
    [...logs].slice().reverse().forEach(log => {
        const tr = document.createElement('tr');
        const mkCell = (type, val) => {
            const cls = getStatusClass(type, val);
            const style = (cls === 'good' || cls === 'bad') ? 'color: white;' : '';
            return `<td class="${cls}" style="${style}">${val ?? '-'}</td>`;
        };

        tr.innerHTML = `
            <td>${log.date || '-'}</td>
            ${mkCell('alk', log.alk)}
            ${mkCell('ca', log.ca)}
            ${mkCell('mg', log.mg)}
            ${mkCell('no3', log.no3)}
            ${mkCell('po4', log.po4)}
            ${mkCell('ph', log.ph)}
        `;
        frag.appendChild(tr);
    });
    historyTbody.innerHTML = '';
    historyTbody.appendChild(frag);
}

function renderStatus() {
    if (!statusDisplay) return;
    if (logs.length === 0) {
        statusDisplay.innerHTML = '<div class="status-box warn">No Data</div>';
        return;
    }
    const last = logs[logs.length-1];

    const alkClass = getStatusClass('alk', last.alk);
    const caClass = getStatusClass('ca', last.ca);
    const no3Class = getStatusClass('no3', last.no3);

    statusDisplay.innerHTML = `
        <div class="status-box ${alkClass}">Alk: ${last.alk ?? '?'}</div>
        <div class="status-box ${caClass}">Ca: ${last.ca ?? '?'}</div>
        <div class="status-box ${no3Class}">NO3: ${last.no3 ?? '?'}</div>
    `;
}

function renderChart() {
    const labels = logs.map(l => l.date);
    const datasets = [
        { label: 'Alk', data: logs.map(l => l.alk), borderColor: '#06b6d4', backgroundColor: '#06b6d4', yAxisID: 'y', spanGaps: true },
        { label: 'Ca',  data: logs.map(l => l.ca),  borderColor: '#a855f7', backgroundColor: '#a855f7', yAxisID: 'y1', spanGaps: true },
        { label: 'Mg',  data: logs.map(l => l.mg),  borderColor: '#f97316', backgroundColor: '#f97316', yAxisID: 'y1', spanGaps: true },
        { label: 'NO3', data: logs.map(l => l.no3), borderColor: '#10b981', backgroundColor: '#10b981', yAxisID: 'y', spanGaps: true },
        { label: 'PO4', data: logs.map(l => l.po4), borderColor: '#14b8a6', backgroundColor: '#14b8a6', yAxisID: 'y', spanGaps: true },
        { label: 'pH',  data: logs.map(l => l.ph),  borderColor: '#ef4444', backgroundColor: '#ef4444', yAxisID: 'y', spanGaps: true }
    ];

    if (chartInstance) {
        chartInstance.data.labels = labels;
        datasets.forEach((ds, i) => { chartInstance.data.datasets[i].data = ds.data; });
        chartInstance.update();
        return;
    }

    // DARK MODE CONFIGURATION
    Chart.defaults.color = '#94a3b8'; // Global text color (light grey)
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)'; // Global grid color (subtle white)

    chartInstance = new Chart(tankCtx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    display: true, 
                    grid: { color: 'rgba(255, 255, 255, 0.05)' } 
                },
                y: { 
                    type: 'linear', display: true, position: 'left', 
                    title: { display: true, text: 'Alk / pH / Nutrients', color: '#cbd5e1' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y1: { 
                    type: 'linear', display: true, position: 'right', 
                    title: { display: true, text: 'Calcium / Magnesium', color: '#cbd5e1' },
                    grid: { drawOnChartArea: false }
                },
            }
        }
    });

    chartCheckboxes.forEach((cb, idx) => {
        chartInstance.data.datasets[idx].hidden = !cb.checked;
    });
    chartInstance.update();
}

// Initial load
loadData();
