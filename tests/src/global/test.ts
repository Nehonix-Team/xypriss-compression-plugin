import http from "http";
import compression from "xypriss-compression";

const compressor = compression({ threshold: 0 });

const server = http.createServer((req, res) => {
  compressor(req, res, () => {
    res.setHeader("Content-Type", "text/plain");
    const payload = "hello world! ".repeat(500);
    res.write(payload);
    res.end();
  });
});

server.listen(3000, () => {
  console.log(
    "Test Server running. Make a request using curl with Accept-Encoding: gzip",
  );

  // Self-request to test
  const req = http.request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/",
      method: "GET",
      headers: { "Accept-Encoding": "gzip" },
    },
    (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers: ${JSON.stringify(res.headers)}`);

      let chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        console.log(`Compressed Size: ${buf.length} bytes`);
        console.log(
          `Original Size: ${Buffer.from("hello world! ".repeat(500)).length} bytes`,
        );
        process.exit(0);
      });
    },
  );

  req.end();
});
