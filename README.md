# Antibody Assay Setup Toolkit

This project provides a small FastAPI backend and a React + Tailwind frontend for planning antibody assay plates, dilution calculations, and mastermix preparation.

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be served on `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The development server runs on `http://localhost:5173` and proxies API requests to the FastAPI backend.

## Features

- 96-well plate map generation with technical duplicates, controls, and per cell line/timepoint combinations.
- Concentration calculator to compute source and PBS volumes for desired assay concentrations.
- Reagent B mastermix calculator with 10% overage and 40× dilution handling.
- CSV export or clipboard copy of plate layouts.

All data is handled in memory—no database required.
