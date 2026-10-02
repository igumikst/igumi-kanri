import http from "http";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const handler = require("../api/cybozu-calendar.js");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:3001");
  if (!url.pathname.startsWith("/api/cybozu-calendar")) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const fakeReq = {
    method: req.method,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
  };
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(obj) {
      res.writeHead(this.statusCode, {
        "Content-Type": "application/json",
        ...this.headers,
      });
      res.end(JSON.stringify(obj));
      return this;
    },
    end() {
      res.writeHead(this.statusCode, this.headers);
      res.end();
      return this;
    },
  };
  Promise.resolve(handler(fakeReq, fakeRes)).catch((err) => {
    console.error(err);
    res.writeHead(500);
    res.end(JSON.stringify({ events: [], error: "server error" }));
  });
});

server.listen(3001, () => console.log("local cybozu API on :3001"));
