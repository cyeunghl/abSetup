from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    ConcentrationCalculation,
    ConcentrationRequest,
    PlateMapRequest,
    PlateMapResponse,
    ReagentBCalculationRequest,
    ReagentBCalculationResponse,
)
from .services import (
    calculate_concentrations,
    generate_plate_maps,
    calculate_reagent_b_requirements,
)

app = FastAPI(title="Antibody Assay Setup API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root() -> dict:
    return {"message": "Antibody Assay Setup API is running"}


@app.post("/plate-map", response_model=PlateMapResponse)
def create_plate_map(request: PlateMapRequest) -> PlateMapResponse:
    try:
        plates = generate_plate_maps(
            test_articles=request.test_articles,
            cell_lines=request.cell_lines,
            timepoints=request.timepoints,
        )
    except ValueError as exc:  # pragma: no cover - runtime safeguard
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlateMapResponse(plates=plates)


@app.post("/dilutions", response_model=List[ConcentrationCalculation])
def calculate_dilutions(request: ConcentrationRequest) -> List[ConcentrationCalculation]:
    try:
        return calculate_concentrations(request)
    except ValueError as exc:  # pragma: no cover - runtime safeguard
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/reagent-b", response_model=ReagentBCalculationResponse)
def calculate_reagent_b(request: ReagentBCalculationRequest) -> ReagentBCalculationResponse:
    calculation = calculate_reagent_b_requirements(request)
    return calculation
