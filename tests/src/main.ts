import http from "http";
import compression from "../../src/index";

const compressFilter = compression({
  algorithms: ["br", "gzip", "deflate"],
  level: 6, 
  threshold: 1024,
});

const server = http.createServer((req, res) => {
  compressFilter(req, res, () => {
    res.setHeader("Content-Type", "application/json");
    res.write(
      JSON.stringify({ status: "operational", parameters: "acknowledged" }),
    );
    res.end();
  });
});

server.listen(3000);
