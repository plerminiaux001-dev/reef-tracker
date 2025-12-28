// --- ⬇️ CONFIGURATION AREA ⬇️ ---
const API_URL = "https://script.google.com/macros/s/AKfycbx3kGuD6DuZDGs7FJmbMtwLEQBWMsLwUV_BGLwknEhQanE-r2-dOphooa6_pP1U0dEo/exec";
const TANK_GAL = 35;
const TANK_LITERS = TANK_GAL * 3.78541;
const CA_IMPACT_PER_100L = 1.4; // ppm per 100L per mL
const CA_IMPACT_FACTOR = CA_IMPACT_PER_100L * (100 / TANK_LITERS); // ppm per mL for this tank
const RATIO_P2 = 2.0;
const RATIO_P3 = 0.5;
const RATIO_P4 = 0.5;
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
            // Toggle dataset visibility
            chartInstance.data.datasets[idx].hidden = !isChecked;
            chartInstance.update();
        }
    });
});

// Fetch data from Google Sheets / Apps Script
async function loadData(forceRefresh = false) {
    if (!statusDisplay) return;
    
    // ⬇️ SPINNER LOGIC ADDED HERE ⬇️
    if (logs.length === 0 || forceRefresh) {
        statusDisplay.innerHTML = `
            <div style="grid-column: span 3; text-align: center; padding: 20px;">
                <div class="spinner"></div>
                <div style="margin-top: 10px; color: #666; font-size: 0.9em;">Syncing with Reef Cloud...</div>
            </div>
        `;
    }
    // ⬆️ END SPINNER LOGIC ⬆️

    try {
        const resp = await fetch(API_URL);
        if (!resp.ok) throw new Error('Network response was not ok: ' + resp.status);
        const data = await resp.json();

        // Map + validate
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

// Submit new log
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

    // Optimistic UI update
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
    [...logs].slice().reverse().forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.date || '-'}</td>
            <td>${log.alk ?? '-'}</td>
            <td>${log.ca ?? '-'}</td>
            <td>${log.mg ?? '-'}</td>
            <td>${log.no3 ?? '-'}</td>
            <td>${log.po4 ?? '-'}</td>
            <td>${log.ph ?? '-'}</td>
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

    const getStatus = (val, min, max) => {
        if (val === null || val === undefined) return 'warn';
        if (val >= min && val <= max) return 'good';
        if (val < min) return 'warn';
        return 'bad';
    };

    const alkClass = getStatus(last.alk, 8, 10);
    const caClass = getStatus(last.ca, 400, 450);
    const no3Class = getStatus(last.no3, 2, 10);

    statusDisplay.innerHTML = `
        <div class="status-box ${alkClass}">Alk: ${last.alk ?? '?'}</div>
        <div class="status-box ${caClass}">Ca: ${last.ca ?? '?'}</div>
        <div class="status-box ${no3Class}">NO3: ${last.no3 ?? '?'}</div>
    `;
}

function renderChart() {
    const labels = logs.map(l => l.date);
    
    // Dataset Order MUST match HTML checkbox "data-idx" order:
    // 0: Alk, 1: Ca, 2: Mg, 3: NO3, 4: PO4, 5: pH
    const datasets = [
        // 0. Alk (Left Axis)
        { 
            label: 'Alk', 
            data: logs.map(l => l.alk), 
            borderColor: '#007bff', 
            backgroundColor: '#007bff', 
            yAxisID: 'y',
            spanGaps: true 
        },
        // 1. Ca (Right Axis)
        { 
            label: 'Ca',  
            data: logs.map(l => l.ca),  
            borderColor: '#6f42c1', 
            backgroundColor: '#6f42c1', 
            yAxisID: 'y1',
            spanGaps: true 
        },
        // 2. Mg (Right Axis)
        { 
            label: 'Mg',  
            data: logs.map(l => l.mg),  
            borderColor: '#fd7e14', 
            backgroundColor: '#fd7e14', 
            yAxisID: 'y1',
            spanGaps: true 
        },
        // 3. NO3 (Left Axis)
        { 
            label: 'NO3', 
            data: logs.map(l => l.no3), 
            borderColor: '#28a745', 
            backgroundColor: '#28a745', 
            yAxisID: 'y',
            spanGaps: true 
        },
        // 4. PO4 (Left Axis)
        { 
            label: 'PO4', 
            data: logs.map(l => l.po4), 
            borderColor: '#20c997', 
            backgroundColor: '#20c997', 
            yAxisID: 'y',
            spanGaps: true 
        },
        // 5. pH (Left Axis)
        { 
            label: 'pH',  
            data: logs.map(l => l.ph),  
            borderColor: '#dc3545', 
            backgroundColor: '#dc3545', 
            yAxisID: 'y',
            spanGaps: true 
        }
    ];

    // If chart exists, update data
    if (chartInstance) {
        chartInstance.data.labels = labels;
        datasets.forEach((ds, i) => {
            chartInstance.data.datasets[i].data = ds.data;
        });
        chartInstance.update();
        return;
    }

    // Initialize chart
    chartInstance = new Chart(tankCtx, {
        type: 'line',
        data: {
            labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: { 
                legend: { display: false } 
            },
            scales: {
                x: { 
                    display: true,
                    grid: { color: '#eee' }
                },
                // LEFT AXIS (Small numbers)
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Alk / pH / Nutrients' },
                    grid: { color: '#eee' }
                },
                // RIGHT AXIS (Big numbers)
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Calcium / Magnesium' },
                    grid: { drawOnChartArea: false } // Cleaner look
                },
            }
        }
    });

    // Set initial visibility based on checked boxes
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
