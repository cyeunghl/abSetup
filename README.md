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

- 96-well plate map generation with configurable replicates per condition, automatic control placement immediately after the final test article, horizontal/vertical filling, and default cell line/timepoint seeds.
- Concentration calculator to compute source and PBS volumes with one-click population from the plate setup, bulk paste support, clipboard export, and instant reset.
- pHrodo mastermix (pHrodo) calculator with configurable overage, one-click plate value imports, and automatic 40× dilution handling plus aliquot volume reporting.
- Experiment naming flows that feed into clipboard exports and generate dated CSV/XLSX filenames alongside formatted 8×12 tables and consolidated workbooks covering plate layouts, dilution planning, and pHrodo results.

All data is handled in memory—no database required.
