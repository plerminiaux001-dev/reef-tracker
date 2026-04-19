389 Reef Command Center

A web-based dashboard for reef aquarium enthusiasts to track water parameters, calculate dosing schedules, and manage saltwater mixing — all in one place.

Features

Dashboard

Real-time Status Display: View current alkalinity, calcium, and nitrate levels with color-coded indicators (green = optimal, yellow = caution, red = needs attention)

Parameter Logging: Record daily water test results including Alkalinity, Calcium, Magnesium, Nitrate, Phosphate, and pH.

Trend Charts: Interactive Chart.js graphs to visualize parameter trends over time with toggleable data series.

History Table: Complete log of all recorded measurements with status highlighting.

Dosing Assistant (Not A Feesh 2-Part)

NAF Calculator: Automatically calculates dosing amounts based on your tank's Alkalinity (dKH) consumption rate.

True Consumption Tracking: Analyzes historical log entries and your current daily dose to find the true daily uptake of your tank.

Balanced 1:1 Dosing: Calculates the precise daily dosage needed for both Part 1 (Alk/NaOH) and Part 2 (Ca/Mg/Trace).

Correction dose calculation: Automatically suggests one-time correction doses when Alkalinity falls below target.

Dosing Instructions

Hydros Blenny Configuration: Setup guide for dosing pumps including proper scheduling offsets to prevent precipitation.

Not A Feesh System Guide: Information on the NaOH-based pH boosting properties and proper 1:1 dosing ratios.

Salt Mixer

Red Sea Coral Pro Calculator: Calculates the exact amount of salt needed (in grams and cups) based on water volume and target specific gravity.

Configuration

The application is pre-configured for a 35-gallon tank. Key settings are integrated into the primary logic:

const TANK_GAL = 35;
const NAF_ALK_MULTIPLIER = 0.5462436637; // NAF formula constant

// Safe parameter ranges
const RANGES = {
    alk: { min: 8.0, max: 10.0 },
    ca:  { min: 400, max: 460 },
    mg:  { min: 1250, max: 1450 },
    no3: { min: 1,   max: 15 },
    po4: { min: 0.02, max: 0.1 },
    ph:  { min: 8.0, max: 8.4 }
};


Tech Stack

HTML5 / CSS3: Modern responsive layout with glassmorphism design.

Vanilla JavaScript: Consolidated architecture with no framework dependencies.

Chart.js: Interactive parameter trend visualization.

Google Apps Script: Cloud backend for data persistence.

Deployment

This project uses development environment detection. URLs containing dev-- in the hostname will display a "DEV MODE" indicator. Deployed via Netlify on push to the main branch.

License

MIT
