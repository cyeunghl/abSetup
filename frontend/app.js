const API_BASE = 'http://localhost:8000';

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLUMN_LABELS = Array.from({ length: 12 }, (_, index) => index + 1);

const testArticlesInput = document.querySelector('#testArticles');
const cellLinesInput = document.querySelector('#cellLines');
const timepointsInput = document.querySelector('#timepoints');
const plateError = document.querySelector('#plateError');
const plateResultsSection = document.querySelector('#plateResults');
const plateSummary = document.querySelector('#plateSummary');
const plateContainer = document.querySelector('#plateContainer');
const exportCsvButton = document.querySelector('#exportCsv');
const copyCsvButton = document.querySelector('#copyCsv');

const dilutionTableBody = document.querySelector('#dilutionTableBody');
const finalConcentrationInput = document.querySelector('#finalConcentration');
const totalVolumeInput = document.querySelector('#totalVolume');
const dilutionError = document.querySelector('#dilutionError');
const dilutionResultsSection = document.querySelector('#dilutionResults');
const dilutionResultsBody = document.querySelector('#dilutionResultsBody');

const reagentTimepointsInput = document.querySelector('#reagentTimepoints');
const reagentArticlesInput = document.querySelector('#reagentArticles');
const reagentCellLinesInput = document.querySelector('#reagentCellLines');
const reagentReplicatesInput = document.querySelector('#reagentReplicates');
const reagentVolumeInput = document.querySelector('#reagentVolume');
const reagentError = document.querySelector('#reagentError');
const reagentResults = document.querySelector('#reagentResults');
const totalVolumeResult = document.querySelector('#totalVolumeResult');
const reagentBResult = document.querySelector('#reagentBResult');
const reagentPBSResult = document.querySelector('#reagentPBSResult');

let plateMaps = [];
let dilutionRows = [];

const parseListInput = (value) =>
  value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseNumericList = (value) =>
  parseListInput(value)
    .map((entry) => Number(entry))
    .filter((entry) => !Number.isNaN(entry));

function renderDilutionRows() {
  dilutionTableBody.innerHTML = '';
  dilutionRows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" value="${row.testArticle}" placeholder="HA-00059" />
      </td>
      <td>
        <input type="number" min="0" value="${row.stockConcentration}" placeholder="50" />
      </td>
    `;

    const [articleInput, stockInput] = tr.querySelectorAll('input');
    articleInput.addEventListener('input', (event) => {
      dilutionRows[index].testArticle = event.target.value;
    });
    stockInput.addEventListener('input', (event) => {
      dilutionRows[index].stockConcentration = event.target.value;
    });
    dilutionTableBody.appendChild(tr);
  });
}

function ensureDilutionRows() {
  if (dilutionRows.length === 0) {
    dilutionRows.push({ testArticle: '', stockConcentration: '' });
  }
  renderDilutionRows();
}

ensureDilutionRows();

async function generatePlateMap() {
  const testArticles = parseListInput(testArticlesInput.value);
  const cellLines = parseListInput(cellLinesInput.value);
  const timepoints = parseNumericList(timepointsInput.value);

  if (!testArticles.length || !cellLines.length || !timepoints.length) {
    plateError.textContent = 'Please provide test articles, cell lines, and numeric timepoints.';
    return;
  }

  plateError.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/plate-map`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test_articles: testArticles,
        cell_lines: cellLines,
        timepoints,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Unable to generate plate map.');
    }

    const data = await response.json();
    plateMaps = Array.isArray(data.plates) ? data.plates : [];

    if (plateMaps.length === 0) {
      plateResultsSection.classList.add('hidden');
      return;
    }

    plateSummary.textContent = `${plateMaps.length} plate${plateMaps.length > 1 ? 's' : ''} generated.`;
    plateResultsSection.classList.remove('hidden');
    renderPlateMaps();
  } catch (error) {
    plateError.textContent = error.message;
    plateResultsSection.classList.add('hidden');
  }
}

function buildWellLookup(wells) {
  const lookup = new Map();
  wells.forEach((well) => {
    lookup.set(`${well.row}${well.column}`, well);
  });
  return lookup;
}

function renderPlateMaps() {
  plateContainer.innerHTML = '';

  plateMaps.forEach((plate) => {
    const plateElement = document.createElement('div');
    plateElement.className = 'plate';

    const header = document.createElement('div');
    header.className = 'plate-header';
    const title = document.createElement('h3');
    title.textContent = `${plate.cell_line} · ${plate.timepoint} hr`;
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Controls occupy A1–A2 and the final four wells. Technical duplicates applied automatically.';
    subtitle.className = 'subtle';
    header.appendChild(title);
    header.appendChild(subtitle);

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'plate-grid';
    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = 'Row';
    headerRow.appendChild(corner);
    COLUMN_LABELS.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    const lookup = buildWellLookup(plate.wells);

    ROW_LABELS.forEach((row) => {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('td');
      rowHeader.textContent = row;
      tr.appendChild(rowHeader);

      COLUMN_LABELS.forEach((column) => {
        const td = document.createElement('td');
        const well = lookup.get(`${row}${column}`);
        if (well) {
          td.innerHTML = `
            <div class="well">
              <span>${well.test_article}</span>
              <span class="id">${well.well_id}</span>
            </div>
          `;
        } else {
          td.innerHTML = '<span class="placeholder">—</span>';
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    gridWrapper.appendChild(table);
    plateElement.appendChild(header);
    plateElement.appendChild(gridWrapper);
    plateContainer.appendChild(plateElement);
  });
}

function buildCsvRows() {
  const rows = [['WellID', 'Row', 'Column', 'Test Article', 'Cell Line', 'Timepoint (hr)']];
  plateMaps.forEach((plate) => {
    plate.wells.forEach((well) => {
      rows.push([
        well.well_id,
        well.row,
        well.column,
        well.test_article,
        plate.cell_line,
        well.timepoint,
      ]);
    });
  });
  return rows;
}

function exportCsv() {
  if (!plateMaps.length) return;
  const rows = buildCsvRows();
  const csv = rows.map((line) => line.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plate-maps.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function copyCsv() {
  if (!plateMaps.length) return;
  const rows = buildCsvRows();
  const csv = rows.map((line) => line.join(',')).join('\n');
  await navigator.clipboard.writeText(csv);
}

async function calculateDilutions() {
  const items = dilutionRows
    .filter((row) => row.testArticle && row.stockConcentration)
    .map((row) => ({
      test_article: row.testArticle.trim(),
      stock_concentration_uM: Number(row.stockConcentration),
    }));

  const finalConcentration = Number(finalConcentrationInput.value);
  const totalVolume = Number(totalVolumeInput.value);

  if (!items.length || Number.isNaN(finalConcentration) || Number.isNaN(totalVolume)) {
    dilutionError.textContent = 'Please fill in the table and provide numeric concentration and volume.';
    return;
  }

  dilutionError.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/dilutions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items,
        final_concentration_uM: finalConcentration,
        total_volume_uL: totalVolume,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Unable to calculate dilutions.');
    }

    const results = await response.json();
    renderDilutionResults(results);
  } catch (error) {
    dilutionError.textContent = error.message;
    dilutionResultsSection.classList.add('hidden');
  }
}

function renderDilutionResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    dilutionResultsSection.classList.add('hidden');
    return;
  }

  dilutionResultsBody.innerHTML = '';
  results.forEach((result) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${result.test_article}</td>
      <td>${result.source_volume_uL}</td>
      <td>${result.diluent_volume_uL}</td>
    `;
    dilutionResultsBody.appendChild(tr);
  });
  dilutionResultsSection.classList.remove('hidden');
}

async function calculateReagentB() {
  const payload = {
    number_of_timepoints: Number(reagentTimepointsInput.value),
    number_of_test_articles: Number(reagentArticlesInput.value),
    number_of_cell_lines: Number(reagentCellLinesInput.value),
    replicates_per_condition: Number(reagentReplicatesInput.value),
    volume_per_replicate_uL: Number(reagentVolumeInput.value),
  };

  if (Object.values(payload).some((value) => Number.isNaN(value) || value <= 0)) {
    reagentError.textContent = 'All inputs must be positive numbers.';
    return;
  }

  reagentError.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/reagent-b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Unable to calculate reagent B requirements.');
    }

    const data = await response.json();
    totalVolumeResult.textContent = `${data.total_volume_uL} µL`;
    reagentBResult.textContent = `${data.reagent_b_volume_uL} µL`;
    reagentPBSResult.textContent = `${data.diluent_volume_uL} µL`;
    reagentResults.classList.remove('hidden');
  } catch (error) {
    reagentError.textContent = error.message;
    reagentResults.classList.add('hidden');
  }
}

document.querySelector('#generatePlateMap').addEventListener('click', generatePlateMap);
document.querySelector('#addDilutionRow').addEventListener('click', () => {
  dilutionRows.push({ testArticle: '', stockConcentration: '' });
  renderDilutionRows();
});
document.querySelector('#calculateDilutions').addEventListener('click', calculateDilutions);
document.querySelector('#calculateReagentB').addEventListener('click', calculateReagentB);
exportCsvButton.addEventListener('click', exportCsv);
copyCsvButton.addEventListener('click', copyCsv);
