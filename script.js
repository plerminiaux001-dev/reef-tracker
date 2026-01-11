function calculateDosing() {
    const cur = toNum(calcCurrentCaInput.value), tgt = toNum(calcTargetCaInput.value);
    if(!cur || !tgt) return alert("Enter Calcium values");
    
    let drop = 0, p1 = 0;
    const cl = logs.filter(l => l.ca != null);
    
    // 1. Calculate Daily Maintenance (Consumption)
    if(cl.length >= 2) {
        const n = cl[cl.length-1], o = cl[cl.length-2];
        const days = Math.abs((new Date(n.date) - new Date(o.date)) / (8.64e7)) || 1;
        drop = Math.max(0, (o.ca - n.ca) / days);
        p1 = drop / CA_IMPACT_FACTOR;
    }

    // 2. Calculate Correction (The Gap)
    const gap = tgt - cur;
    const totalCorrNeeded = gap > 5 ? (gap / CA_IMPACT_FACTOR) : 0;
    const daysToSplit = gap > 20 ? 3 : 1;
    const corrToday = totalCorrNeeded / daysToSplit;

    // 3. Define the Final Totals for "Today"
    // Only Part 1 gets the correction. Parts 2, 3, 4 only follow maintenance.
    const totP1 = p1 + corrToday;
    const totP2 = p1 * 2.0; 
    const totP3 = p1 * 0.5;
    const totP4 = p1 * 0.5;

    calcResults.style.display = 'block';
    calcResults.innerHTML = `
        <h3 style="color:#f1f5f9; margin-bottom:5px;">🧪 Red Sea Plan</h3>
        <p style="margin:0; font-size:0.9em; color:#94a3b8;">Consumption: <b>${drop.toFixed(1)} ppm/day</b></p>
        
        <div style="display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
            <div style="color:#cbd5e1;"><b>Part 1 (Ca)</b></div><div style="font-weight:bold; color:#a855f7;">${totP1.toFixed(1)} mL</div>
            <div style="color:#cbd5e1;">Part 2 (Alk)</div><div>${totP2.toFixed(1)} mL</div>
            <div style="color:#cbd5e1;">Part 3 (Iod)</div><div>${totP3.toFixed(1)} mL</div>
            <div style="color:#cbd5e1;">Part 4 (Bio)</div><div>${totP4.toFixed(1)} mL</div>
        </div>

        <div style="margin-top:15px; padding:10px; border:1px dashed #475569; border-radius:8px;">
            <h4 style="margin:0 0 5px 0; font-size:0.85em; color:#38bdf8; text-transform:uppercase;">📱 Blenny Pump Settings (Auto)</h4>
            <div style="font-family:monospace; font-size:0.9em; color:#cbd5e1;">
                P1: 4.0mL | P2: 8.0mL | P3: 2.0mL | P4: 2.0mL
            </div>
            <p style="margin:5px 0 0 0; font-size:0.75em; color:#94a3b8;">
                *Manual Boost: Add <b>${corrToday.toFixed(1)}mL</b> of Part 1 today.
            </p>
        </div>

        <p style="margin-top:10px; font-size:0.85em; color:${gap > 20 ? '#fbbf24' : '#94a3b8'};">
            ${gap > 5 ? `⚠️ Correction: Dose ${corrToday.toFixed(1)}mL extra for ${daysToSplit} days.` : '✅ Levels match target'}
        </p>`;
}
