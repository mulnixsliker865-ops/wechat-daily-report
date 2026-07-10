const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const dataDir = path.join(root, "data");
const statePath = path.join(dataDir, "state.json");
const port = Number(process.env.PORT || 8778);

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(statePath)) {
  fs.writeFileSync(statePath, JSON.stringify({ days: {} }, null, 2));
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, payload, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/state" && req.method === "GET") {
    send(res, 200, fs.readFileSync(statePath, "utf8"));
    return;
  }

  if (url.pathname === "/api/state" && req.method === "POST") {
    try {
      const next = JSON.parse(await readBody(req));
      if (!next || typeof next !== "object" || !next.days || typeof next.days !== "object") {
        send(res, 400, JSON.stringify({ ok: false, error: "invalid state shape" }));
        return;
      }
      fs.writeFileSync(statePath, JSON.stringify(next, null, 2), "utf8");
      send(res, 200, JSON.stringify({ ok: true }));
    } catch (error) {
      send(res, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, content, types[path.extname(filePath)] || "application/octet-stream");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Daily report app: http://127.0.0.1:${port}/`);
});
