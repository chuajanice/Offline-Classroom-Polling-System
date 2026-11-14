
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import next from "next";

const hostname = "0.0.0.0";
const port = Number(process.env.PORT) || 3000;
const dev = false;

const certificatesDirectory = join(process.cwd(), "certificates");

const httpsOptions = {
  key: readFileSync(join(certificatesDirectory, "pollify-key.pem")),
  cert: readFileSync(join(certificatesDirectory, "pollify-cert.pem")),
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startServer() {
  await app.prepare();

  createServer(httpsOptions, (req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`Pollify HTTPS server running at:`);
    console.log(`  Local: https://localhost:${port}`);
    console.log(`  LAN:   https://192.168.254.115:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Pollify HTTPS server:", error);
  process.exit(1);
});
