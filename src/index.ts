/**
 * XyPriss Compression Middleware
 *
 * Compression middleware with STRICT algorithm enforcement.
 * Based on expressjs/compression but with full control over which algorithms can be used.
 *
 * @author Nehonix Team
 * @license MIT
 */

import { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import * as path from "path";
import bytes from "bytes";
import compressible from "compressible";
import { createLogger } from "./logger";
import vary from "xypriss-vary";
import onHeaders from "xypriss-on-headers";

const debug = createLogger("xypriss:compression");

export type CompressionAlgorithm = "gzip" | "deflate" | "br";

export interface CompressionOptions {
  algorithms?: CompressionAlgorithm[];
  level?: number;
  threshold?: number | string;
  filter?: (req: IncomingMessage, res: ServerResponse) => boolean;
  brotli?: Record<string, any>;
  gzip?: Record<string, any>;
  deflate?: Record<string, any>;
}

const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/;

export function compression(options: CompressionOptions = {}) {
  const algorithms = options.algorithms || ["gzip", "deflate"];
  const level = options.level ?? 6;
  let thresholdOpt = options.threshold ?? 1024;

  if (typeof thresholdOpt === "string") {
    const parsed = bytes.parse(thresholdOpt);
    thresholdOpt = parsed === null ? 1024 : parsed;
  }
  const threshold = thresholdOpt as number;

  const filter =
    options.filter ||
    function defaultFilter(req: IncomingMessage, res: ServerResponse) {
      const type = res.getHeader("Content-Type");
      if (!type) return false;
      return (
        compressible(String(Array.isArray(type) ? type[0] : type)) ?? false
      );
    };

  return function compressionMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    let ended = false;
    let length = 0;
    const _write = res.write.bind(res);
    const _end = res.end.bind(res);
    const _on = res.on.bind(res);

    let cp: ReturnType<typeof spawn> | null = null;

    (res as any).flush = function flush() {};

    res.write = function write(chunk: any, encoding?: any, cb?: any): boolean {
      if (ended) return false;

      if (!res.headersSent) {
        res.writeHead(res.statusCode);
      }

      return cp && cp.stdin
        ? cp.stdin.write(chunk, encoding, cb)
        : _write(chunk, encoding, cb);
    } as any;

    res.end = function end(chunk?: any, encoding?: any, cb?: any): any {
      if (ended) return false;

      if (!res.headersSent) {
        if (!res.getHeader("Content-Length")) {
          length = Buffer.isBuffer(chunk)
            ? chunk.length
            : Buffer.byteLength(
                chunk || "",
                encoding === "string" ? encoding : "utf8",
              );
        }
        res.writeHead(res.statusCode);
      }

      if (!cp || !cp.stdin) return _end(chunk, encoding, cb);

      ended = true;
      if (chunk) cp.stdin.write(chunk, encoding);
      return cp.stdin.end(cb) as any;
    } as any;

    res.on = function on(
      type: string,
      listener: (...args: any[]) => void,
    ): any {
      if (cp && cp.stdout && type === "drain")
        return cp.stdout.on(type, listener);
      return _on(type, listener);
    } as any;

    onHeaders(res, function onResponseHeaders() {
      if (!filter(req, res)) {
        debug("no compression: filtered");
        return;
      }

      const cacheControl = res.getHeader("Cache-Control");
      if (
        cacheControl &&
        cacheControlNoTransformRegExp.test(
          String(Array.isArray(cacheControl) ? cacheControl[0] : cacheControl),
        )
      ) {
        debug("no compression: no transform");
        return;
      }

      vary(res, "Accept-Encoding");

      const contentLength = Number(res.getHeader("Content-Length")) || length;
      if (contentLength < threshold) {
        debug("no compression: size below threshold");
        return;
      }

      if (
        res.getHeader("Content-Encoding") &&
        res.getHeader("Content-Encoding") !== "identity"
      ) {
        debug("no compression: already encoded");
        return;
      }

      if (req.method === "HEAD") {
        debug("no compression: HEAD request");
        return;
      }

      const accept = String(req.headers["accept-encoding"] || "").toLowerCase();
      let method: CompressionAlgorithm | null = null;

      // Extract client preferences with q-factors
      const clientPrefs = accept
        .split(",")
        .map((part) => {
          const [name, ...params] = part.trim().split(";");
          let q = 1.0;
          for (const param of params) {
            const [key, value] = param.trim().split("=");
            if (key === "q" && value) q = parseFloat(value);
          }
          return { method: name.trim(), q: isNaN(q) ? 1.0 : q };
        })
        .filter((p) => p.q > 0);

      if (clientPrefs.length > 0) {
        // Group by quality factor to handle tie-breaking correctly
        const groups: Record<number, string[]> = {};
        for (const p of clientPrefs) {
          if (!groups[p.q]) groups[p.q] = [];
          groups[p.q].push(p.method);
        }

        const sortedQs = Object.keys(groups)
          .map(Number)
          .sort((a, b) => b - a);

        for (const qValue of sortedQs) {
          const methodsForQ = groups[qValue];

          // If wildcard is present at this quality level, pick the absolute best server algorithm
          if (methodsForQ.includes("*")) {
            if (algorithms.length > 0) {
              method = algorithms[0];
              break;
            }
          }

          // Otherwise, pick the best server algorithm available at this quality level
          const found = algorithms.find((a) => methodsForQ.includes(a));
          if (found) {
            method = found;
            break;
          }
        }
      }

      if (!method) {
        debug("no compression: no acceptable encoding");
        return;
      }

      debug("%s compression", method);

      const ext = process.platform === "win32" ? ".exe" : "";
      const binName = `xlibc-${process.platform}-${process.arch}${ext}`;
      const cliPath = path.join(__dirname, "..", "bin", binName);
      const args = ["-algo", method];
      if (level !== undefined) {
        args.push("-level", String(level));
      }

      cp = spawn(cliPath, args, { stdio: ["pipe", "pipe", "inherit"] });

      cp.on("error", (err) => debug("compression stream error %v", err));

      res.setHeader("Content-Encoding", method);
      res.removeHeader("Content-Length");

      if (cp.stdout) {
        cp.stdout.on("data", (chunk: Buffer) => {
          if (_write(chunk) === false && cp && cp.stdout) cp.stdout.pause();
        });
        cp.stdout.on("end", () => _end());
      }

      _on("drain", () => {
        if (cp && cp.stdout) cp.stdout.resume();
      });
    });

    next();
  };
}

export default compression;
