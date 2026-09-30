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
    october: null
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

    if (
      good !== null &&
      defective !== null &&
      !Number.isSafeInteger(good + defective)
    ) {
      throw new RangeError("Total exceeds safe integer range");
    }

    return {
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
    const total =
      p &&
      p.good !== null &&
      p.defective !== null
        ? p.good + p.defective
        : null;

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

    const d = object(data.defects, "defects");
    const m = object(data.october, "october");

    return {
      production: production(
        data.production,
        "production"
      ),

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
        data.runtimeSeconds,
        "runtimeSeconds"
      ),

      averageTimeSeconds: optional(
        data.averageTimeSeconds,
        "averageTimeSeconds"
      ),

      qualityScore: optional(
        data.qualityScore,
        "qualityScore",
        100
      ),

      october: m
        ? {
            production: production(
              m.production,
              "october.production"
            ),

            errorRatePct: optional(
              m.errorRatePct,
              "october.errorRatePct",
              100
            ),

            averageTimeSeconds: optional(
              m.averageTimeSeconds,
              "october.averageTimeSeconds"
            ),

            qualityScore: optional(
              m.qualityScore,
              "october.qualityScore",
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

    // October summary
    const m = data.october;
    const mt = totals(m?.production ?? null);

    put("month-total", count(mt.total));
    put("month-good", count(mt.good));
    put("month-bad", count(mt.bad));
    put("month-yield", pct(mt.yield));
    put("month-defect", pct(mt.defectRate));

    put("month-error", pct(m?.errorRatePct ?? null));

    put(
      "month-time",
      seconds(m?.averageTimeSeconds ?? null)
    );

    put(
      "month-quality",
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

  // Display the initial empty dashboard.
  render(current);
})();