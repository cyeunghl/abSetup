from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"]
COLUMN_RANGE = list(range(1, 13))
NEGATIVE_CONTROL = "HB-44976-b1"
LIVE_DEAD_CONTROL = "live:dead"
UNSTAINED_CONTROL = "unstained"


def _well_positions(orientation: str) -> List[Tuple[str, int]]:
    positions: List[Tuple[str, int]] = []
    if orientation == "vertical":
        for column in COLUMN_RANGE:
            for row in ROW_LABELS:
                if row == "A" and column in {1, 2}:
                    continue
                positions.append((row, column))
    else:
        for row in ROW_LABELS:
            for column in COLUMN_RANGE:
                if row == "A" and column in {1, 2}:
                    continue
                positions.append((row, column))
    return positions


def _format_well_id(row: str, column: int) -> str:
    return f"{row}{column}"


def _assign_well(row: str, column: int, label: str, cell_line: str, timepoint: float) -> Dict[str, object]:
    return {
        "well_id": _format_well_id(row, column),
        "row": row,
        "column": column,
        "test_article": label,
        "cell_line": cell_line,
        "timepoint": timepoint,
    }


def _yield_assignment_positions(orientation: str) -> Iterable[Tuple[str, int]]:
    return _well_positions(orientation)


def _validate_capacity(test_article_count: int) -> None:
    required_wells = 2 + (test_article_count * 2) + 4
    max_wells = len(ROW_LABELS) * len(COLUMN_RANGE)
    if required_wells > max_wells:
        raise ValueError(
            "The selected number of test articles exceeds the capacity of a 96-well plate."
        )


def generate_plate_maps(
    test_articles: List[str],
    cell_lines: List[str],
    timepoints: List[float],
    *,
    orientation: str = "horizontal",
) -> List[Dict[str, object]]:
    _validate_capacity(len(test_articles))

    plates: List[Dict[str, object]] = []

    for cell_line in cell_lines:
        for timepoint in timepoints:
            wells: List[Dict[str, object]] = []
            # Add negative controls to A1 and A2
            wells.append(_assign_well("A", 1, NEGATIVE_CONTROL, cell_line, timepoint))
            wells.append(_assign_well("A", 2, NEGATIVE_CONTROL, cell_line, timepoint))

            position_iter = iter(_yield_assignment_positions(orientation))

            for article in test_articles:
                for _ in range(2):  # duplicates
                    row, column = next(position_iter)
                    wells.append(_assign_well(row, column, article, cell_line, timepoint))

            for control_label in (LIVE_DEAD_CONTROL, UNSTAINED_CONTROL):
                for _ in range(2):
                    row, column = next(position_iter)
                    wells.append(_assign_well(row, column, control_label, cell_line, timepoint))

            wells.sort(
                key=lambda well: (
                    ROW_LABELS.index(well["row"]),
                    well["column"],
                )
            )
            plates.append({"cell_line": cell_line, "timepoint": timepoint, "wells": wells})

    return plates


def calculate_concentrations(
    items: List[Dict[str, object]],
    final_conc: float,
    total_volume: float,
) -> List[Dict[str, object]]:

    if final_conc <= 0 or total_volume <= 0:
        raise ValueError("Final concentration and total volume must be positive values.")

    results: List[Dict[str, object]] = []
    for item in items:
        stock = float(item["stock_concentration_uM"])
        if stock <= 0:
            raise ValueError("Stock concentration must be greater than zero.")
        if final_conc > stock:
            raise ValueError(
                f"Final concentration ({final_conc} µM) cannot exceed stock concentration ({stock} µM)."
            )

        source_volume = (final_conc / stock) * total_volume
        diluent_volume = total_volume - source_volume

        results.append(
            {
                "test_article": item["test_article"],
                "stock_concentration_uM": stock,
                "final_concentration_uM": final_conc,
                "total_volume_uL": total_volume,
                "source_volume_uL": round(source_volume, 2),
                "diluent_volume_uL": round(diluent_volume, 2),
            }
        )

    return results


def calculate_phrodo_requirements(
    number_of_timepoints: int,
    number_of_test_articles: int,
    number_of_cell_lines: int,
    replicates_per_condition: int,
    volume_per_replicate_uL: float,
    overage_percent: float,
) -> Dict[str, float]:
    total_conditions = (
        number_of_timepoints * number_of_test_articles * number_of_cell_lines * replicates_per_condition
    )

    if total_conditions <= 0 or volume_per_replicate_uL <= 0:
        raise ValueError("Input values must be greater than zero.")

    if overage_percent < 0:
        raise ValueError("Overage percent cannot be negative.")

    overage_multiplier = 1 + (overage_percent / 100)

    total_volume = total_conditions * volume_per_replicate_uL * overage_multiplier
    phrodo_volume = total_volume / 40
    diluent_volume = total_volume - phrodo_volume

    return {
        "total_volume_uL": round(total_volume, 2),
        "phrodo_volume_uL": round(phrodo_volume, 2),
        "diluent_volume_uL": round(diluent_volume, 2),
    }
