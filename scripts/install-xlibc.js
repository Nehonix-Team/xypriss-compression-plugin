const fs = require("fs");
const path = require("path");
const https = require("https");

const repo = "Nehonix-Team/xypriss-compression";
const osName = process.platform;
const archName = process.arch;
const ext = osName === "win32" ? ".exe" : "";
const binName = `xlibc-${osName}-${archName}${ext}`;

const distDir = path.resolve(__dirname, "../bin");
const outPath = path.join(distDir, binName);

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function getLatestRelease() {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://api.github.com/repos/${repo}/releases/latest`,
        {
          headers: { "User-Agent": "xypriss-installer" },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              reject(
                new Error(`Failed to fetch release: ${res.statusCode} ${data}`),
              );
            }
          });
        },
      )
      .on("error", reject);
  });
}

function downloadBinary(url, dest) {
  return new Promise((resolve, reject) => {
    // Ensure parent directory exists
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "xypriss-installer",
          Accept: "application/octet-stream",
        },
      },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
          downloadBinary(res.headers.location, dest)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: ${res.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);

        file.on("finish", () => {
          file.close((err) => {
            if (err) return reject(err);
            if (osName !== "win32") {
              try {
                fs.chmodSync(dest, 0o755);
              } catch (chmodErr) {
                return reject(chmodErr);
              }
            }
            resolve();
          });
        });

        file.on("error", (err) => {
          fs.unlink(dest, () => reject(err));
        });
      },
    );

    request.on("error", reject);
  });
}

async function install() {
  //   console.log(`Installing ${binName} from GitHub Releases...`);
  try {
    const release = await getLatestRelease();
    const asset =
      release.assets && release.assets.find((a) => a.name === binName);
    if (asset) {
      //   console.log(
      //     `Downloading from GitHub Releases: ${asset.browser_download_url}`,
      //   );
      await downloadBinary(asset.browser_download_url, outPath);
      console.log(binName + " download successful!");
      return;
    }
    console.log(`Binary ${binName} not found in latest release.`);
  } catch (e) {
    console.warn(`Could not fetch GitHub Release: ${e.message}`);
  } finally {
    process.exit(0);
  }
}

install();
