function inferApiBase() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('apiBase');
  if (override) {
    return override.trim().replace(/\/$/, '');
  }

  if (window.APP_CONFIG && typeof window.APP_CONFIG.apiBase === 'string') {
    return window.APP_CONFIG.apiBase.trim().replace(/\/$/, '');
  }

  const { protocol, hostname, port } = window.location;

  if (port === '8000') {
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`.replace(/\/$/, '');
  }

  if (protocol.startsWith('http')) {
    if (hostname.endsWith('.app.github.dev')) {
      return `${protocol}//${hostname.replace(/-\d+(?=\.)/, '-8000')}`;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:8000`;
    }

    if (port && port !== '80' && port !== '443') {
      return `${protocol}//${hostname}:${port}`;
    }

    return `${protocol}//${hostname}`;
  }

  return 'http://localhost:8000';
}

const API_BASE = inferApiBase();

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLUMN_LABELS = Array.from({ length: 12 }, (_, index) => index + 1);

const testArticlesInput = document.querySelector('#testArticles');
const cellLinesInput = document.querySelector('#cellLines');
const timepointsInput = document.querySelector('#timepoints');
const orientationSelect = document.querySelector('#orientation');
const plateError = document.querySelector('#plateError');
const plateResultsSection = document.querySelector('#plateResults');
const plateSummary = document.querySelector('#plateSummary');
const plateContainer = document.querySelector('#plateContainer');
const exportCsvButton = document.querySelector('#exportCsv');
const copyCsvButton = document.querySelector('#copyCsv');
const copyPlateTablesButton = document.querySelector('#copyPlateTables');

const dilutionTableBody = document.querySelector('#dilutionTableBody');
const finalConcentrationInput = document.querySelector('#finalConcentration');
const totalVolumeInput = document.querySelector('#totalVolume');
const dilutionError = document.querySelector('#dilutionError');
const dilutionResultsSection = document.querySelector('#dilutionResults');
const dilutionResultsBody = document.querySelector('#dilutionResultsBody');
const loadArticlesButton = document.querySelector('#loadArticlesFromPlate');

const reagentTimepointsInput = document.querySelector('#reagentTimepoints');
const reagentArticlesInput = document.querySelector('#reagentArticles');
const reagentCellLinesInput = document.querySelector('#reagentCellLines');
const reagentReplicatesInput = document.querySelector('#reagentReplicates');
const reagentVolumeInput = document.querySelector('#reagentVolume');
const reagentOverageInput = document.querySelector('#reagentOverage');
const reagentError = document.querySelector('#reagentError');
const reagentResults = document.querySelector('#reagentResults');
const totalVolumeResult = document.querySelector('#totalVolumeResult');
const phrodoResult = document.querySelector('#phrodoResult');
const pbsResult = document.querySelector('#pbsResult');
const loadPhrodoButton = document.querySelector('#loadPhrodoFromPlate');

let plateMaps = [];
let dilutionRows = [];
let latestPlateInputs = { testArticles: [], cellLines: [], timepoints: [] };

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
    articleInput.addEventListener('paste', (event) => {
      if (handleDilutionPaste(event, index, 'article')) {
        renderDilutionRows();
      }
    });
    stockInput.addEventListener('input', (event) => {
      dilutionRows[index].stockConcentration = event.target.value;
    });
    stockInput.addEventListener('paste', (event) => {
      if (handleDilutionPaste(event, index, 'stock')) {
        renderDilutionRows();
      }
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
  const orientation = orientationSelect.value || 'horizontal';

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
        orientation,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Unable to generate plate map.');
    }

    const data = await response.json();
    plateMaps = Array.isArray(data.plates) ? data.plates : [];
    latestPlateInputs = { testArticles, cellLines, timepoints };

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
    plateMaps = [];
    latestPlateInputs = { testArticles: [], cellLines: [], timepoints: [] };
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

function buildPlateTable(plate) {
  const lookup = buildWellLookup(plate.wells);
  const lines = [`${plate.cell_line} · ${plate.timepoint} hr`];
  lines.push(['Row', ...COLUMN_LABELS].join('\t'));
  ROW_LABELS.forEach((row) => {
    const rowValues = [row];
    COLUMN_LABELS.forEach((column) => {
      const well = lookup.get(`${row}${column}`);
      rowValues.push(well ? well.test_article : '');
    });
    lines.push(rowValues.join('\t'));
  });
  return lines.join('\n');
}

async function copyPlateTables() {
  if (!plateMaps.length) {
    return;
  }
  const tables = plateMaps.map((plate) => buildPlateTable(plate)).join('\n\n');
  try {
    await navigator.clipboard.writeText(tables);
    plateError.textContent = '';
  } catch (error) {
    plateError.textContent = 'Unable to copy plate tables to the clipboard.';
  }
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

async function calculatePhrodo() {
  const payload = {
    number_of_timepoints: Number(reagentTimepointsInput.value),
    number_of_test_articles: Number(reagentArticlesInput.value),
    number_of_cell_lines: Number(reagentCellLinesInput.value),
    replicates_per_condition: Number(reagentReplicatesInput.value),
    volume_per_replicate_uL: Number(reagentVolumeInput.value),
    overage_percent: Number(reagentOverageInput.value),
  };

  const requiredPositiveKeys = [
    'number_of_timepoints',
    'number_of_test_articles',
    'number_of_cell_lines',
    'replicates_per_condition',
  ];

  const hasInvalidCoreValue = requiredPositiveKeys.some(
    (key) => Number.isNaN(payload[key]) || payload[key] <= 0,
  );

  if (hasInvalidCoreValue || Number.isNaN(payload.volume_per_replicate_uL) || payload.volume_per_replicate_uL <= 0) {
    reagentError.textContent = 'All counts must be positive and volume per replicate must be greater than zero.';
    return;
  }

  if (Number.isNaN(payload.overage_percent) || payload.overage_percent < 0) {
    reagentError.textContent = 'Overage must be zero or a positive number.';
    return;
  }

  reagentError.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/phrodo`, {
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
    phrodoResult.textContent = `${data.phrodo_volume_uL} µL`;
    pbsResult.textContent = `${data.diluent_volume_uL} µL`;
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
  document.querySelector('#calculatePhrodo').addEventListener('click', calculatePhrodo);
exportCsvButton.addEventListener('click', exportCsv);
copyCsvButton.addEventListener('click', copyCsv);
copyPlateTablesButton.addEventListener('click', copyPlateTables);
loadArticlesButton.addEventListener('click', () => {
  if (!latestPlateInputs.testArticles.length) {
    dilutionError.textContent = 'Generate a plate map to load test articles.';
    return;
  }
  dilutionError.textContent = '';
  dilutionRows = latestPlateInputs.testArticles.map((article) => ({
    testArticle: article,
    stockConcentration: '',
  }));
  if (dilutionRows.length === 0) {
    dilutionRows.push({ testArticle: '', stockConcentration: '' });
  }
  renderDilutionRows();
});
loadPhrodoButton.addEventListener('click', () => {
  if (!latestPlateInputs.testArticles.length) {
    reagentError.textContent = 'Generate a plate map to load counts.';
    return;
  }
  reagentError.textContent = '';
  reagentTimepointsInput.value = latestPlateInputs.timepoints.length || '';
  reagentArticlesInput.value = latestPlateInputs.testArticles.length || '';
  reagentCellLinesInput.value = latestPlateInputs.cellLines.length || '';
});

function handleDilutionPaste(event, startIndex, sourceField) {
  const text = event.clipboardData?.getData('text');
  if (!text) {
    return false;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const isStructured = lines.length > 1 || /[\t,]/.test(text);
  if (!isStructured) {
    return false;
  }

  event.preventDefault();

  lines.forEach((line, offset) => {
    if (!line) return;
    const parts = line.split(/[\t,]/).map((part) => part.trim());
    const targetIndex = startIndex + offset;
    if (!dilutionRows[targetIndex]) {
      dilutionRows.push({ testArticle: '', stockConcentration: '' });
    }

    if (parts.length === 1) {
      if (sourceField === 'stock') {
        dilutionRows[targetIndex].stockConcentration = parts[0];
      } else {
        dilutionRows[targetIndex].testArticle = parts[0];
      }
    } else {
      const [article, stock] = parts;
      if (article) {
        dilutionRows[targetIndex].testArticle = article;
      }
      if (typeof stock !== 'undefined') {
        dilutionRows[targetIndex].stockConcentration = stock;
      }
    }
  });

  return true;
}
