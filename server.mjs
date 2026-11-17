
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import next from "next";

const hostname = "0.0.0.0";
const port = Number(process.env.PORT) || 3000;
const dev = false;

const certificatesDirectory = join(process.cwd(), "certificates");

//balay janice
const httpsOptions = {
  key: readFileSync(join(certificatesDirectory, "pollify-key.pem")),
  cert: readFileSync(join(certificatesDirectory, "pollify-cert.pem")),
};


//skwelahan - janice (nb 2 -3 ip address: 192.168.1.204)
/*
const httpsOptions = {
  key: readFileSync(join(certificatesDirectory, "pollifyschool-key.pem")),
  cert: readFileSync(join(certificatesDirectory, "pollifyschool-cert.pem")),
};
*/

//duty sa brgy - janice (brgyhall ip address: 192.168.100.98)
/*
const httpsOptions = {
  key: readFileSync(join(certificatesDirectory, "pollifybrgy-key.pem")),
  cert: readFileSync(join(certificatesDirectory, "pollifybrgy-cert.pem")),
};
*/

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
