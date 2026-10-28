/*
  AI Manufacturing UI — frontend/output.

  No sample measurements are loaded on startup.

  Display a validated JSON object:
    ManufacturingDashboard.update(data);

  Save the current report:
    ManufacturingDashboard.saveCurrent("YYYY-MM", "Report name");

  Clear the display without deleting saved reports:
    ManufacturingDashboard.clear();
*/

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const put = (id, value) => {
    $(id).textContent = value;
  };

  const keys = ["fray", "chip", "spot", "slash"];

  const storageKey = "manufacturing-dashboard-reports-v1";

  const missing = "—";

  const countFormat = new Intl.NumberFormat("en-US");

  const count = value =>
    value === null ? missing : countFormat.format(value);

  const pct = value =>
    value === null ? missing : value.toFixed(1) + "%";

  const empty = () => ({
    production: null,
    defects: null,
    qualityScore: null,
    errorRatePct: null,
    summary: null
  });

  let current = empty();
  let records = [];
  let active = null;
  let archiveReadable = true;

  /*
    VALIDATION

    Missing values stay unavailable.
    Zero is treated as a real measurement.
  */

  function object(value, name) {
    if (value == null) {
      return null;
    }

    if (
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new TypeError(name + " must be an object.");
    }

    return value;
  }

  function optional(
    value,
    name,
    max = Infinity,
    integer = false
  ) {
    if (value == null) {
      return null;
    }

    const invalid =
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > max ||
      (integer && !Number.isSafeInteger(value));

    if (invalid) {
      throw new TypeError(
        name +
        " must be a nonnegative " +
        (integer ? "safe integer" : "finite number") +
        (
          max === Infinity
            ? "."
            : " no greater than " + max + "."
        )
      );
    }

    return value;
  }

  function production(value, name) {
    const p = object(value, name);

    if (!p) {
      return null;
    }

    const good = optional(
      p.good,
      name + ".good",
      Infinity,
      true
    );

    const defective = optional(
      p.defective,
      name + ".defective",
      Infinity,
      true
    );

    if (
      good !== null &&
      defective !== null &&
      !Number.isSafeInteger(good + defective)
    ) {
      throw new RangeError(
        "Total exceeds safe integer range."
      );
    }

    return {
      good,
      defective
    };
  }

  /*
    Good and defective parts are mutually exclusive.

    A defective part can have several defect categories,
    but it is counted only once in the defective total.
  */

  function totals(p) {
    const total =
      p?.good != null &&
      p?.defective != null
        ? p.good + p.defective
        : null;

    return {
      total,
      good: p?.good ?? null,
      bad: p?.defective ?? null,

      defectRate:
        total > 0
          ? p.defective / total * 100
          : null,

      yield:
        total > 0
          ? p.good / total * 100
          : null
    };
  }

  function normalize(data) {
    if (!object(data, "data")) {
      throw new TypeError("data must be an object.");
    }

    // Timing fields from older reports are ignored.
    const d = object(data.defects, "defects");

    // Accept the original October summary format as well.
    const summary = object(
      data.summary ?? data.october,
      "summary"
    );

    const result = {
      production: production(
        data.production,
        "production"
      ),

      defects: d
        ? Object.fromEntries(
            keys.map(key => [
              key,
              optional(
                d[key],
                "defects." + key,
                Infinity,
                true
              )
            ])
          )
        : null,

      qualityScore: optional(
        data.qualityScore,
        "qualityScore",
        100
      ),

      errorRatePct: optional(
        data.errorRatePct,
        "errorRatePct",
        100
      ),

      summary: summary
        ? {
            production: production(
              summary.production,
              "summary.production"
            ),

            errorRatePct: optional(
              summary.errorRatePct,
              "summary.errorRatePct",
              100
            ),

            qualityScore: optional(
              summary.qualityScore,
              "summary.qualityScore",
              100
            )
          }
        : null
    };

    /*
      Category counts may overlap.

      Their sum can exceed the defective-parts total.

      However, one category cannot contain more unique
      defective parts than the defective-parts total.
    */

    const p = totals(result.production);

    if (
      p.bad !== null &&
      result.defects &&
      Object.values(result.defects).some(
        value => value !== null && value > p.bad
      )
    ) {
      throw new RangeError(
        "A defect category count cannot exceed " +
        "the number of defective parts."
      );
    }

    return result;
  }

  function hasData(value) {
    return Object.values(value).some(
      item =>
        item !== null &&
        (
          typeof item !== "object" ||
          hasData(item)
        )
    );
  }

  /*
    MONTH FORMATTING
  */

  function month(value) {
    const valid =
      typeof value === "string" &&
      /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);

    if (!valid) {
      throw new TypeError(
        "Select a valid report month."
      );
    }

    return value;
  }

  function monthLabel(value) {
    if (!value) {
      return missing;
    }

    const [year, monthNumber] =
      value.split("-").map(Number);

    const date = new Date(0);

    date.setUTCFullYear(
      year,
      monthNumber - 1,
      1
    );

    return new Intl.DateTimeFormat(
      "en-US",
      {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }
    ).format(date);
  }

  function error(message = "") {
    put("error-message", message);
    $("error-message").hidden = !message;
  }

  /*
    UPDATE THE DASHBOARD
  */

  function render() {
    const p = totals(current.production);

    put("total", count(p.total));
    put("good", count(p.good));
    put("bad", count(p.bad));
    put("defect-rate", pct(p.defectRate));

    /*
      Rank known defect counts from largest to smallest.

      Missing counts appear last.
      Ties retain their original category order.
    */

    const ranked = keys.map((key, index) => ({
      key,
      index,
      value: current.defects?.[key] ?? null
    }));

    ranked.sort(
      (a, b) =>
        (a.value === null) - (b.value === null) ||
        (b.value ?? 0) - (a.value ?? 0) ||
        a.index - b.index
    );

    let previous = null;
    let rank = 0;

    ranked.forEach((entry, index) => {
      const row = document.querySelector(
        '[data-defect="' + entry.key + '"]'
      );

      if (
        entry.value !== null &&
        entry.value !== previous
      ) {
        rank = index + 1;
      }

      row.querySelector(".rank").textContent =
        entry.value === null
          ? missing
          : "#" + rank;

      put(entry.key, count(entry.value));

      $("defect-list").append(row);

      previous = entry.value;
    });

    /*
      QUALITY FUEL BAR

      F: 0 to below 20
      D: 20 to below 40
      C: 40 to below 60
      B: 60 to below 80
      A: 80 through 100
    */

    const score = current.qualityScore;

    put("quality", pct(score));

    const grades = [
      ["F", "Bad"],
      ["D", "Decent"],
      ["C", "Good"],
      ["B", "Great"],
      ["A", "Excellent"]
    ];

    const grade =
      score === null
        ? null
        : grades[
            Math.min(
              4,
              Math.floor(score / 20)
            )
          ];

    put(
      "quality-status",
      grade
        ? grade[0] + " · " + grade[1]
        : "Waiting for a quality score"
    );

    $("fuel-cover").style.width =
      (100 - (score ?? 0)) + "%";

    $("fuel-marker").style.left =
      (score ?? 0) + "%";

    $("fuel-marker").hidden =
      score === null;

    $("quality-meter").classList.toggle(
      "unavailable",
      score === null
    );

    if (score === null) {
      $("quality-meter").removeAttribute(
        "aria-valuenow"
      );
    } else {
      $("quality-meter").setAttribute(
        "aria-valuenow",
        score
      );
    }

    $("quality-meter").setAttribute(
      "aria-valuetext",
      grade
        ? pct(score) + ", " + grade.join(", ")
        : "Unavailable"
    );

    /*
      SELECTED REPORT SUMMARY

      If no separate summary is supplied, display
      the selected report's top-level values.
    */

    const summary = current.summary;

    const summaryTotals = totals(
      summary
        ? summary.production
        : current.production
    );

    put("month-total", count(summaryTotals.total));
    put("month-good", count(summaryTotals.good));
    put("month-bad", count(summaryTotals.bad));

    put(
      "month-yield",
      pct(summaryTotals.yield)
    );

    put(
      "month-defect",
      pct(summaryTotals.defectRate)
    );

    put(
      "month-error",
      pct(
        summary
          ? summary.errorRatePct
          : current.errorRatePct
      )
    );

    put(
      "month-quality",
      pct(
        summary
          ? summary.qualityScore
          : current.qualityScore
      )
    );

    put(
      "summary-month",
      monthLabel(active?.month)
    );

    put(
      "summary-label",
      active
        ? active.label + " · " + monthLabel(active.month)
        : "Current unsaved report. " +
          "Upload or save it to assign a month."
    );

    put(
      "data-status",
      hasData(current)
        ? (
            active
              ? "Displaying saved report: " +
                active.label +
                "."
              : "Displaying supplied data."
          ) +
          " Unavailable values are shown as —."
        : "Waiting for data. " +
          "No measurements are available."
    );
  }

  /*
    MONTH AND REPORT SELECTORS
  */

  function refreshSelectors(
    selectedMonth = active?.month,
    selectedId = active?.id
  ) {
    const months = [
      ...new Set(
        records.map(record => record.month)
      )
    ].sort().reverse();

    const monthSelect = $("month-select");

    monthSelect.replaceChildren();

    if (!months.length) {
      monthSelect.add(
        new Option("No saved months", "")
      );
    }

    months.forEach(value => {
      monthSelect.add(
        new Option(monthLabel(value), value)
      );
    });

    monthSelect.disabled = !months.length;

    monthSelect.value =
      months.includes(selectedMonth)
        ? selectedMonth
        : (months[0] ?? "");

    const reports = records
      .filter(
        record => record.month === monthSelect.value
      )
      .slice()
      .reverse();

    const reportSelect = $("report-select");

    reportSelect.replaceChildren();

    if (!reports.length) {
      reportSelect.add(
        new Option("No saved reports", "")
      );
    }

    reports.forEach(record => {
      reportSelect.add(
        new Option(
          record.label +
          " · " +
          new Date(record.savedAt).toLocaleString(),
          record.id
        )
      );
    });

    reportSelect.disabled = !reports.length;

    reportSelect.value =
      reports.some(record => record.id === selectedId)
        ? selectedId
        : (reports[0]?.id ?? "");

    $("export-history").disabled =
      !records.length;
  }

  function selectReport() {
    const record = records.find(
      item => item.id === $("report-select").value
    );

    if (!record) {
      return;
    }

    current = record.data;
    active = record;

    error();
    render();
  }

  /*
    SAVE A VALIDATED REPORT TO THIS BROWSER

    Storage is written before the display changes,
    so failed saves leave the current report unchanged.
  */

  function saveSnapshot(data, reportMonth, label) {
    if (!archiveReadable) {
      throw new Error(
        "Saved history could not be read. " +
        "Existing browser storage has been left unchanged. " +
        "Restore access before saving new reports."
      );
    }

    const normalized = normalize(data);

    if (!hasData(normalized)) {
      throw new Error(
        "This report has no supported measurements. " +
        "Use the JSON format in README.md."
      );
    }

    const record = {
      id: crypto.randomUUID(),

      month: month(reportMonth),

      label:
        typeof label === "string" && label.trim()
          ? label.trim().slice(0, 200)
          : "Inspection report",

      savedAt: new Date().toISOString(),

      data: normalized
    };

    const next = [...records, record];

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          records: next
        })
      );
    } catch {
      throw new Error(
        "The report could not be saved. " +
        "Browser storage may be full or disabled. " +
        "Existing reports and the display were left unchanged."
      );
    }

    records = next;
    current = normalized;
    active = record;

    refreshSelectors();
    render();
    error();

    put(
      "storage-status",
      "Report saved in this browser. " +
      "Download saved reports to keep a backup."
    );

    return record.id;
  }

  /*
    RESTORE EXISTING BROWSER HISTORY ON STARTUP
  */

  function loadArchive() {
    try {
      const text = localStorage.getItem(storageKey);

      if (!text) {
        return;
      }

      const archive = JSON.parse(text);

      if (
        archive.version !== 1 ||
        !Array.isArray(archive.records)
      ) {
        throw new Error();
      }

      const ids = new Set();

      const validated = archive.records.map(record => {
        if (
          !object(record, "report") ||
          typeof record.id !== "string" ||
          !record.id ||
          ids.has(record.id) ||
          typeof record.label !== "string" ||
          typeof record.savedAt !== "string" ||
          !Number.isFinite(Date.parse(record.savedAt))
        ) {
          throw new Error();
        }

        ids.add(record.id);

        return {
          id: record.id,
          month: month(record.month),
          label: record.label,
          savedAt: record.savedAt,
          data: normalize(record.data)
        };
      });

      records = validated;
    } catch {
      archiveReadable = false;

      error(
        "Saved history could not be read. " +
        "Existing storage has been left unchanged. " +
        "You can still display data using the backend " +
        "update function."
      );
    }
  }

  /*
    UPLOAD A JSON REPORT
  */

  $("report-file").addEventListener(
    "change",
    async event => {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      const reportMonth = $("upload-month").value;

      event.target.disabled = true;

      try {
        month(reportMonth);

        if (file.size > 5 * 1024 * 1024) {
          throw new Error(
            "Choose a JSON summary report smaller than 5 MB."
          );
        }

        const data = JSON.parse(
          await file.text()
        );

        if (
          data?.version === 1 &&
          Array.isArray(data.records)
        ) {
          throw new Error(
            "This is a history backup. " +
            "Choose it under Restore saved reports instead."
          );
        }

        saveSnapshot(
          data,
          reportMonth,
          file.name
        );
      } catch (e) {
        error("Upload failed: " + e.message);
      } finally {
        event.target.value = "";
        event.target.disabled = false;
      }
    }
  );

  $("month-select").addEventListener(
    "change",
    () => {
      refreshSelectors(
        $("month-select").value
      );

      selectReport();
    }
  );

  $("report-select").addEventListener(
    "change",
    selectReport
  );

  /*
    DOWNLOAD A BACKUP OF SAVED REPORTS
  */

  $("export-history").addEventListener(
    "click",
    () => {
      const backup = JSON.stringify(
        {
          version: 1,
          records
        },
        null,
        2
      );

      const blob = new Blob(
        [backup],
        {
          type: "application/json"
        }
      );

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download = "manufacturing-saved-reports.json";

      document.body.append(link);

      link.click();
      link.remove();

      setTimeout(
        () => URL.revokeObjectURL(url),
        1000
      );
    }
  );

  /*
    PUBLIC FUNCTIONS FOR FUTURE BACKEND INTEGRATION
  */

  window.ManufacturingDashboard = Object.freeze({
    update(data) {
      const next = normalize(data);

      current = next;
      active = null;

      render();
      error();
    },

    clear() {
      current = empty();
      active = null;

      render();
      error();
    },

    saveCurrent(reportMonth, label) {
      return saveSnapshot(
        current,
        reportMonth,
        label
      );
    },

    /*
      Merge a history backup with saved reports.

      Identical report IDs are not duplicated.
      Conflicting IDs or invalid entries are rejected
      before storage changes.
    */

    restoreHistory(backup) {
      if (!archiveReadable) {
        throw new Error(
          "Existing history is unreadable; " +
          "restore access before importing."
        );
      }

      if (
        !object(backup, "backup") ||
        backup.version !== 1 ||
        !Array.isArray(backup.records)
      ) {
        throw new TypeError(
          "Invalid history backup."
        );
      }

      const seen = new Set();

      const imported = backup.records.map(record => {
        if (
          !object(record, "report") ||
          typeof record.id !== "string" ||
          !record.id ||
          seen.has(record.id) ||
          typeof record.label !== "string" ||
          typeof record.savedAt !== "string" ||
          !Number.isFinite(Date.parse(record.savedAt))
        ) {
          throw new TypeError(
            "Invalid saved report."
          );
        }

        seen.add(record.id);

        return {
          id: record.id,
          month: month(record.month),
          label: record.label,
          savedAt: record.savedAt,
          data: normalize(record.data)
        };
      });

      for (const item of imported) {
        const existing = records.find(
          record => record.id === item.id
        );

        if (
          existing &&
          JSON.stringify(existing) !== JSON.stringify(item)
        ) {
          throw new Error(
            "A backup report conflicts with " +
            "an existing saved report."
          );
        }
      }

      const existingIds = new Set(
        records.map(record => record.id)
      );

      const next = [
        ...records,

        ...imported.filter(
          record => !existingIds.has(record.id)
        )
      ];

      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          records: next
        })
      );

      records = next;

      refreshSelectors();
      selectReport();
      error();

      put(
        "storage-status",
        "History backup restored in this browser."
      );
    }
  });

  /*
    RESTORE A DOWNLOADED HISTORY BACKUP
  */

  $("history-file").addEventListener(
    "change",
    async event => {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      event.target.disabled = true;

      try {
        if (file.size > 20 * 1024 * 1024) {
          throw new Error(
            "Choose a backup smaller than 20 MB."
          );
        }

        const backup = JSON.parse(
          await file.text()
        );

        window.ManufacturingDashboard.restoreHistory(
          backup
        );
      } catch (e) {
        error("Restore failed: " + e.message);
      } finally {
        event.target.value = "";
        event.target.disabled = false;
      }
    }
  );

  /*
    STARTUP

    Default the upload month to the current month.

    Load only previously saved reports.
    No fabricated or sample measurements are inserted.
  */

  const now = new Date();

  $("upload-month").value =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0");

  loadArchive();
  refreshSelectors();

  if (records.length) {
    selectReport();
  } else {
    render();
  }
})();