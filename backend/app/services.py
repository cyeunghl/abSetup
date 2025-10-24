from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"]
COLUMN_RANGE = list(range(1, 13))

Coordinate = Tuple[str, int]
NEGATIVE_CONTROL = "HB-44976-b1"
LIVE_DEAD_CONTROL = "live:dead"
UNSTAINED_CONTROL = "unstained"


def _horizontal_groups(replicates: int) -> List[Sequence[Coordinate]]:
    groups: List[Sequence[Coordinate]] = []
    for row in ROW_LABELS:
        start_column = replicates + 1 if row == "A" else 1
        for column in range(start_column, COLUMN_RANGE[-1] + 1, replicates):
            group: List[Coordinate] = []
            for offset in range(replicates):
                candidate_column = column + offset
                if candidate_column > COLUMN_RANGE[-1]:
                    break
                group.append((row, candidate_column))
            if len(group) == replicates:
                groups.append(tuple(group))
    return groups


def _vertical_groups(replicates: int) -> List[Sequence[Coordinate]]:
    groups: List[Sequence[Coordinate]] = []
    for start in range(1, COLUMN_RANGE[-1] + 1, replicates):
        window = [start + offset for offset in range(replicates)]
        if window[-1] > COLUMN_RANGE[-1]:
            break
        for row in ROW_LABELS[1:]:  # Skip row A to preserve control wells
            groups.append(tuple((row, column) for column in window))
    return groups


def _assignment_groups(orientation: str, replicates: int) -> List[Sequence[Coordinate]]:
    groups = (
        _vertical_groups(replicates)
        if orientation == "vertical"
        else _horizontal_groups(replicates)
    )

    if len(groups) < 2:
        raise ValueError("Unable to resolve plate layout for the requested orientation.")

    return groups


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
def _validate_replicates(replicates: int) -> int:
    if replicates <= 0:
        raise ValueError("Replicates must be greater than zero.")
    if replicates > COLUMN_RANGE[-1]:
        raise ValueError("Replicates cannot exceed the number of columns in the plate.")
    return replicates


def _validate_capacity(test_article_count: int, orientation: str, replicates: int) -> None:
    available_groups = _assignment_groups(orientation, replicates)
    if test_article_count + 2 > len(available_groups):
        raise ValueError(
            "The selected number of test articles exceeds the capacity of a 96-well plate."
        )


def generate_plate_maps(
    test_articles: List[str],
    cell_lines: List[str],
    timepoints: List[float],
    *,
    orientation: str = "horizontal",
    replicates: int = 2,
) -> List[Dict[str, object]]:
    replicates = _validate_replicates(replicates)
    _validate_capacity(len(test_articles), orientation, replicates)

    assignment_groups = _assignment_groups(orientation, replicates)

    plates: List[Dict[str, object]] = []

    for cell_line in cell_lines:
        for timepoint in timepoints:
            wells: List[Dict[str, object]] = []
            # Add negative controls to A1 and A2
            for column in range(1, replicates + 1):
                wells.append(
                    _assign_well("A", column, NEGATIVE_CONTROL, cell_line, timepoint)
                )

            group_index = 0
            for article in test_articles:
                group = assignment_groups[group_index]
                group_index += 1
                for row, column in group:
                    wells.append(
                        _assign_well(row, column, article, cell_line, timepoint)
                    )

            if group_index + 2 > len(assignment_groups):
                raise ValueError(
                    "Plate layout does not have sufficient space for control wells."
                )

            for control_label, pair in zip(
                (LIVE_DEAD_CONTROL, UNSTAINED_CONTROL),
                assignment_groups[group_index : group_index + 2],
            ):
                for row, column in pair:
                    wells.append(
                        _assign_well(row, column, control_label, cell_line, timepoint)
                    )

            group_index += 2

            wells.sort(
                key=lambda well: (
                    ROW_LABELS.index(well["row"]),
                    well["column"],
                )
            )
            plates.append(
                {
                    "cell_line": cell_line,
                    "timepoint": timepoint,
                    "replicates": replicates,
                    "wells": wells,
                }
            )

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
    aliquot_volume = total_volume / 8

    return {
        "total_volume_uL": round(total_volume, 2),
        "phrodo_volume_uL": round(phrodo_volume, 2),
        "diluent_volume_uL": round(diluent_volume, 2),
        "aliquot_volume_uL": round(aliquot_volume, 2),
    }
