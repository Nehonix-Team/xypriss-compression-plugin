import http from "http";
import compression from "xypriss-compression";

const compressFilter = compression({
  algorithms: ["br", "gzip", "deflate"],
  level: 6,
  threshold: 1024,
});

const server = http.createServer((req, res) => {
  compressFilter(req, res, () => {
    res.setHeader("Content-Type", "application/json");
    const data = JSON.stringify({
      status: "operational",
      content: "A".repeat(2048), // Buffer it to 2KB to trigger compression
    });
    res.end(data);
  });
});

server.listen(4591, () => {
  console.log("Test Server running on http://localhost:4591");
  console.log("Try: curl -i -H 'Accept-Encoding: br' http://localhost:4591");
});
