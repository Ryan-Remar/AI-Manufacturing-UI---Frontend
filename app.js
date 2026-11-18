/* AI Manufacturing UI — frontend/output.
   No sample measurements are loaded on startup.
   ManufacturingDashboard.update(data) displays a validated snapshot.
   ManufacturingDashboard.saveCurrent('YYYY-MM', 'Report name') archives it.
*/
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const put = (id, value) => { $(id).textContent = value; };
  const keys = ["fray", "chip", "spot", "slash"];
  const storageKey = "manufacturing-dashboard-reports-v1";
  const themeStorageKey = "manufacturing-dashboard-theme-v1";
  const missing = "—";
  const countFormat = new Intl.NumberFormat("en-US");
  const count = value => value === null ? missing : countFormat.format(value);
  const pct = value => value === null ? missing : value.toFixed(1) + "%";
  const empty = () => ({production: null, defects: null, qualityScore: null, errorRatePct: null, summary: null});
  let current = empty();
  let records = [];
  let active = null;
  let archiveReadable = true;

  function object(value, name) {
    if (value == null) return null;
    if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(name + " must be an object.");
    return value;
  }
  function optional(value, name, max = Infinity, integer = false) {
    if (value == null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) {
      throw new TypeError(name + " must be a nonnegative " + (integer ? "safe integer" : "finite number") + (max === Infinity ? "." : " no greater than " + max + "."));
    }
    return value;
  }
  function production(value, name) {
    const p = object(value, name);
    if (!p) return null;
    const suppliedTotal = optional(p.total, name + ".total", Infinity, true);
    const good = optional(p.good, name + ".good", Infinity, true);
    const defective = optional(p.defective, name + ".defective", Infinity, true);
    if (good !== null && defective !== null && !Number.isSafeInteger(good + defective)) throw new RangeError("Total exceeds safe integer range.");
    if (suppliedTotal !== null && (good ?? 0) + (defective ?? 0) > suppliedTotal) {
      throw new RangeError(name + ".total is smaller than the classified count.");
    }
    return {total: suppliedTotal, good, defective};
  }
  function totals(p) {
    const total = p?.total ?? (p?.good != null && p?.defective != null ? p.good + p.defective : null);
    return {total, good: p?.good ?? null, bad: p?.defective ?? null,
      defectRate: total > 0 && p?.defective != null ? p.defective / total * 100 : null,
      yield: total > 0 && p?.good != null ? p.good / total * 100 : null};
  }
  function adaptInspection(data) {
    if (data?.schema !== "casting-inspection/1") return data;
    const report = object(data.summary, "inspection.summary");
    if (!report) throw new TypeError("Inspection summary is missing.");
    const verdict = object(report.verdict, "summary.verdict");
    const accuracy = object(report.accuracy, "summary.accuracy");
    const types = object(report.defect_types, "summary.defect_types");
    const total = optional(report.castings, "summary.castings", Infinity, true);
    const good = optional(verdict?.good, "summary.verdict.good", Infinity, true);
    const bad = optional(verdict?.defective, "summary.verdict.defective", Infinity, true);
    const judged = optional(accuracy?.judged, "summary.accuracy.judged", Infinity, true);
    const incorrect = optional(accuracy?.incorrect, "summary.accuracy.incorrect", Infinity, true);
    if (judged !== null && incorrect !== null && incorrect > judged) throw new RangeError("Incorrect count exceeds judged count.");
    const explicitScore = optional(data.qualityScore, "qualityScore", 100);
    // The inspection format has no qualityScore field. Use yield and label it explicitly.
    return {
      production: {total, good, defective: bad},
      defects: types?.counts ?? null,
      errorRatePct: judged > 0 && incorrect !== null ? incorrect / judged * 100 : null,
      qualityScore: explicitScore ?? (total > 0 && good !== null ? good / total * 100 : null),
      qualityBasis: explicitScore === null ? "yield" : null
    };
  }
  function normalize(data) {
    data = adaptInspection(data);
    if (!object(data, "data")) throw new TypeError("data must be an object.");
    // Timing fields from older reports are deliberately ignored.
    const d = object(data.defects, "defects");
    // Preserve compatibility with the original October summary contract.
    const summary = object(data.summary ?? data.october, "summary");
    const result = {
      production: production(data.production, "production"),
      defects: d ? Object.fromEntries(keys.map(k => [k, optional(d[k], "defects." + k, Infinity, true)])) : null,
      qualityScore: optional(data.qualityScore, "qualityScore", 100),
      errorRatePct: optional(data.errorRatePct, "errorRatePct", 100),
      summary: summary ? {
        production: production(summary.production, "summary.production"),
        errorRatePct: optional(summary.errorRatePct, "summary.errorRatePct", 100),
        qualityScore: optional(summary.qualityScore, "summary.qualityScore", 100)
      } : null
    };
    // Stage-two assessment can use a different population from stage-one verdicts.
    const total = totals(result.production).total;
    if (total !== null && result.defects && Object.values(result.defects).some(n => n !== null && n > total)) {
      throw new RangeError("A category count exceeds the report's total parts.");
    }
    result.qualityBasis = data.qualityBasis === "yield" ? "yield" : null;
    return result;
  }
  function hasData(value) {
    return Object.values(value).some(v => v !== null && (typeof v === "number" || (typeof v === "object" && hasData(v))));
  }
  function sumValues(values) {
    const available = values.filter(value => value !== null && value !== undefined);
    return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
  }
  function weightedAverage(values, weights) {
    const pairs = values.map((value, index) => ({value, weight: weights[index]}))
      .filter(pair => pair.value !== null && pair.value !== undefined);
    if (!pairs.length) return null;
    const hasWeights = pairs.some(pair => pair.weight !== null && pair.weight > 0);
    if (!hasWeights) return pairs.reduce((sum, pair) => sum + pair.value, 0) / pairs.length;
    const weighted = pairs.reduce((sum, pair) => sum + pair.value * (pair.weight > 0 ? pair.weight : 1), 0);
    const weightTotal = pairs.reduce((sum, pair) => sum + (pair.weight > 0 ? pair.weight : 1), 0);
    return weighted / weightTotal;
  }
  function aggregateReportData(reportData) {
    const productionValues = reportData.map(record => totals(record.production));
    const total = sumValues(productionValues.map(value => value.total));
    const good = sumValues(productionValues.map(value => value.good));
    const bad = sumValues(productionValues.map(value => value.bad));
    const weights = productionValues.map(value => value.total);
    return {
      production: {total, good, bad},
      yield: total > 0 && good !== null ? good / total * 100 : null,
      defectRate: total > 0 && bad !== null ? bad / total * 100 : null,
      errorRatePct: weightedAverage(reportData.map(record => record.errorRatePct), weights),
      qualityScore: weightedAverage(reportData.map(record => record.qualityScore), weights)
    };
  }
  function summaryCell(value, percentage = false) {
    const cell = document.createElement("td");
    cell.textContent = percentage ? pct(value) : count(value);
    return cell;
  }
  function appendSummaryRow(tbody, label, summary, selected = false) {
    const row = document.createElement("tr");
    if (selected) row.classList.add("selected-summary-row");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = label;
    row.append(heading,
      summaryCell(summary.errorRatePct, true),
      summaryCell(summary.production.total),
      summaryCell(summary.production.good),
      summaryCell(summary.production.bad),
      summaryCell(summary.yield, true),
      summaryCell(summary.defectRate, true),
      summaryCell(summary.qualityScore, true));
    tbody.append(row);
  }
  function renderMonthlySummary() {
    const tbody = $("summary-months");
    tbody.replaceChildren();
    const foot = $("summary-all-months");
    foot.replaceChildren();

    if (!records.length) {
      const label = monthLabel($("upload-month").value);
      const summary = aggregateReportData([current]);
      appendSummaryRow(tbody, label, {
        ...summary,
        production: {
          total: totals(current.production).total,
          good: totals(current.production).good,
          bad: totals(current.production).bad
        },
        yield: totals(current.production).yield,
        defectRate: totals(current.production).defectRate
      });
      const allRow = document.createElement("tr");
      const allHeading = document.createElement("th");
      allHeading.scope = "row";
      allHeading.textContent = "All months";
      allRow.append(allHeading,
        summaryCell(current.errorRatePct, true),
        summaryCell(totals(current.production).total),
        summaryCell(totals(current.production).good),
        summaryCell(totals(current.production).bad),
        summaryCell(totals(current.production).yield, true),
        summaryCell(totals(current.production).defectRate, true),
        summaryCell(current.qualityScore, true));
      foot.append(allRow);
      return;
    }

    const monthGroups = new Map();
    records.forEach(record => {
      if (!monthGroups.has(record.month)) monthGroups.set(record.month, []);
      monthGroups.get(record.month).push(record.data);
    });
    [...monthGroups.entries()].sort(([a], [b]) => b.localeCompare(a)).forEach(([month, monthData]) => {
      appendSummaryRow(tbody, monthLabel(month) + (active?.month === month ? " · Selected" : ""), aggregateReportData(monthData), active?.month === month);
    });

    const allSummary = aggregateReportData(records.map(record => record.data));
    const allRow = document.createElement("tr");
    const allHeading = document.createElement("th");
    allHeading.scope = "row";
    allHeading.textContent = "All months";
    allRow.append(allHeading,
      summaryCell(allSummary.errorRatePct, true),
      summaryCell(allSummary.production.total),
      summaryCell(allSummary.production.good),
      summaryCell(allSummary.production.bad),
      summaryCell(allSummary.yield, true),
      summaryCell(allSummary.defectRate, true),
      summaryCell(allSummary.qualityScore, true));
    foot.append(allRow);
  }
  function month(value) {
    if (typeof value !== "string" || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new TypeError("Select a valid report month.");
    return value;
  }
  function monthLabel(value) {
    if (!value) return missing;
    const [year, m] = value.split("-").map(Number);
    // Avoid timezone shifts and the Date constructor's special handling of years 0–99.
    const date = new Date(0);
    date.setUTCFullYear(year, m - 1, 1);
    return new Intl.DateTimeFormat("en-US", {month: "long", year: "numeric", timeZone: "UTC"}).format(date);
  }
  function error(message = "") {
    put("error-message", message);
    $("error-message").hidden = !message;
  }
  function settingsStatus(message = "") {
    put("settings-status", message);
    $("settings-status").hidden = !message;
  }
  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("theme-toggle").textContent = dark ? "Switch to light mode" : "Switch to dark mode";
    $("theme-toggle").setAttribute("aria-pressed", String(dark));
  }

  function render() {
    const p = totals(current.production);
    put("total", count(p.total)); put("good", count(p.good)); put("bad", count(p.bad)); put("defect-rate", pct(p.defectRate));
    const ranked = keys.map((key, index) => ({key, index, value: current.defects?.[key] ?? null}));
    ranked.sort((a,b) => (a.value === null) - (b.value === null) || (b.value ?? 0) - (a.value ?? 0) || a.index - b.index);
    let previous = null;
    let rank = 0;
    ranked.forEach((entry, index) => {
      const row = document.querySelector('[data-defect="' + entry.key + '"]');
      if (entry.value !== null && entry.value !== previous) rank = index + 1;
      row.querySelector(".rank").textContent = entry.value === null ? missing : "#" + rank;
      put(entry.key, count(entry.value));
      $("defect-list").append(row);
      previous = entry.value;
    });
    put("quality-basis", current.qualityBasis === "yield"
      ? "For this inspection report, quality score represents good-part yield (good parts ÷ total parts)."
      : "Quality score is supplied by the report. Grades use the five equal score ranges below.");
    const score = current.qualityScore;
    put("quality", pct(score));
    const grades = [["F", "Bad"], ["D", "Decent"], ["C", "Good"], ["B", "Great"], ["A", "Excellent"]];
    const grade = score === null ? null : grades[Math.min(4, Math.floor(score / 20))];
    put("quality-status", grade ? grade[0] + " · " + grade[1] : "Waiting for a quality score");
    $("fuel-cover").style.width = (100 - (score ?? 0)) + "%";
    $("fuel-marker").style.left = (score ?? 0) + "%";
    $("fuel-marker").hidden = score === null;
    $("quality-meter").classList.toggle("unavailable", score === null);
    if (score === null) $("quality-meter").removeAttribute("aria-valuenow");
    else $("quality-meter").setAttribute("aria-valuenow", score);
    $("quality-meter").setAttribute("aria-valuetext", grade ? pct(score) + ", " + grade.join(", ") : "Unavailable");
    put("summary-label", active ? active.label + " · " + monthLabel(active.month) : "Current unsaved report. Upload or save it to assign a month.");
    renderMonthlySummary();
    put("data-status", hasData(current) ? (active ? "Displaying saved report: " + active.label + "." : "Displaying supplied data.") + " Unavailable values are shown as —." : "Waiting for data. No measurements are available.");
  }

  function refreshSelectors(selectedMonth = active?.month, selectedId = active?.id) {
    const months = [...new Set(records.map(r => r.month))].sort().reverse();
    const monthSelect = $("month-select");
    monthSelect.replaceChildren();
    if (!months.length) monthSelect.add(new Option("No saved months", ""));
    months.forEach(m => monthSelect.add(new Option(monthLabel(m), m)));
    monthSelect.disabled = !months.length;
    monthSelect.value = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? "");
    const reports = records.filter(r => r.month === monthSelect.value).slice().reverse();
    const reportSelect = $("report-select");
    reportSelect.replaceChildren();
    if (!reports.length) reportSelect.add(new Option("No saved reports", ""));
    reports.forEach(r => reportSelect.add(new Option(r.label + " · " + new Date(r.savedAt).toLocaleString(), r.id)));
    reportSelect.disabled = !reports.length;
    reportSelect.value = reports.some(r => r.id === selectedId) ? selectedId : (reports[0]?.id ?? "");
    $("export-history").disabled = !records.length;
  }
  function selectReport() {
    const record = records.find(r => r.id === $("report-select").value);
    if (!record) return;
    if (connectedBackendUrl) {
      stopBackendRefresh();
      put("backend-status", "Saved report selected. Click Refresh from backend to reconnect.");
    }
    current = record.data;
    active = record;
    error(); render();
  }
  function saveSnapshot(data, reportMonth, label) {
    if (!archiveReadable) throw new Error("Saved history could not be read. Existing browser storage has been left unchanged. Restore access before saving new reports.");
    const normalized = normalize(data);
    if (!hasData(normalized)) throw new Error("This report has no supported measurements. Use the JSON format in README.md.");
    const record = {
      id: crypto.randomUUID(), month: month(reportMonth),
      label: typeof label === "string" && label.trim() ? label.trim().slice(0, 200) : "Inspection report",
      savedAt: new Date().toISOString(), data: normalized
    };
    const next = [...records, record];
    // Commit storage first; failed writes never replace the current display/history.
    try { localStorage.setItem(storageKey, JSON.stringify({version: 1, records: next})); }
    catch { throw new Error("The report could not be saved. Browser storage may be full or disabled. Existing reports and the display were left unchanged."); }
    records = next; current = normalized; active = record;
    refreshSelectors(); render(); error();
    put("storage-status", "Report saved in this browser. Download saved reports to keep a backup.");
    return record.id;
  }
  function loadArchive() {
    try {
      const text = localStorage.getItem(storageKey);
      if (!text) return;
      const archive = JSON.parse(text);
      if (archive.version !== 1 || !Array.isArray(archive.records)) throw new Error();
      const ids = new Set();
      const validated = archive.records.map(r => {
        if (!object(r, "report") || typeof r.id !== "string" || !r.id || ids.has(r.id) || typeof r.label !== "string" || typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt))) throw new Error();
        ids.add(r.id);
        return {id: r.id, month: month(r.month), label: r.label, savedAt: r.savedAt, data: normalize(r.data)};
      });
      records = validated;
    } catch {
      archiveReadable = false;
      error("Saved history could not be read. Existing storage has been left unchanged. You can still display data using the backend update function.");
    }
  }
  $("report-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    const reportMonth = $("upload-month").value;
    event.target.disabled = true;
    try {
      month(reportMonth);
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a JSON summary report smaller than 5 MB.");
      const data = JSON.parse(await file.text());
      if (data?.version === 1 && Array.isArray(data.records)) throw new Error("This is a history backup. Choose it under Restore saved reports instead.");
      saveSnapshot(data, reportMonth, file.name);
    } catch (e) { error("Upload failed: " + e.message); }
    finally { event.target.value = ""; event.target.disabled = false; }
  });
  $("month-select").addEventListener("change", () => { refreshSelectors($("month-select").value); selectReport(); });
  $("report-select").addEventListener("change", selectReport);
  $("theme-toggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      localStorage.setItem(themeStorageKey, theme);
      settingsStatus(theme === "dark" ? "Dark mode enabled." : "Light mode enabled.");
    } catch (e) {
      settingsStatus("Theme changed for this session, but could not be saved: " + e.message);
    }
  });
  $("clear-cache").addEventListener("click", () => {
    const confirmed = window.confirm("Clear all saved reports from this browser? This cannot be undone. Save the displayed report and download saved reports first if you want a backup. The currently displayed report will remain on screen but will no longer be saved locally. Cancel to keep your saved reports.");
    if (!confirmed) return;
    try { localStorage.removeItem(storageKey); }
    catch (e) {
      settingsStatus("Could not clear saved reports: " + e.message);
      return;
    }
    records = [];
    active = null;
    archiveReadable = true;
    refreshSelectors();
    render();
    put("storage-status", "Saved reports were cleared from this browser.");
    settingsStatus("Saved report data cleared.");
    $("settings-menu").open = false;
  });
  $("export-history").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({version: 1, records}, null, 2)], {type: "application/json"}));
    const a = document.createElement("a");
    a.href = url; a.download = "manufacturing-saved-reports.json"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  window.ManufacturingDashboard = Object.freeze({
    loadFromUrl,
    update(data) { const next = normalize(data); current = next; active = null; render(); error(); },
    clear() {
      stopBackendRefresh();
      put("backend-status", "Backend auto-refresh stopped.");
      current = empty(); active = null; render(); error();
    },
    saveCurrent(reportMonth, label) { return saveSnapshot(current, reportMonth, label); },
    // Merge backups without overwriting existing reports. Validate everything before writing.
    restoreHistory(backup) {
      if (!archiveReadable) throw new Error("Existing history is unreadable; restore access before importing.");
      if (!object(backup, "backup") || backup.version !== 1 || !Array.isArray(backup.records)) throw new TypeError("Invalid history backup.");
      const seen = new Set();
      const imported = backup.records.map(r => {
        if (!object(r, "report") || typeof r.id !== "string" || !r.id || seen.has(r.id) || typeof r.label !== "string" || typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt))) throw new TypeError("Invalid saved report.");
        seen.add(r.id);
        return {id: r.id, month: month(r.month), label: r.label, savedAt: r.savedAt, data: normalize(r.data)};
      });
      for (const item of imported) {
        const existing = records.find(r => r.id === item.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(item)) throw new Error("A backup report conflicts with an existing saved report.");
      }
      const existingIds = new Set(records.map(r => r.id));
      const next = [...records, ...imported.filter(r => !existingIds.has(r.id))];
      localStorage.setItem(storageKey, JSON.stringify({version: 1, records: next}));
      records = next; refreshSelectors(); selectReport(); error();
      put("storage-status", "History backup restored in this browser.");
    }
  });
  $("history-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.disabled = true;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose a backup smaller than 20 MB.");
      window.ManufacturingDashboard.restoreHistory(JSON.parse(await file.text()));
    } catch (e) { error("Restore failed: " + e.message); }
    finally { event.target.value = ""; event.target.disabled = false; }
  });
  // Backend URL is configured by the team; no endpoint or sample data is assumed.
  let backendBusy = false;
  const backendRefreshInterval = 30000;
  let backendRefreshTimer = null;
  let connectedBackendUrl = null;
  let backendSnapshot = null;
  function cancelBackendRefresh() {
    clearTimeout(backendRefreshTimer);
    backendRefreshTimer = null;
  }
  function stopBackendRefresh() {
    cancelBackendRefresh();
    connectedBackendUrl = null;
    backendSnapshot = null;
  }
  function scheduleBackendRefresh() {
    cancelBackendRefresh();
    if (!connectedBackendUrl || !$("auto-refresh").checked) return;
    backendRefreshTimer = setTimeout(async () => {
      backendRefreshTimer = null;
      try { await loadFromUrl(connectedBackendUrl, true); }
      catch (e) {
        put("backend-status", "Automatic refresh failed: " + e.message + " Retrying in 30 seconds.");
      } finally { scheduleBackendRefresh(); }
    }, backendRefreshInterval);
  }
  async function loadFromUrl(url, automatic = false) {
    if (backendBusy) throw new Error("A backend request is already running.");
    if (typeof url !== "string" || !url.trim()) throw new TypeError("Enter the backend JSON URL first.");
    const target = new URL(url.trim(), window.location.href);
    if (!["http:", "https:"].includes(target.protocol)) throw new TypeError("Use an HTTP or HTTPS backend URL.");
    if (automatic && (!connectedBackendUrl || connectedBackendUrl !== target.href || !$("auto-refresh").checked)) return false;
    if (!automatic) {
      cancelBackendRefresh();
      connectedBackendUrl = null;
      backendSnapshot = null;
      put("backend-status", "Connecting to backend…");
    }
    backendBusy = true;
    $("refresh-report").disabled = true;
    let loaded = false;
    try {
      const response = await fetch(target.href, {headers: {Accept: "application/json"}, cache: "no-store", signal: AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error("Backend returned HTTP " + response.status + ".");
      const next = normalize(await response.json());
      if (!hasData(next)) throw new Error("Backend response has no supported measurements.");
      if (automatic && (!connectedBackendUrl || connectedBackendUrl !== target.href || !$("auto-refresh").checked)) return false;
      const changed = !backendSnapshot || JSON.stringify(next) !== JSON.stringify(backendSnapshot);
      if (changed) {
        current = next; active = null; render(); error();
      }
      backendSnapshot = next;
      connectedBackendUrl = target.href;
      loaded = true;
      put("backend-status", automatic
        ? (changed ? "New backend data received and displayed." : "No new backend data. Checking again in 30 seconds.")
        : $("auto-refresh").checked
          ? "Backend connected. Automatic refresh checks every 30 seconds."
          : "Backend connected. Automatic refresh is paused.");
      put("storage-status", "Backend report displayed. Use Save displayed report to archive it under the selected upload month.");
      return changed;
    } catch (e) {
      if (!automatic) put("backend-status", "Backend connection failed. Automatic refresh is not active.");
      throw e;
    } finally {
      backendBusy = false;
      $("refresh-report").disabled = false;
      if (loaded && !automatic) scheduleBackendRefresh();
    }
  }
  $("refresh-report").addEventListener("click", async () => {
    try { await loadFromUrl($("backend-url").value); }
    catch (e) { error("Backend load failed: " + e.message); }
  });
  $("auto-refresh").addEventListener("change", () => {
    if ($("auto-refresh").checked) {
      scheduleBackendRefresh();
      put("backend-status", connectedBackendUrl
        ? "Automatic refresh enabled. Checking every 30 seconds."
        : "Click Refresh from backend to connect before automatic refresh can start.");
    } else {
      cancelBackendRefresh();
      put("backend-status", "Automatic refresh is paused.");
    }
  });
  $("backend-url").addEventListener("input", () => {
    if (!connectedBackendUrl) return;
    let editedUrl = "";
    try { editedUrl = new URL($("backend-url").value.trim(), window.location.href).href; }
    catch { /* Invalid edits still disconnect the previous URL. */ }
    if (editedUrl !== connectedBackendUrl) {
      stopBackendRefresh();
      put("backend-status", "Backend URL changed. Click Refresh from backend to connect to the new URL.");
    }
  });
  $("save-current").addEventListener("click", () => {
    try { saveSnapshot(current, $("upload-month").value, "Backend inspection report"); }
    catch (e) { error("Save failed: " + e.message); }
  });
  const now = new Date();
  $("upload-month").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  let savedTheme = "light";
  try { savedTheme = localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light"; }
  catch (e) { settingsStatus("Could not read the saved theme preference: " + e.message); }
  applyTheme(savedTheme);
  loadArchive(); refreshSelectors();
  if (records.length) selectReport(); else render();
})();
