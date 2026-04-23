const fs = require("fs");
const path = require("path");
const https = require("https");

const repo = "Nehonix-Team/xypriss-compression-plugin";
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
    const file = fs.createWriteStream(dest);
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "xypriss-installer",
            Accept: "application/octet-stream",
          },
        },
        (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            downloadBinary(res.headers.location, dest)
              .then(resolve)
              .catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download: ${res.statusCode}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            if (osName !== "win32") {
              fs.chmodSync(dest, 0o755);
            }
            resolve();
          });
        },
      )
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
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
