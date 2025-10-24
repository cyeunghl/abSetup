# Antibody Assay Setup Toolkit

This project provides a lightweight Python backend and a static frontend for planning antibody assay plates, dilution calculations, and mastermix preparation.

## Getting Started

### Backend

The backend relies only on the Python standard library. Start it with:

```bash
python backend/app/main.py
```

The API will be served on `http://localhost:8000`.

### Frontend

Serve the static frontend with any web server. For example, using Python:

```bash
python -m http.server 5173 --directory frontend
```

Then open `http://localhost:5173` in your browser. The frontend automatically targets the backend at `http://localhost:8000` when running locally.

If you are using a remote development environment (such as GitHub Codespaces) or have the API exposed on a different host, append `?apiBase=<url>` to the frontend URL to override the detected API location. For example:

```
https://<your-env>-5173.preview.app.github.dev/?apiBase=https://<your-env>-8000.preview.app.github.dev
```

## Features

- 96-well plate map generation with technical duplicates, controls, and per cell line/timepoint combinations.
- Concentration calculator to compute source and PBS volumes for desired assay concentrations.
- Reagent B mastermix calculator with 10% overage and 40× dilution handling.
- CSV export or clipboard copy of plate layouts.

All data is handled in memory—no database required.
