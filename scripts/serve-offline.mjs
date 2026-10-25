#!/usr/bin/env node
/**
 * 零依赖静态服务器：托管 dist/ 构建产物，供完全离线（无外网）演示使用。
 *
 * 用法：
 *   node scripts/serve-offline.mjs [--root dist] [--port 4173] [--host 127.0.0.1] [--no-open]
 *
 * 说明：
 *   - 页面必须从 HTTP 服务根路径访问（/data、/offline-basemap 是根相对路径）。
 *   - 端口被占用时会自动向后顺延，最多尝试 10 个。
 *   - 服务就绪后自动打开系统默认浏览器（--no-open 可关闭）。
 */

import {createServer} from "node:http";
import {stat, createReadStream} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".mvt": "application/vnd.mapbox-vector-tile",
  ".pbf": "application/x-protobuf",
  ".pmtiles": "application/vnd.pmtiles",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const args = process.argv.slice(2);
function readArg(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const hasFlag = (name) => args.includes(name);

const ROOT = path.resolve(PROJECT_ROOT, readArg("--root", "dist"));
const PREFERRED_PORT = Number(readArg("--port", "4173"));
const HOST = readArg("--host", "127.0.0.1");
const OPEN_BROWSER = !hasFlag("--no-open");

function send(res, status, headers = {}, body = "") {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(req, res, filePath, isHashedAsset) {
  stat(filePath, (err, info) => {
    if (err || !info.isFile()) {
      send(res, 404, {"Content-Type": "text/plain; charset=utf-8"}, "404 Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // 弱 ETag：mtime + size，足以检测离线机上文件的替换
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    if (req.headers["if-none-match"] === etag) {
      send(res, 304, {ETag: etag});
      return;
    }
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": info.size,
      ETag: etag,
      // 带内容哈希的构建产物可长缓存；入口页、catalog、数据必须每次再验证，
      // 避免浏览器拿旧 catalog 指向已被重新生成的 runId 目录
      "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache"
    };
    if (req.method === "HEAD") {
      send(res, 200, headers);
      return;
    }
    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  });
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^(?:\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, {"Content-Type": "text/plain; charset=utf-8"}, "403 Forbidden");
    return;
  }

  stat(filePath, (err, info) => {
    if (!err && info.isDirectory()) {
      serveFile(req, res, path.join(filePath, "index.html"), false);
    } else if (!err && info.isFile()) {
      serveFile(req, res, filePath, filePath.includes(`${path.sep}assets${path.sep}`));
    } else {
      // SPA 回退：无扩展名的路径回落到 index.html
      if (!path.extname(safePath)) {
        serveFile(req, res, path.join(ROOT, "index.html"), false);
      } else {
        send(res, 404, {"Content-Type": "text/plain; charset=utf-8"}, "404 Not Found");
      }
    }
  });
});

function openBrowser(url) {
  import("node:child_process").then(({exec}) => {
    switch (process.platform) {
      case "win32":
        exec(`start "" "${url}"`, {windowsVerbatimArguments: true});
        break;
      case "darwin":
        exec(`open "${url}"`);
        break;
      default:
        exec(`xdg-open "${url}"`);
    }
  });
}

let attempts = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && attempts < 10) {
    attempts += 1;
    server.listen({host: HOST, port: PREFERRED_PORT + attempts});
    return;
  }
  console.error(`[错误] 服务启动失败: ${err.message}`);
  process.exit(1);
});

server.listen({host: HOST, port: PREFERRED_PORT}, () => {
  const port = server.address().port;
  const url = `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${port}`;
  console.log("──────────────────────────────────────────────────────");
  console.log("  WRJ 侦察规划三维演示 — 离线模式");
  console.log(`  静态目录 : ${ROOT}`);
  console.log(`  访问地址 : ${url}`);
  console.log("  关闭服务 : 在本窗口按 Ctrl+C，或直接关闭本窗口");
  console.log("──────────────────────────────────────────────────────");
  if (OPEN_BROWSER) openBrowser(url);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => process.exit(0));
}
