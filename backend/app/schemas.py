from typing import List, Optional

from pydantic import BaseModel, Field, validator


class PlateMapRequest(BaseModel):
    test_articles: List[str] = Field(..., min_items=1)
    cell_lines: List[str] = Field(..., min_items=1)
    timepoints: List[float] = Field(..., min_items=1)

    @validator("test_articles", each_item=True)
    def validate_test_article(cls, value: str) -> str:
        if not value.startswith("HA-00"):
            raise ValueError("Each test article must start with 'HA-00'")
        return value


class Well(BaseModel):
    well_id: str
    row: str
    column: int
    test_article: str
    cell_line: str
    timepoint: float


class Plate(BaseModel):
    cell_line: str
    timepoint: float
    wells: List[Well]


class PlateMapResponse(BaseModel):
    plates: List[Plate]


class ConcentrationInput(BaseModel):
    test_article: str
    stock_concentration_uM: float = Field(..., gt=0)


class ConcentrationRequest(BaseModel):
    items: List[ConcentrationInput] = Field(..., min_items=1)
    final_concentration_uM: float = Field(..., gt=0)
    total_volume_uL: float = Field(..., gt=0)


class ConcentrationCalculation(BaseModel):
    test_article: str
    stock_concentration_uM: float
    final_concentration_uM: float
    total_volume_uL: float
    source_volume_uL: float
    diluent_volume_uL: float


class ReagentBCalculationRequest(BaseModel):
    number_of_timepoints: int = Field(..., gt=0)
    number_of_test_articles: int = Field(..., gt=0)
    number_of_cell_lines: int = Field(..., gt=0)
    replicates_per_condition: int = Field(..., gt=0)
    volume_per_replicate_uL: float = Field(..., gt=0)


class ReagentBCalculationResponse(BaseModel):
    total_volume_uL: float
    reagent_b_volume_uL: float
    diluent_volume_uL: float
