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

const experimentNameInput = document.querySelector('#experimentName');
const replicatesInput = document.querySelector('#replicates');
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
const exportXlsxButton = document.querySelector('#exportXlsx');

const dilutionTableBody = document.querySelector('#dilutionTableBody');
const finalConcentrationInput = document.querySelector('#finalConcentration');
const totalVolumeInput = document.querySelector('#totalVolume');
const dilutionError = document.querySelector('#dilutionError');
const dilutionResultsSection = document.querySelector('#dilutionResults');
const dilutionResultsBody = document.querySelector('#dilutionResultsBody');
const loadArticlesButton = document.querySelector('#loadArticlesFromPlate');
const copyDilutionResultsButton = document.querySelector('#copyDilutionResults');
const resetDilutionTableButton = document.querySelector('#resetDilutionTable');

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
const aliquotResult = document.querySelector('#aliquotResult');
const loadPhrodoButton = document.querySelector('#loadPhrodoFromPlate');

let plateMaps = [];
let dilutionRows = [];
let latestPlateInputs = {
  testArticles: [],
  cellLines: [],
  timepoints: [],
  replicates: 2,
  experimentName: '',
};
let latestDilutionResults = [];
let latestPhrodoResult = null;

const parseListInput = (value) =>
  value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseNumericList = (value) =>
  parseListInput(value)
    .map((entry) => Number(entry))
    .filter((entry) => !Number.isNaN(entry));

function sanitizeFilenameSegment(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function getExportBaseName() {
  const experimentRaw = experimentNameInput?.value?.trim() || '';
  const sanitizedExperiment = sanitizeFilenameSegment(experimentRaw) || 'assay';
  const now = new Date();
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return `${sanitizedExperiment}_${isoDate}-assay-setup`;
}

function getLatestReplicates() {
  const stored = Number(latestPlateInputs.replicates);
  if (!Number.isNaN(stored) && stored > 0) {
    return stored;
  }
  const fromInput = Number(replicatesInput?.value);
  if (!Number.isNaN(fromInput) && fromInput > 0) {
    return Math.floor(fromInput);
  }
  return null;
}

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
  const replicatesValue = Number(replicatesInput.value);

  if (!Number.isFinite(replicatesValue) || replicatesValue <= 0) {
    plateError.textContent = 'Replicates must be a positive number.';
    return;
  }

  const replicates = Math.floor(replicatesValue);
  if (replicates !== replicatesValue) {
    replicatesInput.value = String(replicates);
  }

  if (replicates > 12) {
    plateError.textContent = 'Replicates cannot exceed the number of plate columns (12).';
    return;
  }

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
        replicates,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Unable to generate plate map.');
    }

    const data = await response.json();
    plateMaps = Array.isArray(data.plates) ? data.plates : [];
    latestPlateInputs = {
      testArticles,
      cellLines,
      timepoints,
      replicates,
      experimentName: experimentNameInput?.value?.trim() || '',
    };

    if (plateMaps.length === 0) {
      plateResultsSection.classList.add('hidden');
      return;
    }

    const summaryParts = [];
    if (latestPlateInputs.experimentName) {
      summaryParts.push(latestPlateInputs.experimentName);
    }
    summaryParts.push(
      `${plateMaps.length} plate${plateMaps.length > 1 ? 's' : ''} generated`,
    );
    summaryParts.push(
      `${replicates} replicate${replicates === 1 ? '' : 's'} per condition`,
    );
    plateSummary.textContent = summaryParts.join(' • ');
    plateResultsSection.classList.remove('hidden');
    renderPlateMaps();
  } catch (error) {
    plateError.textContent = error.message;
    plateResultsSection.classList.add('hidden');
    plateMaps = [];
    latestPlateInputs = {
      testArticles: [],
      cellLines: [],
      timepoints: [],
      replicates,
      experimentName: experimentNameInput?.value?.trim() || '',
    };
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
    const replicateCountRaw = Number(plate.replicates || getLatestReplicates() || 1);
    const replicateCount = !Number.isNaN(replicateCountRaw) && replicateCountRaw > 0 ? replicateCountRaw : 1;
    const controlRange = replicateCount > 1 ? `1–${replicateCount}` : '1';
    const replicateLabel = `${replicateCount} replicate${replicateCount === 1 ? '' : 's'}`;
    subtitle.textContent = `Negative controls occupy row A columns ${controlRange}. ${replicateLabel} per condition are placed automatically and controls follow the final test article.`;
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

function buildPlateRowsWithMetadata() {
  const rows = buildCsvRows();
  const metadata = [];
  const experimentName = experimentNameInput?.value?.trim();
  if (experimentName) {
    metadata.push(['Experiment', experimentName]);
  }
  const replicates = getLatestReplicates();
  if (replicates) {
    metadata.push(['Replicates per Condition', String(replicates)]);
  }
  if (metadata.length) {
    rows.unshift([]);
    for (let index = metadata.length - 1; index >= 0; index -= 1) {
      rows.unshift(metadata[index]);
    }
  }
  return rows;
}

function exportCsv() {
  if (!plateMaps.length) return;
  const rows = buildPlateRowsWithMetadata();
  const csv = rows.map((line) => line.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${getExportBaseName()}-plate-maps.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function copyCsv() {
  if (!plateMaps.length) return;
  const rows = buildPlateRowsWithMetadata();
  const csv = rows.map((line) => line.join(',')).join('\n');
  await navigator.clipboard.writeText(csv);
}

function buildPlateTable(plate) {
  const lookup = buildWellLookup(plate.wells);
  const lines = [`${plate.cell_line} · ${plate.timepoint} hr`];
  const replicates = Number(plate.replicates || getLatestReplicates());
  if (!Number.isNaN(replicates) && replicates > 0) {
    lines.push(`Replicates per Condition: ${replicates}`);
  }
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
  const metadataLines = [];
  const experimentName = experimentNameInput?.value?.trim();
  if (experimentName) {
    metadataLines.push(`Experiment: ${experimentName}`);
  }
  const replicates = getLatestReplicates();
  if (replicates) {
    metadataLines.push(`Replicates per Condition: ${replicates}`);
  }
  const prefix = metadataLines.length ? `${metadataLines.join('\n')}\n\n` : '';
  const tables = prefix + plateMaps.map((plate) => buildPlateTable(plate)).join('\n\n');
  try {
    await navigator.clipboard.writeText(tables);
    plateError.textContent = '';
  } catch (error) {
    plateError.textContent = 'Unable to copy plate tables to the clipboard.';
  }
}

async function copyDilutionResults() {
  if (!latestDilutionResults.length) {
    dilutionError.textContent = 'Run the calculator before copying results.';
    return;
  }

  const rows = [
    ['Test Article', 'Source Volume (µL)', 'PBS Volume (µL)'],
    ...latestDilutionResults.map((result) => [
      result.test_article,
      String(result.source_volume_uL),
      String(result.diluent_volume_uL),
    ]),
  ];

  const text = rows.map((line) => line.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    dilutionError.textContent = '';
  } catch (error) {
    dilutionError.textContent = 'Unable to copy the dilution results to the clipboard.';
  }
}

function resetDilutionTable() {
  dilutionRows = [{ testArticle: '', stockConcentration: '' }];
  latestDilutionResults = [];
  renderDilutionRows();
  dilutionResultsSection.classList.add('hidden');
  dilutionError.textContent = '';
  finalConcentrationInput.value = '10';
  totalVolumeInput.value = '100';
}

function sanitizeSheetName(base, usedNames) {
  const invalidPattern = /[\\/?*\[\]:]/g;
  let candidate = (base || 'Sheet').replace(invalidPattern, ' ').trim();
  if (!candidate) {
    candidate = 'Sheet';
  }
  if (candidate.length > 31) {
    candidate = candidate.slice(0, 31);
  }
  let uniqueName = candidate;
  let suffix = 1;
  while (usedNames.has(uniqueName)) {
    const extra = `_${suffix}`;
    const baseLength = Math.min(candidate.length, 31 - extra.length);
    uniqueName = `${candidate.slice(0, baseLength)}${extra}`;
    suffix += 1;
  }
  usedNames.add(uniqueName);
  return uniqueName;
}

function columnLabelFromIndex(index) {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 1) !== 0) {
        crc = 0xedb88320 ^ (crc >>> 1);
      } else {
        crc >>>= 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildSheetXml(rows) {
  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells
      .map((cell, cellIndex) => {
        const columnLabel = columnLabelFromIndex(cellIndex + 1);
        const reference = `${columnLabel}${rowIndex + 1}`;
        const value = cell === undefined || cell === null ? '' : cell;
        return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
      })
      .join('');
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${sheetRows.join('')}</sheetData>` +
    '</worksheet>'
  );
}

function prepareWorkbookSheets() {
  if (!plateMaps.length) {
    throw new Error('Generate a plate map before exporting.');
  }

  const usedNames = new Set();
  const sheets = [];

  sheets.push({
    name: sanitizeSheetName('plateWells', usedNames),
    rows: buildPlateRowsWithMetadata(),
  });

  plateMaps.forEach((plate, index) => {
    const rows = [[`${plate.cell_line} · ${plate.timepoint} hr`]];
    const replicates = Number(plate.replicates || getLatestReplicates());
    if (!Number.isNaN(replicates) && replicates > 0) {
      rows.push([`Replicates per Condition: ${replicates}`]);
      rows.push([]);
    }
    rows.push(['Row', ...COLUMN_LABELS.map((value) => String(value))]);

    const lookup = buildWellLookup(plate.wells);
    ROW_LABELS.forEach((row) => {
      const rowValues = [row];
      COLUMN_LABELS.forEach((column) => {
        const well = lookup.get(`${row}${column}`);
        rowValues.push(well ? well.test_article : '');
      });
      rows.push(rowValues);
    });

    const baseName = plate.cell_line
      ? `${plate.cell_line}_${plate.timepoint}h`
      : `Plate${index + 1}`;
    sheets.push({
      name: sanitizeSheetName(baseName, usedNames),
      rows,
    });
  });

  const concentrationRows = [
    ['Final concentration (µM)', finalConcentrationInput.value || ''],
    ['Total assay volume (µL)', totalVolumeInput.value || ''],
    [],
    ['Test Article', 'Stock Concentration (µM)'],
  ];

  if (dilutionRows.length === 0) {
    concentrationRows.push(['', '']);
  } else {
    dilutionRows.forEach((row) => {
      concentrationRows.push([row.testArticle || '', row.stockConcentration || '']);
    });
  }

  if (latestDilutionResults.length) {
    concentrationRows.push([]);
    concentrationRows.push(['Test Article', 'Source Volume (µL)', 'PBS Volume (µL)']);
    latestDilutionResults.forEach((result) => {
      concentrationRows.push([
        result.test_article,
        String(result.source_volume_uL),
        String(result.diluent_volume_uL),
      ]);
    });
  }

  sheets.push({
    name: sanitizeSheetName('concentrationCalculations', usedNames),
    rows: concentrationRows,
  });

  const phrodoRows = [
    ['Number of Timepoints', reagentTimepointsInput.value || ''],
    ['Number of Test Articles', reagentArticlesInput.value || ''],
    ['Number of Cell Lines', reagentCellLinesInput.value || ''],
    ['Replicates per Condition', reagentReplicatesInput.value || ''],
    ['Volume per Replicate (µL)', reagentVolumeInput.value || ''],
    ['Overage (%)', reagentOverageInput.value || ''],
  ];

  if (latestPhrodoResult) {
    phrodoRows.push([]);
    phrodoRows.push(['Total Volume (µL)', String(latestPhrodoResult.total_volume_uL)]);
    phrodoRows.push(['pHrodo Volume (µL)', String(latestPhrodoResult.phrodo_volume_uL)]);
    phrodoRows.push(['PBS Volume (µL)', String(latestPhrodoResult.diluent_volume_uL)]);
    phrodoRows.push(['Aliquot Volume (µL)', String(latestPhrodoResult.aliquot_volume_uL)]);
  }

  sheets.push({
    name: sanitizeSheetName('pHrodo', usedNames),
    rows: phrodoRows,
  });

  return sheets;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const fileChunks = [];
  const centralChunks = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const dataBytes =
      typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    fileChunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const totalSize = offset + centralSize + endRecord.length;
  const zipBuffer = new Uint8Array(totalSize);
  let cursor = 0;
  fileChunks.forEach((chunk) => {
    zipBuffer.set(chunk, cursor);
    cursor += chunk.length;
  });
  centralChunks.forEach((chunk) => {
    zipBuffer.set(chunk, cursor);
    cursor += chunk.length;
  });
  zipBuffer.set(endRecord, cursor);

  return new Blob([zipBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function buildWorkbookBlob() {
  const sheets = prepareWorkbookSheets();
  const sheetEntries = sheets.map((sheet, index) => ({
    ...sheet,
    sheetId: index + 1,
    relId: `rId${index + 1}`,
    path: `xl/worksheets/sheet${index + 1}.xml`,
  }));

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    sheetEntries
      .map(
        (entry) =>
          `<sheet name="${escapeXml(entry.name)}" sheetId="${entry.sheetId}" r:id="${entry.relId}"/>`,
      )
      .join('') +
    '</sheets>' +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheetEntries
      .map(
        (entry) =>
          `<Relationship Id="${entry.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${entry.sheetId}.xml"/>`,
      )
      .join('') +
    '</Relationships>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheetEntries
      .map(
        (entry) =>
          `<Override PartName="/xl/worksheets/sheet${entry.sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '</Types>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><name val="Arial"/><family val="2"/></font></fonts>' +
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const relationships =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const files = [
    { path: '[Content_Types].xml', data: contentTypes },
    { path: '_rels/.rels', data: relationships },
    { path: 'xl/workbook.xml', data: workbookXml },
    { path: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { path: 'xl/styles.xml', data: stylesXml },
  ];

  sheetEntries.forEach((entry) => {
    files.push({ path: entry.path, data: buildSheetXml(entry.rows) });
  });

  return createZip(files);
}

function exportXlsx() {
  try {
    const blob = buildWorkbookBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getExportBaseName()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    plateError.textContent = '';
  } catch (error) {
    plateError.textContent = error.message || 'Unable to generate the XLSX export.';
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
    latestDilutionResults = Array.isArray(results) ? results : [];
    renderDilutionResults(latestDilutionResults);
  } catch (error) {
    dilutionError.textContent = error.message;
    dilutionResultsSection.classList.add('hidden');
    latestDilutionResults = [];
  }
}

function renderDilutionResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    dilutionResultsSection.classList.add('hidden');
    latestDilutionResults = [];
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
    latestPhrodoResult = data;
    totalVolumeResult.textContent = `${data.total_volume_uL} µL`;
    phrodoResult.textContent = `${data.phrodo_volume_uL} µL`;
    pbsResult.textContent = `${data.diluent_volume_uL} µL`;
    aliquotResult.textContent = `${data.aliquot_volume_uL} µL`;
    reagentResults.classList.remove('hidden');
  } catch (error) {
    reagentError.textContent = error.message;
    reagentResults.classList.add('hidden');
    latestPhrodoResult = null;
    totalVolumeResult.textContent = '';
    phrodoResult.textContent = '';
    pbsResult.textContent = '';
    aliquotResult.textContent = '';
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
exportXlsxButton.addEventListener('click', exportXlsx);
copyDilutionResultsButton.addEventListener('click', copyDilutionResults);
resetDilutionTableButton.addEventListener('click', resetDilutionTable);
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
  reagentReplicatesInput.value = latestPlateInputs.replicates || '';
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
