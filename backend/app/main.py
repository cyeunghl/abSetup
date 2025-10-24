"""Lightweight HTTP server implementing the antibody assay API and static UI."""

from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import urlparse

import mimetypes

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


def _load_static_file(request_path: str) -> Tuple[bytes, str]:
    """Return the bytes and mime type for a frontend asset."""

    safe_root = FRONTEND_DIR.resolve()
    candidate = (safe_root / request_path.lstrip("/")).resolve()

    if not str(candidate).startswith(str(safe_root)) or not candidate.is_file():
        raise FileNotFoundError(request_path)

    mime_type, _ = mimetypes.guess_type(candidate)
    with candidate.open("rb") as file_handle:
        return file_handle.read(), mime_type or "application/octet-stream"

try:  # pragma: no cover - import shim for direct execution
    from .services import (
        calculate_concentrations,
        calculate_reagent_b_requirements,
        generate_plate_maps,
    )
except ImportError:  # pragma: no cover - fallback when run as a script
    import sys
    from pathlib import Path

    CURRENT_DIR = Path(__file__).resolve().parent
    if str(CURRENT_DIR) not in sys.path:
        sys.path.insert(0, str(CURRENT_DIR))

    from services import (  # type: ignore
        calculate_concentrations,
        calculate_reagent_b_requirements,
        generate_plate_maps,
    )


def _json_response(handler: BaseHTTPRequestHandler, status: HTTPStatus, payload: Any) -> None:
    data = json.dumps(payload).encode("utf-8")
    handler.send_response(status.value)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(data)


def _json_error(handler: BaseHTTPRequestHandler, status: HTTPStatus, message: str) -> None:
    _json_response(handler, status, {"detail": message})


def _read_json_body(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    data = handler.rfile.read(length)
    try:
        return json.loads(data.decode("utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive programming
        raise ValueError("Invalid JSON payload") from exc


def _ensure_list_of_strings(key: str, value: Any) -> List[str]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"'{key}' must be a non-empty list")
    if not all(isinstance(item, str) and item.strip() for item in value):
        raise ValueError(f"Every entry in '{key}' must be a non-empty string")
    return [item.strip() for item in value]


def _ensure_list_of_numbers(key: str, value: Any) -> List[float]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"'{key}' must be a non-empty list")
    numbers: List[float] = []
    for item in value:
        if isinstance(item, (int, float)):
            numbers.append(float(item))
        elif isinstance(item, str) and item.strip():
            try:
                numbers.append(float(item))
            except ValueError as exc:
                raise ValueError(f"All entries in '{key}' must be numeric") from exc
        else:
            raise ValueError(f"All entries in '{key}' must be numeric")
    return numbers


def _validate_test_articles(articles: List[str]) -> List[str]:
    validated: List[str] = []
    for article in articles:
        if not article.startswith("HA-00"):
            raise ValueError("Each test article must start with 'HA-00'")
        validated.append(article)
    return validated


def _parse_plate_map_payload(payload: Dict[str, Any]) -> Tuple[List[str], List[str], List[float]]:
    test_articles = _validate_test_articles(
        _ensure_list_of_strings("test_articles", payload.get("test_articles"))
    )
    cell_lines = _ensure_list_of_strings("cell_lines", payload.get("cell_lines"))
    timepoints = _ensure_list_of_numbers("timepoints", payload.get("timepoints"))
    return test_articles, cell_lines, timepoints


def _parse_dilution_payload(payload: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], float, float]:
    items_raw = payload.get("items")
    if not isinstance(items_raw, list) or not items_raw:
        raise ValueError("'items' must be a non-empty list")

    items: List[Dict[str, Any]] = []
    for entry in items_raw:
        if not isinstance(entry, dict):
            raise ValueError("Each item must be an object")
        test_article = entry.get("test_article")
        stock = entry.get("stock_concentration_uM")
        if not isinstance(test_article, str) or not test_article.strip():
            raise ValueError("Each item must include 'test_article'")
        if not isinstance(stock, (int, float)):
            raise ValueError("Each item must include numeric 'stock_concentration_uM'")
        items.append(
            {
                "test_article": test_article.strip(),
                "stock_concentration_uM": float(stock),
            }
        )

    try:
        final_conc = float(payload.get("final_concentration_uM"))
        total_volume = float(payload.get("total_volume_uL"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Final concentration and total volume must be numeric values") from exc

    return items, final_conc, total_volume


def _parse_reagent_b_payload(payload: Dict[str, Any]) -> Tuple[int, int, int, int, float]:
    required_int_keys = (
        "number_of_timepoints",
        "number_of_test_articles",
        "number_of_cell_lines",
        "replicates_per_condition",
    )
    values: Dict[str, int] = {}
    for key in required_int_keys:
        value = payload.get(key)
        if not isinstance(value, (int, float)):
            raise ValueError(f"'{key}' must be a positive number")
        values[key] = int(value)

    volume = payload.get("volume_per_replicate_uL")
    if not isinstance(volume, (int, float)):
        raise ValueError("'volume_per_replicate_uL' must be a positive number")

    return (
        values["number_of_timepoints"],
        values["number_of_test_articles"],
        values["number_of_cell_lines"],
        values["replicates_per_condition"],
        float(volume),
    )


class AssayRequestHandler(BaseHTTPRequestHandler):
    server_version = "AssayServer/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # pragma: no cover - reduce noise
        return

    def end_headers(self) -> None:  # pragma: no cover - ensures CORS on all responses
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT.value)
        self.end_headers()

    def do_HEAD(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        normalized = parsed.path

        if normalized in {"", "/"}:
            self._serve_static("index.html", head_only=True)
            return

        if normalized in {"/app.js", "/styles.css"}:
            self._serve_static(normalized, head_only=True)
            return

        self.send_error(HTTPStatus.NOT_FOUND.value, "Not Found")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        normalized = parsed.path

        if normalized in {"", "/"}:
            return self._serve_static("index.html")

        if normalized in {"/app.js", "/styles.css"}:
            return self._serve_static(normalized)

        if normalized == "/api/health":
            _json_response(self, HTTPStatus.OK, {"message": "Antibody Assay Setup API is running"})
            return

        _json_error(self, HTTPStatus.NOT_FOUND, "Endpoint not found")

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = _read_json_body(self)
            if self.path == "/plate-map":
                self._handle_plate_map(payload)
            elif self.path == "/dilutions":
                self._handle_dilutions(payload)
            elif self.path == "/reagent-b":
                self._handle_reagent_b(payload)
            else:
                _json_error(self, HTTPStatus.NOT_FOUND, "Endpoint not found")
        except ValueError as exc:
            _json_error(self, HTTPStatus.BAD_REQUEST, str(exc))

    def _handle_plate_map(self, payload: Dict[str, Any]) -> None:
        test_articles, cell_lines, timepoints = _parse_plate_map_payload(payload)
        plates = generate_plate_maps(test_articles, cell_lines, timepoints)
        _json_response(self, HTTPStatus.OK, {"plates": plates})

    def _handle_dilutions(self, payload: Dict[str, Any]) -> None:
        items, final_conc, total_volume = _parse_dilution_payload(payload)
        results = calculate_concentrations(items, final_conc, total_volume)
        _json_response(self, HTTPStatus.OK, results)

    def _handle_reagent_b(self, payload: Dict[str, Any]) -> None:
        (
            number_of_timepoints,
            number_of_test_articles,
            number_of_cell_lines,
            replicates_per_condition,
            volume_per_replicate_uL,
        ) = _parse_reagent_b_payload(payload)
        result = calculate_reagent_b_requirements(
            number_of_timepoints,
            number_of_test_articles,
            number_of_cell_lines,
            replicates_per_condition,
            volume_per_replicate_uL,
        )
        _json_response(self, HTTPStatus.OK, result)

    def _serve_static(self, asset_path: str, *, head_only: bool = False) -> None:
        try:
            content, mime_type = _load_static_file(asset_path)
        except FileNotFoundError:
            _json_error(self, HTTPStatus.NOT_FOUND, "Asset not found")
            return

        self.send_response(HTTPStatus.OK.value)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


def run(host: str = "0.0.0.0", port: int = 8000) -> None:
    """Start the HTTP server."""

    with ThreadingHTTPServer((host, port), AssayRequestHandler) as httpd:
        print(f"Serving antibody assay API on http://{host}:{port}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:  # pragma: no cover - manual shutdown
            print("\nShutting down server...")


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    run()
