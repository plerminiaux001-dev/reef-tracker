// --- ⬇️ CONFIGURATION AREA ⬇️ ---
const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_GAL = 35;
const TANK_LITERS = TANK_GAL * 3.78541;
const CA_IMPACT_PER_100L = 1.4; // ppm per 100L per mL
const CA_IMPACT_FACTOR = CA_IMPACT_PER_100L * (100 / TANK_LITERS); // ppm per mL for this tank

// Dosing Multipliers (Relative to Calcium)
const RATIO_P2 = 2.0;
const RATIO_P3 = 0.5;
const RATIO_P4 = 0.5;

// 🎨 SAFE RANGES (Edit these to match your reef goals)
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

// Helper: safely parse number
const toNum = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

// Helper: Determine color class based on value
// Returns: 'good' (Green), 'warn' (Yellow), 'bad' (Red), or '' (None)
const getStatusClass = (type, val) => {
    if (val === null || val === undefined) return '';
    const range = RANGES[type];
    if (!range) return ''; // No range defined for this type

    // Perfect Range = Green
    if (val >= range.min && val <= range.max) return 'good';
    
    // Slight deviation (10% off) = Yellow
    const buffer = (range.max - range.min) * 0.5; 
    if (val >= range.min - buffer && val <= range.max + buffer) return 'warn';
    
    // Way off = Red
    return 'bad';
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

// Checkbox listener for graph
chartCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
        if(chartInstance) {
            const idx = parseInt(cb.dataset.idx);
            const isChecked = cb.checked;
            chartInstance.data.datasets[idx].hidden = !isChecked;
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
                <div style="margin-top: 10px; color: #666; font-size: 0.9em;">Syncing with Reef Cloud...</div>
            </div>
        `;
    }

    try {
        const resp = await fetch(API_URL);
        if (!resp.ok) throw new Error('Network response was not ok: ' + resp.status);
        const data = await resp.json();

        logs = data.map(item => ({
            date: (item.date || '').toString().split('T')[0],
            alk: toNum(item.alk),
            ca: toNum(item.ca),
            mg: toNum(item.mg),
            no3: toNum(item.no3),
            po4: toNum(item.po4),
            ph: toNum(item.ph)
        })).filter(Boolean);

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

    const entry = {
        date: (dateInput.value || '').trim(),
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
        date: entry.date,
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
    
    // Copy array and reverse to show newest first
    [...logs].slice().reverse().forEach(log => {
        const tr = document.createElement('tr');
        
        // Helper to create TD with dynamic class
        const mkCell = (type, val) => {
            const cls = getStatusClass(type, val);
            // If class is good/bad, add white text style. If warn, text is usually dark.
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

    // Reuse the new getStatusClass helper
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
        { label: 'Alk', data: logs.map(l => l.alk), borderColor: '#007bff', backgroundColor: '#007bff', yAxisID: 'y', spanGaps: true },
        { label: 'Ca',  data: logs.map(l => l.ca),  borderColor: '#6f42c1', backgroundColor: '#6f42c1', yAxisID: 'y1', spanGaps: true },
        { label: 'Mg',  data: logs.map(l => l.mg),  borderColor: '#fd7e14', backgroundColor: '#fd7e14', yAxisID: 'y1', spanGaps: true },
        { label: 'NO3', data: logs.map(l => l.no3), borderColor: '#28a745', backgroundColor: '#28a745', yAxisID: 'y', spanGaps: true },
        { label: 'PO4', data: logs.map(l => l.po4), borderColor: '#20c997', backgroundColor: '#20c997', yAxisID: 'y', spanGaps: true },
        { label: 'pH',  data: logs.map(l => l.ph),  borderColor: '#dc3545', backgroundColor: '#dc3545', yAxisID: 'y', spanGaps: true }
    ];

    if (chartInstance) {
        chartInstance.data.labels = labels;
        datasets.forEach((ds, i) => { chartInstance.data.datasets[i].data = ds.data; });
        chartInstance.update();
        return;
    }

    chartInstance = new Chart(tankCtx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, grid: { color: '#eee' } },
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Alk / pH / Nutrients' }, grid: { color: '#eee' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Calcium / Magnesium' }, grid: { drawOnChartArea: false } },
            }
        }
    });

    chartCheckboxes.forEach((cb, idx) => {
        chartInstance.data.datasets[idx].hidden = !cb.checked;
    });
    chartInstance.update();
}

// --- CALCULATOR LOGIC ---
function calculateDosing() {
    const currentCa = toNum(calcCurrentCaInput.value);
    const targetCa = toNum(calcTargetCaInput.value);

    if (currentCa === null || targetCa === null) {
        alert("Please enter Current and Target Calcium.");
        return;
    }

    let dailyP1 = 0;
    let dailyDrop = 0;

    const caLogs = logs.filter(l => toNum(l.ca) !== null);
    if (caLogs.length >= 2) {
        const curL = caLogs[caLogs.length-1];
        const preL = caLogs[caLogs.length-2];
        const days = Math.abs((new Date(curL.date) - new Date(preL.date)) / (1000*60*60*24)) || 1;
        const caLoss = (preL.ca ?? 0) - (curL.ca ?? 0);
        dailyDrop = caLoss > 0 ? caLoss / days : 0;
        if (dailyDrop > 0) dailyP1 = dailyDrop / CA_IMPACT_FACTOR;
    }

    const dailyP2 = dailyP1 * RATIO_P2;
    const dailyP3 = dailyP1 * RATIO_P3;
    const dailyP4 = dailyP1 * RATIO_P4;

    const gap = targetCa - currentCa;
    let correctionP1_Daily = 0;
    let correctionMsg = "✅ Levels match target.";

    if (gap > 5) {
        const totalCorrectionNeeded = gap / CA_IMPACT_FACTOR;
        if (gap > 20) {
            correctionP1_Daily = totalCorrectionNeeded / 3;
            correctionMsg = `⚠️ Low Calcium (-${gap} ppm). Adding correction dose over 3 days.`;
        } else {
            correctionP1_Daily = totalCorrectionNeeded;
            correctionMsg = `⚠️ Low Calcium (-${gap} ppm). Adding correction dose today.`;
        }
    }

    const totalP1Today = dailyP1 + correctionP1_Daily;

    calcResults.style.display = 'block';
    calcResults.innerHTML = `
        <h3>🧪 Red Sea Dosing Plan</h3>
        <p>Daily Consumption: <b>${dailyDrop.toFixed(1)} ppm/day</b></p>
        <table style="width:100%; border-collapse: collapse; text-align: center; border:1px solid #ddd;">
            <tr style="background:#f0f0f0; font-weight:bold;">
                <td style="padding:8px;">Product</td>
                <td style="padding:8px;">Base</td>
                <td style="padding:8px; color:#d63384;">Corr.</td>
                <td style="padding:8px; background:#e3f2fd;">TOTAL</td>
            </tr>
            <tr>
                <td style="text-align:left; padding:8px;"><b>Part 1</b> (Ca)</td>
                <td>${dailyP1.toFixed(1)}</td>
                <td style="color:#d63384;">+ ${correctionP1_Daily.toFixed(1)}</td>
                <td style="background:#e3f2fd; font-weight:bold;">${totalP1Today.toFixed(1)} mL</td>
            </tr>
            <tr>
                <td style="text-align:left; padding:8px;"><b>Part 2</b> (Alk)</td>
                <td>${dailyP2.toFixed(1)}</td>
                <td>-</td>
                <td style="background:#e3f2fd;">${dailyP2.toFixed(1)} mL</td>
            </tr>
            <tr>
                <td style="text-align:left; padding:8px;"><b>Part 3</b> (Iodine)</td>
                <td>${dailyP3.toFixed(1)}</td>
                <td>-</td>
                <td style="background:#e3f2fd;">${dailyP3.toFixed(1)} mL</td>
            </tr>
            <tr>
                <td style="text-align:left; padding:8px;"><b>Part 4</b> (Bio)</td>
                <td>${dailyP4.toFixed(1)}</td>
                <td>-</td>
                <td style="background:#e3f2fd;">${dailyP4.toFixed(1)} mL</td>
            </tr>
        </table>
        <p style="margin-top:10px; font-size:0.9em; color:#666;"><em>${correctionMsg}</em></p>
    `;
}

// Initial load
loadData();
