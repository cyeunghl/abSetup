# Antibody Assay Setup Toolkit

This project provides a lightweight Python backend and a static frontend for planning antibody assay plates, dilution calculations, and mastermix preparation.

## Getting Started

### Backend + Frontend

The backend now serves the single-page interface directly, so one command starts everything:

```bash
python backend/app/main.py
```

Open `http://localhost:8000` in your browser to interact with the app. The root page loads the frontend and all API calls go to the same origin, so there is no longer a need to juggle multiple ports or overrides.

If you are working in a remote development environment (e.g. GitHub Codespaces), expose port `8000` and visit the forwarded URL. The interface will automatically speak to the same host. If you prefer to host the frontend separately, you can still override the API location by appending `?apiBase=<url>` to the page URL.

## Features

- 96-well plate map generation with technical duplicates, controls, and per cell line/timepoint combinations.
- Concentration calculator to compute source and PBS volumes for desired assay concentrations.
- Reagent B mastermix calculator with 10% overage and 40× dilution handling.
- CSV export or clipboard copy of plate layouts.

All data is handled in memory—no database required.
