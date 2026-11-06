// Evaluation runner. Reads eval/cases.csv, runs the agent on each case (with
// log_request stubbed, so nothing is written to data/requests.json), asks the
// model to grade each case with a structured JSON output, and writes a
// Markdown table to eval/results/<date>-<time>.md.

import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import Anthropic from "@anthropic-ai/sdk";
import { handleGuestMessage, MODEL } from "../server/agent.js";

const CASES_PATH = fileURLToPath(new URL("./cases.csv", import.meta.url));
const RUBRIC_PATH = fileURLToPath(new URL("./rubric.md", import.meta.url));
const POLICIES_PATH = fileURLToPath(
  new URL("../hotel-policies.md", import.meta.url),
);
const RESULTS_DIR = fileURLToPath(new URL("./results/", import.meta.url));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Structured-output schema for the grade: a score and one sentence.
const GRADE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    sentence: { type: "string" },
  },
  required: ["score", "sentence"],
  additionalProperties: false,
};

async function main() {
  const [rubric, policies, casesText] = await Promise.all([
    readFile(RUBRIC_PATH, "utf8"),
    readFile(POLICIES_PATH, "utf8"),
    readFile(CASES_PATH, "utf8"),
  ]);

  const cases = parse(casesText, { columns: true, skip_empty_lines: true });

  // Run and grade all cases at the same time.
  const results = await Promise.all(
    cases.map((row) => runCase(row, rubric, policies)),
  );

  const table = buildTable(results);
  console.log(table);

  await mkdir(RESULTS_DIR, { recursive: true });
  const outPath = fileURLToPath(
    new URL("./results/" + timestamp() + ".md", import.meta.url),
  );
  await writeFile(outPath, table + "\n");
  console.log("\nWrote " + outPath);
}

// Run the agent on one case, then grade it.
async function runCase(row, rubric, policies) {
  const run = await handleGuestMessage(
    { name: row.name, email: row.email, message: row.message },
    { stubLog: true },
  );

  const grade = await grade_case(row, run, rubric, policies);

  return { row, run, grade };
}

// Send one grading request to the model with the rubric, the policies, the
// case and the assistant's output. The grade comes back as structured JSON.
async function grade_case(row, run, rubric, policies) {
  const toolResults = run.toolResults
    .map((t) => t.name + ": " + t.result)
    .join("\n");

  const content =
    rubric +
    "\n\n# Hotel policies\n\n" +
    policies +
    "\n\n# Case\n\n" +
    "Guest name: " +
    row.name +
    "\nGuest e-mail: " +
    row.email +
    "\nGuest message: " +
    row.message +
    "\n\nExpected behaviour: " +
    row.expected +
    "\n\n# Assistant output\n\n" +
    "Log fields: department=" +
    run.fields.department +
    ", urgency=" +
    run.fields.urgency +
    ", summary=" +
    run.fields.summary +
    ", status=" +
    run.fields.status +
    "\n\nFinal text to guest:\n" +
    run.finalText +
    "\n\nTool results:\n" +
    (toolResults || "(none)");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content }],
    output_config: {
      format: { type: "json_schema", schema: GRADE_SCHEMA },
    },
  });

  const text = response.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");

  return JSON.parse(text);
}

// Build the Markdown table. Line breaks inside cells become spaces.
function buildTable(results) {
  const header =
    "| id | message | expected | outcome | score | sentence |\n" +
    "| --- | --- | --- | --- | --- | --- |";

  const lines = results.map(({ row, run, grade }) => {
    const outcome = "status " + run.fields.status + "; reply: " + run.finalText;
    return (
      "| " +
      [
        cell(row.id),
        cell(row.message),
        cell(row.expected),
        cell(outcome),
        cell(grade.score),
        cell(grade.sentence),
      ].join(" | ") +
      " |"
    );
  });

  return [header, ...lines].join("\n");
}

// Make a value safe for one table cell: line breaks to spaces, escape pipes.
function cell(value) {
  return String(value == null ? "" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

// File-name-safe local timestamp: YYYY-MM-DD-HHMMSS.
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

main().catch((err) => {
  console.error("Eval failed:", err.message);
  process.exit(1);
});
