import { useState } from 'react';
import axios from 'axios';

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLUMN_LABELS = Array.from({ length: 12 }, (_, idx) => idx + 1);

const parseListInput = (value) =>
  value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseNumericList = (value) =>
  parseListInput(value)
    .map((entry) => Number(entry))
    .filter((entry) => !Number.isNaN(entry));

const buildPlateMatrix = (wells) => {
  const lookup = new Map();
  wells.forEach((well) => {
    lookup.set(`${well.row}${well.column}`, well);
  });
  return lookup;
};

const formatTimepoint = (value) =>
  Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.0+$/, '');

function App() {
  const [testArticlesInput, setTestArticlesInput] = useState('');
  const [cellLinesInput, setCellLinesInput] = useState('');
  const [timepointsInput, setTimepointsInput] = useState('');
  const [plateMaps, setPlateMaps] = useState([]);
  const [plateError, setPlateError] = useState('');
  const [loadingPlate, setLoadingPlate] = useState(false);

  const [concentrationRows, setConcentrationRows] = useState([
    { testArticle: '', stockConcentration: '' },
  ]);
  const [finalConcentration, setFinalConcentration] = useState('');
  const [totalVolume, setTotalVolume] = useState('');
  const [dilutionResults, setDilutionResults] = useState([]);
  const [dilutionError, setDilutionError] = useState('');
  const [loadingDilutions, setLoadingDilutions] = useState(false);

  const [reagentBInput, setReagentBInput] = useState({
    number_of_timepoints: '',
    number_of_test_articles: '',
    number_of_cell_lines: '',
    replicates_per_condition: '',
    volume_per_replicate_uL: '',
  });
  const [reagentBResult, setReagentBResult] = useState(null);
  const [reagentBError, setReagentBError] = useState('');

  const handleGeneratePlateMap = async () => {
    const testArticles = parseListInput(testArticlesInput);
    const cellLines = parseListInput(cellLinesInput);
    const timepoints = parseNumericList(timepointsInput);

    if (!testArticles.length || !cellLines.length || !timepoints.length) {
      setPlateError('Please provide test articles, cell lines, and numeric timepoints.');
      return;
    }

    setLoadingPlate(true);
    setPlateError('');

    try {
      const response = await axios.post('/api/plate-map', {
        test_articles: testArticles,
        cell_lines: cellLines,
        timepoints,
      });
      setPlateMaps(response.data.plates ?? []);
    } catch (error) {
      const message = error.response?.data?.detail ?? 'Unable to generate plate map.';
      setPlateError(message);
    } finally {
      setLoadingPlate(false);
    }
  };

  const handleAddConcentrationRow = () => {
    setConcentrationRows((rows) => [...rows, { testArticle: '', stockConcentration: '' }]);
  };

  const handleConcentrationRowChange = (index, field, value) => {
    setConcentrationRows((rows) =>
      rows.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const handleCalculateDilutions = async () => {
    const items = concentrationRows
      .filter((row) => row.testArticle && row.stockConcentration)
      .map((row) => ({
        test_article: row.testArticle.trim(),
        stock_concentration_uM: Number(row.stockConcentration),
      }));

    const finalConcValue = Number(finalConcentration);
    const totalVolumeValue = Number(totalVolume);

    if (!items.length || Number.isNaN(finalConcValue) || Number.isNaN(totalVolumeValue)) {
      setDilutionError('Please complete the table and provide numeric concentration and volume.');
      return;
    }

    setLoadingDilutions(true);
    setDilutionError('');

    try {
      const response = await axios.post('/api/dilutions', {
        items,
        final_concentration_uM: finalConcValue,
        total_volume_uL: totalVolumeValue,
      });
      setDilutionResults(response.data);
    } catch (error) {
      const message = error.response?.data?.detail ?? 'Unable to calculate dilutions.';
      setDilutionError(message);
    } finally {
      setLoadingDilutions(false);
    }
  };

  const handleReagentBCalculation = async () => {
    const payload = Object.fromEntries(
      Object.entries(reagentBInput).map(([key, value]) => [key, Number(value)])
    );

    if (Object.values(payload).some((value) => Number.isNaN(value) || value <= 0)) {
      setReagentBError('All reagent B inputs must be positive numbers.');
      return;
    }

    setReagentBError('');

    try {
      const response = await axios.post('/api/reagent-b', payload);
      setReagentBResult(response.data);
    } catch (error) {
      const message = error.response?.data?.detail ?? 'Unable to calculate reagent B requirements.';
      setReagentBError(message);
    }
  };

  const downloadCsv = () => {
    if (!plateMaps.length) return;
    const rows = [
      ['WellID', 'Row', 'Column', 'Test Article', 'Cell Line', 'Timepoint (hr)'],
    ];

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

    const csv = rows.map((line) => line.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plate-maps.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyCsvToClipboard = async () => {
    if (!plateMaps.length) return;
    const rows = [
      ['WellID', 'Row', 'Column', 'Test Article', 'Cell Line', 'Timepoint (hr)'],
    ];

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

    const csv = rows.map((line) => line.join(',')).join('\n');
    await navigator.clipboard.writeText(csv);
  };

  const disableExport = plateMaps.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <h1 className="text-2xl font-semibold text-slate-900">Antibody Assay Setup</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate plate maps, calculate dilutions, and estimate reagent requirements in one place.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        <section className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Plate Map Generator</h2>
              <p className="text-sm text-slate-600">
                Enter ordered lists separated by commas or new lines.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGeneratePlateMap}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              disabled={loadingPlate}
            >
              {loadingPlate ? 'Generating…' : 'Generate Plate Map'}
            </button>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Test Articles</label>
              <textarea
                value={testArticlesInput}
                onChange={(event) => setTestArticlesInput(event.target.value)}
                placeholder="HA-00059, HA-00061, HA-00390"
                className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Cell Lines</label>
              <textarea
                value={cellLinesInput}
                onChange={(event) => setCellLinesInput(event.target.value)}
                placeholder="KPL4, NCIN87"
                className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Timepoints (hours)</label>
              <textarea
                value={timepointsInput}
                onChange={(event) => setTimepointsInput(event.target.value)}
                placeholder="0, 4, 24"
                className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                rows={4}
              />
            </div>
          </div>

          {plateError && <p className="mt-4 text-sm text-rose-600">{plateError}</p>}
        </section>

        {plateMaps.length > 0 && (
          <section className="rounded-lg bg-white p-6 shadow">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Plate Maps</h2>
                <p className="text-sm text-slate-600">
                  {plateMaps.length} plate{plateMaps.length > 1 ? 's' : ''} generated across cell lines and timepoints.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={disableExport}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={copyCsvToClipboard}
                  disabled={disableExport}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Copy CSV
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-8">
              {plateMaps.map((plate, plateIndex) => {
                const lookup = buildPlateMatrix(plate.wells);
                return (
                  <div key={`${plate.cell_line}-${plate.timepoint}-${plateIndex}`} className="space-y-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <h3 className="text-lg font-semibold text-slate-800">
                        {plate.cell_line} · {formatTimepoint(plate.timepoint)} hr
                      </h3>
                      <p className="text-sm text-slate-500">Technical duplicates auto-filled. Controls occupy A1–A2, last four wells.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full table-fixed border-collapse rounded-lg border border-slate-200">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="w-12 border border-slate-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Row
                            </th>
                            {COLUMN_LABELS.map((column) => (
                              <th
                                key={`col-${column}`}
                                className="border border-slate-200 p-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600"
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ROW_LABELS.map((row) => (
                            <tr key={row} className="even:bg-slate-50">
                              <td className="border border-slate-200 p-2 text-center text-xs font-semibold uppercase text-slate-600">
                                {row}
                              </td>
                              {COLUMN_LABELS.map((column) => {
                                const well = lookup.get(`${row}${column}`);
                                return (
                                  <td
                                    key={`${row}${column}`}
                                    className="h-16 border border-slate-200 p-2 align-top text-xs text-slate-700"
                                  >
                                    {well ? (
                                      <div className="flex flex-col">
                                        <span className="font-medium">{well.test_article}</span>
                                        <span className="text-[11px] text-slate-500">{well.well_id}</span>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Concentration Calculator</h2>
              <p className="text-sm text-slate-600">
                Enter stock concentrations and assay settings to calculate dilution volumes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCalculateDilutions}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              disabled={loadingDilutions}
            >
              {loadingDilutions ? 'Calculating…' : 'Calculate Dilutions'}
            </button>
          </div>

          <div className="mt-6 space-y-6">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed border-collapse rounded-lg border border-slate-200">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="w-1/2 border border-slate-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Test Article
                    </th>
                    <th className="border border-slate-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Stock Concentration (µM)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {concentrationRows.map((row, index) => (
                    <tr key={`row-${index}`} className="even:bg-slate-50">
                      <td className="border border-slate-200 p-2">
                        <input
                          type="text"
                          value={row.testArticle}
                          onChange={(event) =>
                            handleConcentrationRowChange(index, 'testArticle', event.target.value)
                          }
                          placeholder="HA-00059"
                          className="w-full rounded-md border border-slate-200 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="border border-slate-200 p-2">
                        <input
                          type="number"
                          min="0"
                          value={row.stockConcentration}
                          onChange={(event) =>
                            handleConcentrationRowChange(index, 'stockConcentration', event.target.value)
                          }
                          placeholder="50"
                          className="w-full rounded-md border border-slate-200 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={handleAddConcentrationRow}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              Add Row
            </button>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Desired Final Concentration (µM)
                <input
                  type="number"
                  min="0"
                  value={finalConcentration}
                  onChange={(event) => setFinalConcentration(event.target.value)}
                  className="rounded-md border border-slate-200 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Total Assay Volume (µL)
                <input
                  type="number"
                  min="0"
                  value={totalVolume}
                  onChange={(event) => setTotalVolume(event.target.value)}
                  className="rounded-md border border-slate-200 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
            </div>

            {dilutionError && <p className="text-sm text-rose-600">{dilutionError}</p>}

            {dilutionResults.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed border-collapse rounded-lg border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Test Article
                      </th>
                      <th className="border border-slate-200 p-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Source Volume (µL)
                      </th>
                      <th className="border border-slate-200 p-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                        PBS Volume (µL)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dilutionResults.map((result) => (
                      <tr key={`result-${result.test_article}`} className="even:bg-slate-50">
                        <td className="border border-slate-200 p-2 text-sm text-slate-700">
                          {result.test_article}
                        </td>
                        <td className="border border-slate-200 p-2 text-right text-sm text-slate-700">
                          {result.source_volume_uL}
                        </td>
                        <td className="border border-slate-200 p-2 text-right text-sm text-slate-700">
                          {result.diluent_volume_uL}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Mastermix Reagent B Calculator</h2>
              <p className="text-sm text-slate-600">Estimate total volume and required diluent.</p>
            </div>
            <button
              type="button"
              onClick={handleReagentBCalculation}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Calculate
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(reagentBInput).map(([key, value]) => (
              <label key={key} className="flex flex-col gap-1 text-sm text-slate-700">
                {key
                  .replace(/_/g, ' ')
                  .replace(/\b(\w)/g, (match) => match.toUpperCase())}
                <input
                  type="number"
                  min="0"
                  value={value}
                  onChange={(event) =>
                    setReagentBInput((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="rounded-md border border-slate-200 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>

          {reagentBError && <p className="mt-4 text-sm text-rose-600">{reagentBError}</p>}

          {reagentBResult && (
            <div className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Volume</p>
                <p className="text-lg font-semibold text-slate-900">{reagentBResult.total_volume_uL} µL</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Reagent B</p>
                <p className="text-lg font-semibold text-slate-900">{reagentBResult.reagent_b_volume_uL} µL</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">PBS Volume</p>
                <p className="text-lg font-semibold text-slate-900">{reagentBResult.diluent_volume_uL} µL</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
