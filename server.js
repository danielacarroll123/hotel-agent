// Hotel Estrella: tiny Node server. Serves the guest page and answers
// POST /api/message with one plain-text reply from the model.

import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleGuestMessage } from "./server/agent.js";

const PORT = 3000;
const PUBLIC_DIR = fileURLToPath(new URL("./public", import.meta.url));
const REQUESTS_PATH = fileURLToPath(
  new URL("./data/requests.json", import.meta.url),
);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/message") {
    await handleMessage(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/requests") {
    await handleRequests(req, res);
    return;
  }

  if (req.method === "GET") {
    // Serve the staff page at /staff.
    if (req.url === "/staff") req.url = "/staff.html";
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

// Read the three fields, make one model call, return its plain text.
async function handleMessage(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid request body" });
    return;
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const message = (body.message || "").trim();

  if (!name || !email || !message) {
    sendJson(res, 400, { error: "Name, email and message are all required." });
    return;
  }

  try {
    const result = await handleGuestMessage({ name, email, message });
    sendJson(res, 200, { reply: result.finalText });
  } catch (err) {
    console.error("Model call failed:", err.message);
    sendJson(res, 502, { error: "The assistant is not available right now." });
  }
}

// Return the logged requests, newest first.
async function handleRequests(req, res) {
  let rows = [];
  try {
    rows = JSON.parse(await readFile(REQUESTS_PATH, "utf8"));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  rows.reverse();
  sendJson(res, 200, rows);
}

// Serve files from public/. Defaults to index.html.
async function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

server.listen(PORT, () => {
  console.log("Hotel Estrella running on http://localhost:" + PORT);
});
