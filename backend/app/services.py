from __future__ import annotations

from typing import Iterable, List, Tuple

from .schemas import (
    ConcentrationCalculation,
    ConcentrationRequest,
    Plate,
    ReagentBCalculationRequest,
    ReagentBCalculationResponse,
    Well,
)

ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"]
COLUMN_RANGE = list(range(1, 13))
NEGATIVE_CONTROL = "HB-44976-b1"
LIVE_DEAD_CONTROL = "live:dead"
UNSTAINED_CONTROL = "unstained"


def _well_positions() -> List[Tuple[str, int]]:
    positions: List[Tuple[str, int]] = []
    for row in ROW_LABELS:
        for column in COLUMN_RANGE:
            positions.append((row, column))
    return positions


ALL_POSITIONS = _well_positions()


def _format_well_id(row: str, column: int) -> str:
    return f"{row}{column}"


def _assign_well(row: str, column: int, label: str, cell_line: str, timepoint: float) -> Well:
    return Well(
        well_id=_format_well_id(row, column),
        row=row,
        column=column,
        test_article=label,
        cell_line=cell_line,
        timepoint=timepoint,
    )


def _yield_assignment_positions() -> Iterable[Tuple[str, int]]:
    # Skip the first two wells reserved for negative controls
    return ALL_POSITIONS[2:]


def _validate_capacity(test_article_count: int) -> None:
    required_wells = 2 + (test_article_count * 2) + 4
    max_wells = len(ALL_POSITIONS)
    if required_wells > max_wells:
        raise ValueError(
            "The selected number of test articles exceeds the capacity of a 96-well plate."
        )


def generate_plate_maps(
    test_articles: List[str],
    cell_lines: List[str],
    timepoints: List[float],
) -> List[Plate]:
    _validate_capacity(len(test_articles))

    plates: List[Plate] = []

    for cell_line in cell_lines:
        for timepoint in timepoints:
            wells: List[Well] = []
            # Add negative controls to A1 and A2
            wells.append(_assign_well("A", 1, NEGATIVE_CONTROL, cell_line, timepoint))
            wells.append(_assign_well("A", 2, NEGATIVE_CONTROL, cell_line, timepoint))

            position_iter = iter(_yield_assignment_positions())

            for article in test_articles:
                for _ in range(2):  # duplicates
                    row, column = next(position_iter)
                    wells.append(_assign_well(row, column, article, cell_line, timepoint))

            for control_label in (LIVE_DEAD_CONTROL, UNSTAINED_CONTROL):
                for _ in range(2):
                    row, column = next(position_iter)
                    wells.append(_assign_well(row, column, control_label, cell_line, timepoint))

            wells.sort(key=lambda w: (ROW_LABELS.index(w.row), w.column))
            plates.append(Plate(cell_line=cell_line, timepoint=timepoint, wells=wells))

    return plates


def calculate_concentrations(request: ConcentrationRequest) -> List[ConcentrationCalculation]:
    final_conc = request.final_concentration_uM
    total_volume = request.total_volume_uL

    if final_conc <= 0 or total_volume <= 0:
        raise ValueError("Final concentration and total volume must be positive values.")

    results: List[ConcentrationCalculation] = []
    for item in request.items:
        stock = item.stock_concentration_uM
        if stock <= 0:
            raise ValueError("Stock concentration must be greater than zero.")
        if final_conc > stock:
            raise ValueError(
                f"Final concentration ({final_conc} µM) cannot exceed stock concentration ({stock} µM)."
            )

        source_volume = (final_conc / stock) * total_volume
        diluent_volume = total_volume - source_volume

        results.append(
            ConcentrationCalculation(
                test_article=item.test_article,
                stock_concentration_uM=stock,
                final_concentration_uM=final_conc,
                total_volume_uL=total_volume,
                source_volume_uL=round(source_volume, 2),
                diluent_volume_uL=round(diluent_volume, 2),
            )
        )

    return results


def calculate_reagent_b_requirements(
    request: ReagentBCalculationRequest,
) -> ReagentBCalculationResponse:
    total_conditions = (
        request.number_of_timepoints
        * request.number_of_test_articles
        * request.number_of_cell_lines
        * request.replicates_per_condition
    )

    total_volume = total_conditions * request.volume_per_replicate_uL * 1.1
    reagent_b_volume = total_volume / 40
    diluent_volume = total_volume - reagent_b_volume

    return ReagentBCalculationResponse(
        total_volume_uL=round(total_volume, 2),
        reagent_b_volume_uL=round(reagent_b_volume, 2),
        diluent_volume_uL=round(diluent_volume, 2),
    )
