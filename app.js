/*
  AI Manufacturing UI - frontend/output

  No data is loaded, fabricated, or requested on startup.

  Later, the backend connection will supply a JSON object to:

  ManufacturingDashboard.update(data);

  Missing values stay unavailable rather than being shown as zero.
*/

(() => {
  "use strict";

  // Initial state: no measurements have been supplied.
  const empty = () => ({
    production: null,
    defects: null,
    runtimeSeconds: null,
    averageTimeSeconds: null,
    qualityScore: null,
    inspection: null
  });

  let current = empty();

  const missing = "—";

  const countFormat = new Intl.NumberFormat("en-US");

  const count = value =>
    value === null ? missing : countFormat.format(value);

  const pct = value =>
    value === null ? missing : value.toFixed(1) + "%";

  const seconds = value =>
    value === null ? missing : value.toFixed(2) + " s";

  const put = (id, value) => {
    document.getElementById(id).textContent = value;
  };

  /*
    Validate an optional numeric field.

    null or undefined: unavailable
    0: a real supplied measurement

    Counts must be safe integers.
    Percentages must be between 0 and 100.
  */
  function optional(
    value,
    name,
    max = Infinity,
    integer = false
  ) {
    if (value === null || value === undefined) {
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
        (max === Infinity ? "" : " no greater than " + max)
      );
    }

    return value;
  }

  function object(value, name) {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new TypeError(name + " must be an object");
    }

    return value;
  }

  function requiredObject(value, name) {
    const result = object(value, name);

    if (!result) {
      throw new TypeError(name + " is required");
    }

    return result;
  }

  function requiredFields(value, name, fields) {
    fields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        throw new TypeError(name + "." + field + " is required");
      }
    });
  }

  function requiredString(value, name) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(name + " must be a nonempty string");
    }

    return value;
  }

  function requiredDateTime(value, name) {
    const result = requiredString(value, name);
    const isoDateTime =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

    if (!isoDateTime.test(result) || !Number.isFinite(Date.parse(result))) {
      throw new TypeError(name + " must be an ISO 8601 date-time");
    }

    return result;
  }

  function requiredBoolean(value, name) {
    if (typeof value !== "boolean") {
      throw new TypeError(name + " must be a boolean");
    }

    return value;
  }

  function requiredNumber(value, name, max = Infinity, integer = false) {
    if (value === null || value === undefined) {
      throw new TypeError(name + " is required");
    }

    return optional(value, name, max, integer);
  }

  function requiredEnum(value, name, allowed) {
    if (!allowed.includes(value)) {
      throw new TypeError(
        name + " must be one of: " + allowed.join(", ")
      );
    }

    return value;
  }

  function validateInspectionReport(value) {
    const report = requiredObject(value, "report");
    if (report.schema !== "casting-inspection/1") {
      throw new TypeError(
        'report.schema must be "casting-inspection/1"'
      );
    }
    requiredFields(report, "report", [
      "schema",
      "generated_at",
      "source",
      "summary",
      "castings"
    ]);

    requiredDateTime(
      report.generated_at,
      "report.generated_at"
    );

    const source = requiredObject(report.source, "report.source");
    requiredFields(source, "report.source", [
      "stage_one",
      "stage_two",
      "split",
      "scope",
      "near_duplicate_below"
    ]);

    const stageOne = requiredObject(
      source.stage_one,
      "report.source.stage_one"
    );
    requiredFields(stageOne, "report.source.stage_one", [
      "run",
      "model",
      "trained_at",
      "augmented",
      "training_images",
      "accuracy_pct",
      "epochs_run"
    ]);
    requiredString(stageOne.run, "report.source.stage_one.run");
    requiredString(stageOne.model, "report.source.stage_one.model");
    requiredDateTime(
      stageOne.trained_at,
      "report.source.stage_one.trained_at"
    );

    requiredBoolean(
      stageOne.augmented,
      "report.source.stage_one.augmented"
    );
    requiredNumber(
      stageOne.training_images,
      "report.source.stage_one.training_images",
      Infinity,
      true
    );
    requiredNumber(
      stageOne.accuracy_pct,
      "report.source.stage_one.accuracy_pct",
      100
    );
    requiredNumber(
      stageOne.epochs_run,
      "report.source.stage_one.epochs_run",
      Infinity,
      true
    );

    const stageTwo = requiredObject(
      source.stage_two,
      "report.source.stage_two"
    );
    requiredFields(stageTwo, "report.source.stage_two", [
      "cutoffs",
      "pos_weight",
      "labels_behind_cutoffs"
    ]);
    requiredString(stageTwo.cutoffs, "report.source.stage_two.cutoffs");
    requiredBoolean(stageTwo.pos_weight, "report.source.stage_two.pos_weight");
    requiredNumber(
      stageTwo.labels_behind_cutoffs,
      "report.source.stage_two.labels_behind_cutoffs",
      Infinity,
      true
    );
    requiredString(source.split, "report.source.split");
    requiredString(source.scope, "report.source.scope");
    requiredNumber(
      source.near_duplicate_below,
      "report.source.near_duplicate_below"
    );

    const summary = requiredObject(report.summary, "report.summary");
    requiredFields(summary, "report.summary", [
      "castings",
      "verdict",
      "label",
      "accuracy",
      "near_duplicates",
      "defect_types"
    ]);
    const castingCount = requiredNumber(
      summary.castings,
      "report.summary.castings",
      Infinity,
      true
    );
    requiredNumber(
      summary.near_duplicates,
      "report.summary.near_duplicates",
      Infinity,
      true
    );

    const verdict = requiredObject(
      summary.verdict,
      "report.summary.verdict"
    );
    requiredFields(verdict, "report.summary.verdict", [
      "good",
      "defective",
      "not_inspected"
    ]);
    ["good", "defective", "not_inspected"].forEach(key => {
      requiredNumber(
        verdict[key],
        "report.summary.verdict." + key,
        Infinity,
        true
      );
    });

    const labels = requiredObject(summary.label, "report.summary.label");
    requiredFields(labels, "report.summary.label", [
      "good",
      "defective",
      "unknown"
    ]);
    ["good", "defective", "unknown"].forEach(key => {
      requiredNumber(
        labels[key],
        "report.summary.label." + key,
        Infinity,
        true
      );
    });

    const accuracy = requiredObject(
      summary.accuracy,
      "report.summary.accuracy"
    );
    requiredFields(accuracy, "report.summary.accuracy", [
      "judged",
      "correct",
      "incorrect",
      "pct",
      "missed_defects",
      "false_alarms"
    ]);
    ["judged", "correct", "incorrect", "missed_defects", "false_alarms"]
      .forEach(key => {
        requiredNumber(
          accuracy[key],
          "report.summary.accuracy." + key,
          Infinity,
          true
        );
      });
    requiredNumber(accuracy.pct, "report.summary.accuracy.pct", 100);

    const defectTypes = requiredObject(
      summary.defect_types,
      "report.summary.defect_types"
    );
    requiredFields(defectTypes, "report.summary.defect_types", [
      "assessed",
      "counts",
      "rates_pct",
      "cutoffs",
      "per_casting",
      "combinations"
    ]);
    requiredNumber(
      defectTypes.assessed,
      "report.summary.defect_types.assessed",
      Infinity,
      true
    );

    const defectNames = ["fray", "chip", "spot", "slash"];
    ["counts", "rates_pct", "cutoffs"].forEach(field => {
      const values = requiredObject(
        defectTypes[field],
        "report.summary.defect_types." + field
      );
      requiredFields(
        values,
        "report.summary.defect_types." + field,
        defectNames
      );
      defectNames.forEach(name => {
        requiredNumber(
          values[name],
          "report.summary.defect_types." + field + "." + name,
          field === "counts"
            ? Infinity
            : field === "rates_pct"
              ? 100
              : 1,
          field === "counts"
        );
      });
    });

    const perCasting = requiredObject(
      defectTypes.per_casting,
      "report.summary.defect_types.per_casting"
    );
    Object.entries(perCasting).forEach(([key, count]) => {
      requiredNumber(
        count,
        "report.summary.defect_types.per_casting." + key,
        Infinity,
        true
      );
    });

    if (!Array.isArray(defectTypes.combinations)) {
      throw new TypeError(
        "report.summary.defect_types.combinations must be an array"
      );
    }

    defectTypes.combinations.forEach((combination, index) => {
      const name = "report.summary.defect_types.combinations[" + index + "]";
      const entry = requiredObject(combination, name);
      requiredFields(entry, name, ["types", "count", "pct"]);

      if (
        !Array.isArray(entry.types) ||
        entry.types.some(type => !defectNames.includes(type))
      ) {
        throw new TypeError(name + ".types contains an invalid defect type");
      }

      requiredNumber(entry.count, name + ".count", Infinity, true);
      requiredNumber(entry.pct, name + ".pct", 100);
    });

    if (!Array.isArray(report.castings)) {
      throw new TypeError("report.castings must be an array");
    }

    if (report.castings.length !== castingCount) {
      throw new RangeError(
        "report.castings length must match report.summary.castings"
      );
    }

    const verdictCounts = { good: 0, defective: 0, not_inspected: 0 };
    const labelCounts = { good: 0, defective: 0, unknown: 0 };
    const correctCounts = { correct: 0, incorrect: 0 };

    report.castings.forEach((casting, index) => {
      const name = "report.castings[" + index + "]";
      const entry = requiredObject(casting, name);
      requiredFields(entry, name, [
        "id",
        "file",
        "split",
        "label",
        "verdict",
        "confidence",
        "correct",
        "defects",
        "defect_count",
        "duplicate"
      ]);
      requiredString(entry.id, name + ".id");
      requiredString(entry.file, name + ".file");
      requiredString(entry.split, name + ".split");
      requiredEnum(entry.label, name + ".label", [
        "good",
        "defective",
        "unknown"
      ]);
      requiredEnum(entry.verdict, name + ".verdict", [
        "good",
        "defective",
        "not_inspected"
      ]);
      requiredNumber(entry.confidence, name + ".confidence", 1);

      if (entry.correct !== null && typeof entry.correct !== "boolean") {
        throw new TypeError(name + ".correct must be a boolean or null");
      }

      if (entry.correct !== null) {
        correctCounts[entry.correct ? "correct" : "incorrect"] += 1;
      }

      verdictCounts[entry.verdict] += 1;
      labelCounts[entry.label] += 1;

      if (entry.defect_count !== null) {
        requiredNumber(entry.defect_count, name + ".defect_count", Infinity, true);
      }

      if (entry.defects !== null) {
        if (!Array.isArray(entry.defects)) {
          throw new TypeError(name + ".defects must be an array or null");
        }

        entry.defects.forEach((defect, defectIndex) => {
          const defectName = name + ".defects[" + defectIndex + "]";
          const defectEntry = requiredObject(defect, defectName);
          requiredFields(defectEntry, defectName, [
            "type",
            "score",
            "present",
            "cutoff"
          ]);
          requiredEnum(defectEntry.type, defectName + ".type", defectNames);
          requiredNumber(defectEntry.score, defectName + ".score", 1);
          requiredBoolean(defectEntry.present, defectName + ".present");
          requiredNumber(defectEntry.cutoff, defectName + ".cutoff", 1);
        });
      }

      if (entry.duplicate !== null) {
        const duplicate = requiredObject(entry.duplicate, name + ".duplicate");
        requiredFields(duplicate, name + ".duplicate", ["of", "residual"]);
        requiredString(duplicate.of, name + ".duplicate.of");
        requiredNumber(duplicate.residual, name + ".duplicate.residual");
      }
    });

    ["good", "defective", "not_inspected"].forEach(key => {
      if (verdictCounts[key] !== verdict[key]) {
        throw new RangeError(
          "report.summary.verdict." + key + " does not match report.castings"
        );
      }
    });
    ["good", "defective", "unknown"].forEach(key => {
      if (labelCounts[key] !== labels[key]) {
        throw new RangeError(
          "report.summary.label." + key + " does not match report.castings"
        );
      }
    });

    if (
      correctCounts.correct + correctCounts.incorrect !== accuracy.judged ||
      correctCounts.correct !== accuracy.correct ||
      correctCounts.incorrect !== accuracy.incorrect
    ) {
      throw new RangeError(
        "report.summary.accuracy does not match report.castings"
      );
    }
  }

  /*
    Production data contains mutually exclusive counts:
    good parts and defective parts.
  */
  function production(value, name) {
    value = object(value, name);

    if (!value) {
      return null;
    }

    const good = optional(
      value.good,
      name + ".good",
      Infinity,
      true
    );

    const defective = optional(
      value.defective,
      name + ".defective",
      Infinity,
      true
    );
    const suppliedTotal = optional(
      value.total,
      name + ".total",
      Infinity,
      true
    );

    if (
      good !== null &&
      defective !== null &&
      !Number.isSafeInteger(good + defective)
    ) {
      throw new RangeError("Total exceeds safe integer range");
    }

    const classified = (good ?? 0) + (defective ?? 0);

    if (
      suppliedTotal !== null &&
      classified > suppliedTotal
    ) {
      throw new RangeError(name + ".total is less than classified parts");
    }

    return {
      total: suppliedTotal,
      good,
      defective
    };
  }

  /*
    Total = good + defective

    Defect rate = defective / total × 100
    Yield = good / total × 100

    When total is zero, percentages remain unavailable.
  */
  function totals(p) {
    const calculatedTotal =
      p &&
      p.good !== null &&
      p.defective !== null
        ? p.good + p.defective
        : null;
    const total = p?.total ?? calculatedTotal;

    return {
      total,
      good: p?.good ?? null,
      bad: p?.defective ?? null,

      defectRate:
        total > 0
          ? 100 * p.defective / total
          : null,

      yield:
        total > 0
          ? 100 * p.good / total
          : null
    };
  }

  /*
    Validate and normalize an entire incoming snapshot.

    Omitted fields become unavailable.
    Invalid input is rejected before the display changes.
  */
  function normalize(data) {
    if (!object(data, "data")) {
      throw new TypeError("data must be an object");
    }

    const summary = object(data.summary, "summary");
    let source = data;
    let reportInspection = null;

    if (summary) {
      const verdict = object(summary.verdict, "summary.verdict");
      const accuracy = object(summary.accuracy, "summary.accuracy");
      const defectTypes = object(
        summary.defect_types,
        "summary.defect_types"
      );
      const defectCounts = object(
        defectTypes?.counts,
        "summary.defect_types.counts"
      );
      const castingCount = optional(
        summary.castings,
        "summary.castings",
        Infinity,
        true
      );
      const goodCount = optional(
        verdict?.good,
        "summary.verdict.good",
        Infinity,
        true
      );
      const judged = optional(
        accuracy?.judged,
        "summary.accuracy.judged",
        Infinity,
        true
      );
      const incorrect = optional(
        accuracy?.incorrect,
        "summary.accuracy.incorrect",
        Infinity,
        true
      );
      const errorRatePct =
        judged > 0 && incorrect !== null
          ? 100 * incorrect / judged
          : null;
      const partQualityPct =
        castingCount > 0 && goodCount !== null
          ? 100 * goodCount / castingCount
          : null;

      source = {
        production: {
          total: castingCount,
          good: goodCount,
          defective: verdict?.defective
        },
        defects: defectCounts,
        qualityScore: partQualityPct
      };

      reportInspection = {
        errorRatePct,
        qualityScore: partQualityPct
      };
    }

    const d = object(source.defects, "defects");
    const m = object(source.inspection, "inspection");
    const normalizedProduction = production(
      source.production,
      "production"
    );

    return {
      production: normalizedProduction,

      defects: d
        ? Object.fromEntries(
            ["fray", "chip", "spot", "slash"].map(key => [
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

      runtimeSeconds: optional(
        source.runtimeSeconds,
        "runtimeSeconds"
      ),

      averageTimeSeconds: optional(
        source.averageTimeSeconds,
        "averageTimeSeconds"
      ),

      qualityScore: optional(
        source.qualityScore,
        "qualityScore",
        100
      ),

      inspection: reportInspection
        ? {
            production: normalizedProduction,
            errorRatePct: optional(
              reportInspection.errorRatePct,
              "summary.accuracy.errorRatePct",
              100
            ),
            averageTimeSeconds: null,
            qualityScore: optional(
              reportInspection.qualityScore,
              "summary.accuracy.pct",
              100
            )
          }
        : m
        ? {
            production: production(
              m.production,
              "inspection.production"
            ),

            errorRatePct: optional(
              m.errorRatePct,
              "inspection.errorRatePct",
              100
            ),

            averageTimeSeconds: optional(
              m.averageTimeSeconds,
              "inspection.averageTimeSeconds"
            ),

            qualityScore: optional(
              m.qualityScore,
              "inspection.qualityScore",
              100
            )
          }
        : null
    };
  }

  // Display elapsed runtime as hours, minutes, and seconds.
  function duration(value) {
    if (value === null) {
      return missing;
    }

    const n = Math.floor(value);

    const h = Math.floor(n / 3600);
    const m = Math.floor(n % 3600 / 60);
    const s = n % 60;

    return (
      h + "h " +
      String(m).padStart(2, "0") + "m " +
      String(s).padStart(2, "0") + "s"
    );
  }

  /*
    QUALITY GAUGE

    Five equal bands:
    Red:    0-20%
    Orange: 20-40%
    Yellow: 40-60%
    Lime:   60-80%
    Green:  80-100%

    The gauge runs from 0% at the left to 100% at the right.
  */
  const svgNS = "http://www.w3.org/2000/svg";

  function point(radius, degrees) {
    const angle = degrees * Math.PI / 180;

    return [
      160 + radius * Math.cos(angle),
      150 - radius * Math.sin(angle)
    ];
  }

  const colors = [
    "#df4848",
    "#f18c34",
    "#f1ca3e",
    "#a3d545",
    "#36a568"
  ];

  colors.forEach((color, index) => {
    const start = 180 - index * 36;
    const end = start - 36;

    const a = point(135, start);
    const b = point(135, end);
    const c = point(105, end);
    const d = point(105, start);

    const path = document.createElementNS(svgNS, "path");

    path.setAttribute(
      "d",
      `M ${a}
       A 135 135 0 0 1 ${b}
       L ${c}
       A 105 105 0 0 0 ${d}
       Z`
    );

    path.setAttribute("fill", color);

    document.getElementById("gauge-bands").append(path);
  });

  // Update every required display.
  function render(data) {
    const p = totals(data.production);

    // Production totals
    put("total", count(p.total));
    put("good", count(p.good));
    put("bad", count(p.bad));
    put("defect-rate", pct(p.defectRate));

    // Defect category counts
    ["fray", "chip", "spot", "slash"].forEach(key => {
      put(key, count(data.defects?.[key] ?? null));
    });

    // Runtime and average time per part
    put("runtime", duration(data.runtimeSeconds));
    put("avg-time", seconds(data.averageTimeSeconds));

    // Quality score
    put("quality", pct(data.qualityScore));

    const needle = document.getElementById("needle");

    needle.setAttribute(
      "visibility",
      data.qualityScore === null ? "hidden" : "visible"
    );

    needle.setAttribute(
      "transform",
      `rotate(${(data.qualityScore ?? 0) * 1.8} 160 150)`
    );

    document.getElementById("gauge").setAttribute(
      "aria-label",
      "Quality score: " +
      (
        data.qualityScore === null
          ? "waiting for data"
          : pct(data.qualityScore)
      )
    );

    // Inspection summary
    const m = data.inspection;
    const mt = totals(m?.production ?? null);

    put("inspection-total", count(mt.total));
    put("inspection-good", count(mt.good));
    put("inspection-bad", count(mt.bad));
    put("inspection-yield", pct(mt.yield));
    put("inspection-defect", pct(mt.defectRate));

    put("inspection-error", pct(m?.errorRatePct ?? null));

    put(
      "inspection-time",
      seconds(m?.averageTimeSeconds ?? null)
    );

    put(
      "inspection-quality",
      pct(m?.qualityScore ?? null)
    );

    // Determine whether any actual values were supplied.
    const values = [
      p.good,
      p.bad,
      data.runtimeSeconds,
      data.averageTimeSeconds,
      data.qualityScore,
      ...Object.values(data.defects ?? {}),
      mt.good,
      mt.bad,
      m?.errorRatePct ?? null,
      m?.averageTimeSeconds ?? null,
      m?.qualityScore ?? null
    ];

    put(
      "data-status",
      values.some(value => value !== null)
        ? "Displaying supplied data. Unavailable values are shown as —."
        : "Waiting for data. No input has been connected."
    );
  }

  /*
    PUBLIC FUNCTIONS FOR LATER INTEGRATION

    update(data):
      Replaces the displayed data with a validated snapshot.

    clear():
      Returns the dashboard to its empty initial state.
  */
  window.ManufacturingDashboard = Object.freeze({
    update(data) {
      const next = normalize(data);

      current = next;
      render(current);
    },

    clear() {
      current = empty();
      render(current);
    }
  });

  document
    .getElementById("report-file")
    .addEventListener("change", async event => {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      try {
        const report = JSON.parse(await file.text());
        validateInspectionReport(report);
        window.ManufacturingDashboard.update(report);
        put("data-status", "Displaying inspection report: " + file.name);
      } catch (error) {
        put("data-status", "Could not load report: " + error.message);
      }

      event.target.value = "";
    });

  // Display the initial empty dashboard.
  render(current);
})();