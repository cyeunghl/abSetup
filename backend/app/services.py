from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"]
COLUMN_RANGE = list(range(1, 13))
NEGATIVE_CONTROL = "HB-44976-b1"
LIVE_DEAD_CONTROL = "live:dead"
UNSTAINED_CONTROL = "unstained"


def _well_positions() -> List[Tuple[str, int]]:
    positions: List[Tuple[str, int]] = []
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
        for row in ROW_LABELS:
            # For row A, skip the first N columns (reserved for NEGATIVE_CONTROL)
            if row == "A":
                if start <= replicates:
                    continue  # Skip groups that overlap with NEGATIVE_CONTROL columns
            groups.append(tuple((row, column) for column in window))
    return groups


def _assignment_groups(orientation: str, replicates: int) -> List[Sequence[Coordinate]]:
    groups = (
        _vertical_groups(replicates)
        if orientation == "vertical"
        else _horizontal_groups(replicates)
    )


ALL_POSITIONS = _well_positions()


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


def _validate_capacity(
    test_article_count: int, orientation: str, replicates: int, controls_needed: int = 2
) -> None:
    available_groups = _assignment_groups(orientation, replicates)
    if test_article_count + controls_needed > len(available_groups):
        raise ValueError(
            "The selected number of test articles exceeds the capacity of a 96-well plate."
        )


def _generate_single_cell_line_wells(
    cell_line: str,
    timepoint: float,
    test_articles: List[str],
    assignment_groups: List[Sequence[Coordinate]],
    group_index: int,
    replicates: int,
    include_live_dead: bool,
    include_unstained: bool,
    negative_control_start_column: int = 1,
) -> Tuple[List[Dict[str, object]], int]:
    """Generate wells for a single cell line and return the updated group_index."""
    wells: List[Dict[str, object]] = []
    # Add negative controls to N columns of row A starting at negative_control_start_column
    for offset in range(replicates):
        column = negative_control_start_column + offset
        if column > COLUMN_RANGE[-1]:
            raise ValueError("Insufficient space for negative controls in row A.")
        wells.append(
            _assign_well("A", column, NEGATIVE_CONTROL, cell_line, timepoint)
        )

    current_group_index = group_index
    for article in test_articles:
        if current_group_index >= len(assignment_groups):
            raise ValueError("Insufficient space for test articles.")
        group = assignment_groups[current_group_index]
        current_group_index += 1
        for row, column in group:
            wells.append(
                _assign_well(row, column, article, cell_line, timepoint)
            )

    # Calculate how many controls we need
    controls_needed = sum([include_live_dead, include_unstained])
    if current_group_index + controls_needed > len(assignment_groups):
        raise ValueError(
            "Plate layout does not have sufficient space for control wells."
        )

    control_labels = []
    if include_live_dead:
        control_labels.append(LIVE_DEAD_CONTROL)
    if include_unstained:
        control_labels.append(UNSTAINED_CONTROL)

    for control_label, pair in zip(
        control_labels,
        assignment_groups[current_group_index : current_group_index + controls_needed],
    ):
        for row, column in pair:
            wells.append(
                _assign_well(row, column, control_label, cell_line, timepoint)
            )

    current_group_index += controls_needed
    return wells, current_group_index


def generate_plate_maps(
    test_articles: List[str],
    cell_lines: List[str],
    timepoints: List[float],
    *,
    orientation: str = "horizontal",
    replicates: int = 2,
    include_live_dead: bool = True,
    include_unstained: bool = True,
    condense_cell_lines: bool = False,
) -> List[Dict[str, object]]:
    replicates = _validate_replicates(replicates)
    controls_needed = sum([include_live_dead, include_unstained])
    items_per_cell_line = len(test_articles) + controls_needed
    _validate_capacity(items_per_cell_line, orientation, replicates, 0)

    assignment_groups = _assignment_groups(orientation, replicates)

    plates: List[Dict[str, object]] = []

    if condense_cell_lines and len(cell_lines) > 1:
        # Calculate how many cell lines can fit per plate
        # Each cell line needs: replicates (for negative controls) + items_per_cell_line groups
        # But negative controls are in row A, so we need to check if we have enough row A columns
        max_negative_controls_in_row_a = COLUMN_RANGE[-1] // replicates
        max_cell_lines_by_controls = max_negative_controls_in_row_a
        max_cell_lines_by_groups = len(assignment_groups) // items_per_cell_line
        max_cell_lines_per_plate = min(max_cell_lines_by_controls, max_cell_lines_by_groups)
        
        if max_cell_lines_per_plate < 1:
            raise ValueError(
                "Cannot condense cell lines: insufficient space on plate. "
                "Each cell line requires more groups or negative control columns than available."
            )

        for timepoint in timepoints:
            # Group cell lines into batches that fit on one plate
            cell_line_batches = []
            for i in range(0, len(cell_lines), max_cell_lines_per_plate):
                batch = cell_lines[i : i + max_cell_lines_per_plate]
                cell_line_batches.append(batch)

            for batch in cell_line_batches:
                wells: List[Dict[str, object]] = []
                group_index = 0
                plate_cell_lines = []
                negative_control_column = 1

                for cell_line in batch:
                    cell_wells, group_index = _generate_single_cell_line_wells(
                        cell_line,
                        timepoint,
                        test_articles,
                        assignment_groups,
                        group_index,
                        replicates,
                        include_live_dead,
                        include_unstained,
                        negative_control_start_column=negative_control_column,
                    )
                    wells.extend(cell_wells)
                    plate_cell_lines.append(cell_line)
                    # Move to next set of columns for negative controls
                    negative_control_column += replicates

                wells.sort(
                    key=lambda well: (
                        ROW_LABELS.index(well["row"]),
                        well["column"],
                    )
                )
                plates.append(
                    {
                        "cell_lines": plate_cell_lines,
                        "timepoint": timepoint,
                        "replicates": replicates,
                        "wells": wells,
                    }
                )
    else:
        # Original behavior: one plate per cell_line × timepoint
        for cell_line in cell_lines:
            for timepoint in timepoints:
                wells, _ = _generate_single_cell_line_wells(
                    cell_line,
                    timepoint,
                    test_articles,
                    assignment_groups,
                    0,
                    replicates,
                    include_live_dead,
                    include_unstained,
                )

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


def calculate_reagent_b_requirements(
    number_of_timepoints: int,
    number_of_test_articles: int,
    number_of_cell_lines: int,
    replicates_per_condition: int,
    volume_per_replicate_uL: float,
) -> Dict[str, float]:
    total_conditions = (
        number_of_timepoints * number_of_test_articles * number_of_cell_lines * replicates_per_condition
    )

    total_volume = total_conditions * volume_per_replicate_uL * 1.1
    reagent_b_volume = total_volume / 40
    diluent_volume = total_volume - reagent_b_volume

    return {
        "total_volume_uL": round(total_volume, 2),
        "reagent_b_volume_uL": round(reagent_b_volume, 2),
        "diluent_volume_uL": round(diluent_volume, 2),
    }
