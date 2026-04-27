import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const webAuth = path.join(root, "webfrontend", "htmlauth");
const configPath = path.join(root, "config", "abfall.json");
const dataPath = path.join(root, "data", "abfall_data.json");
const pluginCfgPath = path.join(root, "plugin.cfg");
const mockMode = process.argv.includes("--mock");
const port = Number.parseInt(process.env.UI_DEV_PORT ?? "8080", 10);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".php": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function readConfig() {
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
}

function mockStatus() {
  const cached = fs.existsSync(dataPath)
    ? JSON.parse(fs.readFileSync(dataPath, "utf-8"))
    : {};
  return {
    cookie_status: "not_needed",
    cookie_created: "",
    cookie_expires: "",
    client_id: "(api.abfall.io - no registration)",
    last_fetch: cached.timestamp ?? "",
    location: cached.location ?? "",
    location_api: cached.location ?? "",
    termine_count: Object.keys(cached.termine ?? {}).length,
    cached_data: cached,
    api_mode: "mock-mode",
  };
}

/** Same as ajax.php abfallio_arg_b64_utf8 / Node decodeShellQueryArg (UTF-8 safe on all hosts). */
function argB64Utf8(s) {
  return `b64:${Buffer.from(String(s), "utf8").toString("base64")}`;
}

function runNodeCli(args, expectJson = true) {
  const cli = path.join(root, "bin", "abfall_api.cjs");
  const proc = spawnSync("node", [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });
  const output = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim();
  if (!expectJson) return output;
  try {
    return JSON.parse(output);
  } catch {
    return { error: output || "Invalid CLI response" };
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf-8");
    });
    req.on("end", () => {
      resolve(new URLSearchParams(body));
    });
  });
}

function transformPhpToHtml(file) {
  const pluginFolder = fs.existsSync(pluginCfgPath)
    ? (fs
        .readFileSync(pluginCfgPath, "utf-8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("FOLDER="))
        ?.split("=")[1]
        ?.trim() || "abfallio")
    : "abfallio";
  let content = fs.readFileSync(file, "utf-8");
  content = content.replace(/<\?php[\s\S]*?\?>/g, "");
  content = content.replace(/<\?=.+?\?>/g, pluginFolder);
  return content;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return send(res, 400, "Bad request", "text/plain; charset=utf-8");
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === "/ajax.php") {
    const action = url.searchParams.get("action");
    let payload = null;
    const bodyParams = req.method === "POST" ? await parseBody(req) : null;
    const getParam = (key) => bodyParams?.get(key) ?? url.searchParams.get(key) ?? "";

    if (action === "status") {
      payload = mockMode ? mockStatus() : runNodeCli(["status"]);
    } else if (action === "search_street") {
      payload = mockMode
        ? [{ id: "5916main-street", name: "Main Street" }]
        : runNodeCli(["search_street", argB64Utf8(getParam("q"))]);
    } else if (action === "search_service") {
      payload = mockMode
        ? [{ id: "6efba91e69a5b454ac0ae3497978fe1d", name: "Ludwigshafen am Rhein", title: "Ludwigshafen am Rhein", url: "https://www.ludwigshafen.de/" }]
        : runNodeCli(["search_service", argB64Utf8(getParam("q"))]);
    } else if (action === "refresh_service_map") {
      payload = mockMode
        ? { success: true, count: 2, source_url: "mock" }
        : runNodeCli([...(getParam("url") ? ["refresh_service_map", getParam("url")] : ["refresh_service_map"])]);
    } else if (action === "search_hnr") {
      payload = mockMode
        ? [{ id: "__not_needed__", name: "House number selection not required" }]
        : runNodeCli(["search_hnr", getParam("street_id")]);
    } else if (action === "fetch_now") {
      payload = mockMode ? { success: true, info: "Mock fetch complete" } : runNodeCli(["fetch"]);
    } else if (action === "log") {
      const out = runNodeCli(["log", "200"], false);
      payload = { log: out ?? "" };
    } else if (action === "clear_log") {
      runNodeCli(["clear_log"]);
      payload = { success: true };
    } else if (action === "save_location") {
      const cfg = readConfig();
      cfg.location = cfg.location ?? {};
      cfg.location.f_id_kommune = getParam("kommune_id");
      cfg.location.f_id_strasse = getParam("street_id");
      cfg.location.street_name = getParam("street_name");
      cfg.location.f_id_strasse_hnr = getParam("hnr_id");
      cfg.location.hnr_name = getParam("hnr_name");
      writeConfig(cfg);
      payload = { success: true };
    } else if (action === "save_settings") {
      const cfg = readConfig();
      const sk = getParam("service_key").trim();
      if (sk !== "" && !/^[a-fA-F0-9]{32}$/.test(sk)) {
        payload = { success: false, error: "Invalid service key", code: "service_key" };
      } else {
        cfg.service_key = sk === "" ? "" : sk.toLowerCase();
        if (sk === "") {
          cfg.location = {};
        }
        const fi = Number.parseInt(getParam("fetch_interval_hours"), 10) || 6;
        cfg.fetch_interval_hours = Math.max(6, Math.min(168, fi));
        cfg.fetch_fuzz_minutes = Number.parseInt(getParam("fetch_fuzz_minutes"), 10);
        if (!Number.isFinite(cfg.fetch_fuzz_minutes)) cfg.fetch_fuzz_minutes = 30;
        try {
          cfg.categories_filter = JSON.parse(getParam("categories_filter") || "[]");
        } catch {
          cfg.categories_filter = [];
        }
        cfg.mqtt = cfg.mqtt ?? {};
        cfg.mqtt.enabled = getParam("mqtt_enabled") === "1";
        cfg.mqtt.use_loxberry_broker = getParam("mqtt_use_loxberry_broker") === "1";
        cfg.mqtt.host = getParam("mqtt_host");
        cfg.mqtt.port = Number.parseInt(getParam("mqtt_port"), 10) || 1883;
        cfg.mqtt.user = getParam("mqtt_user");
        cfg.mqtt.password = getParam("mqtt_password");
        cfg.mqtt.topic_prefix = getParam("mqtt_topic_prefix") || "loxberry/abfallio";
        cfg.mqtt.retain = getParam("mqtt_retain") === "1";
        writeConfig(cfg);
        payload = { success: true };
      }
    } else if (action === "reset_location") {
      const cfg = readConfig();
      cfg.location = {};
      writeConfig(cfg);
      payload = { success: true };
    } else if (action === "download_json") {
      if (!fs.existsSync(dataPath)) {
        return send(res, 404, JSON.stringify({ error: "No data file found" }));
      }
      const content = fs.readFileSync(dataPath, "utf-8");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=abfall_data.json",
      });
      res.end(content);
      return;
    } else {
      payload = { error: `Unknown action: ${action ?? ""}` };
    }
    send(res, 200, JSON.stringify(payload));
    return;
  }

  const requested = url.pathname === "/" ? "/index.php" : url.pathname;
  const filePath = path.join(webAuth, requested);
  if (!filePath.startsWith(webAuth) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".php") {
    const html = transformPhpToHtml(filePath);
    send(res, 200, html, "text/html; charset=utf-8");
    return;
  }
  const type = contentTypes[ext] ?? "application/octet-stream";
  send(res, 200, fs.readFileSync(filePath), type);
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`UI dev server running: http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Mode: ${mockMode ? "mock" : "live-cli"}`);
});
