# reef-tracker
# 389 Reef Command Center

A web-based dashboard for reef aquarium enthusiasts to track water parameters, calculate dosing schedules, and manage saltwater mixing — all in one place.

## Features

### Dashboard
- **Real-time Status Display**: View current alkalinity, calcium, and nitrate levels with color-coded indicators (green = optimal, yellow = caution, red = needs attention)
- **Parameter Logging**: Record daily water test results including:
  - Alkalinity (dKH)
  - Calcium (ppm)
  - Magnesium (ppm)
  - Nitrate (ppm)
  - Phosphate (ppm)
  - pH
- **Trend Charts**: Interactive Chart.js graphs to visualize parameter trends over time with toggleable data series
- **History Table**: Complete log of all recorded measurements with status highlighting

### Dosing Assistant
- **Red Sea Recipe Calculator**: Automatically calculates dosing amounts based on your tank's calcium consumption rate
- **Multi-part dosing support**: Calculates proper ratios for Red Sea Complete Reef Care 4-part system
  - Part 1 (Calcium & Magnesium): Base dose
  - Part 2 (Alkalinity & pH): 2x base dose
  - Part 3 (Iodine): 0.5x base dose
  - Part 4 (Bio): 0.5x base dose
- **Correction dose calculation**: Automatically suggests correction doses when parameters are below target

### Dosing Instructions
- **Hydros Blenny Configuration**: Complete setup guide for 4-head doser including pump mapping and schedule offsets
- **Red Sea Parameter Guide**: Recommended levels for mixed reef, SPS dominant, and ULNS systems

### Salt Mixer
- **Red Sea Coral Pro Calculator**: Calculates the exact amount of salt needed (in grams and cups) based on water volume and target specific gravity

## Configuration

The application is pre-configured for a 35-gallon tank. Key settings in `script.js`:

```javascript
const TANK_GAL = 35;
const CA_IMPACT_PER_100L = 1.4; // ppm per 100L per mL of dosing solution

// Safe parameter ranges
const RANGES = {
    alk: { min: 8.0, max: 10.0 },
    ca:  { min: 400, max: 460 },
    mg:  { min: 1250, max: 1450 },
    no3: { min: 1,   max: 15 },
    po4: { min: 0.02, max: 0.1 },
    ph:  { min: 8.0, max: 8.4 }
};
```

## Tech Stack

- **HTML5 / CSS3**: Modern responsive layout with glassmorphism design
- **Vanilla JavaScript**: No framework dependencies
- **Chart.js**: Interactive parameter trend visualization
- **Google Apps Script**: Cloud backend for data persistence

## Development

This project uses development environment detection. URLs containing `dev--` in the hostname will display a "DEV MODE" indicator and modify the page styling to clearly distinguish development from production environments.

## Deployment

This site is deployed on Netlify. Simply push to the main branch to trigger a deployment.

## License

MIT
