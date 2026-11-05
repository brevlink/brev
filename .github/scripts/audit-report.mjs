#!/usr/bin/env node
// Riepilogo leggibile di `npm audit --json`.
//
// La issue di audit deve dire quali pacchetti sono coinvolti: il link al run
// costringe a leggere i log per capire se e' cambiato qualcosa dal mese prima.
import { readFileSync } from "node:fs";

const [, , app, file] = process.argv;
if (!app || !file) {
  console.error("uso: audit-report.mjs <app> <audit.json>");
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.log(`### ${app}\n\nReport non leggibile: ${error.message}\n`);
  process.exit(0);
}

const counts = data?.metadata?.vulnerabilities ?? {};
const vulns = Object.values(data?.vulnerabilities ?? {}).sort(
  (a, b) => severityRank(b?.severity) - severityRank(a?.severity) || String(a?.name).localeCompare(String(b?.name)),
);

function severityRank(value) {
  return { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }[value] ?? 0;
}

function fixLabel(fixAvailable) {
  if (fixAvailable === true) return "aggiornamento disponibile";
  if (fixAvailable && typeof fixAvailable === "object") {
    const name = fixAvailable.name ?? "dipendenza";
    const version = fixAvailable.version ? ` a ${fixAvailable.version}` : "";
    return `fix: ${name}${version}${fixAvailable.isSemVerMajor ? " (major)" : ""}`;
  }
  return "nessun fix automatico";
}

const lines = [`### ${app}`, ""];

if (!vulns.length) {
  lines.push("Nessuna advisory.", "");
} else {
  lines.push(
    `Advisory: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
      `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low.`,
    "",
  );
  for (const vuln of vulns) {
    const via = Array.isArray(vuln?.via) ? vuln.via : [];
    const advisory = via.find((entry) => entry && typeof entry === "object");
    const title = advisory?.title ?? (typeof via[0] === "string" ? via[0] : "advisory");
    const link = advisory?.url ? ` ([advisory](${advisory.url}))` : "";
    const scope = vuln?.isDirect ? "diretta" : "transitiva";
    lines.push(
      `- **${vuln?.name}** — ${vuln?.severity ?? "unknown"}, ${scope} — ${title}${link} — ${fixLabel(vuln?.fixAvailable)}`,
    );
  }
  lines.push("");
}

console.log(lines.join("\n"));
