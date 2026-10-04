import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = new URL("./local-feature-screens/", import.meta.url);
const outPath = fileURLToPath(outDir);
const baseUrl = "http://127.0.0.1:5174";
const apiUrl = "https://schoolment.com/school-erp";
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = join(process.cwd(), ".chrome-video-capture-profile");
const pages = [
  ["01-dashboard", "/"],
  ["02-admissions", "/admissions"],
  ["03-attendance", "/attendance"],
  ["04-fees", "/fees"],
  ["05-exams", "/exams"],
  ["06-lms", "/lms"],
  ["07-communications", "/communications"],
  ["08-transport", "/transport"],
  ["09-library", "/library"],
  ["10-security-roles", "/roles"],
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  return {
    async send(method, params = {}) {
      const messageId = ++id;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      const response = await new Promise((resolve) => pending.set(messageId, resolve));
      if (response.error) throw new Error(`${method}: ${response.error.message}`);
      return response.result;
    },
    close() { socket.close(); },
  };
}

async function main() {
  await mkdir(outPath, { recursive: true });
  const login = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_code: "default", email: "admin@school.com", password: process.env.SCHOOLMENT_DEMO_PASSWORD }),
  });
  if (!login.ok) throw new Error(`Live demo login failed (${login.status})`);
  const auth = await login.json();

  const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=9222", `--user-data-dir=${profile}`, "--window-size=1440,1100", "about:blank"], { stdio: "ignore", windowsHide: true });
  try {
    let version;
    for (let i = 0; i < 20; i += 1) {
      try { version = await (await fetch("http://127.0.0.1:9222/json/version")).json(); break; } catch { await wait(250); }
    }
    if (!version) throw new Error("Chrome debugging endpoint did not start");
    const target = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, { method: "PUT" })).json();
    const tab = await cdp(target.webSocketDebuggerUrl);
    await tab.send("Page.enable");
    await tab.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await wait(1000);
    const storage = `localStorage.setItem('school_erp_token', ${JSON.stringify(auth.access_token)}); localStorage.setItem('school_erp_user', ${JSON.stringify(JSON.stringify(auth.user))}); localStorage.setItem('school_erp_account_code', ${JSON.stringify(auth.user.account.account_code)});`;
    await tab.send("Runtime.evaluate", { expression: storage });
    for (const [name, path] of pages) {
      await tab.send("Page.navigate", { url: `${baseUrl}${path}` });
      await wait(1800);
      const shot = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(outPath, `${name}.png`), Buffer.from(shot.data, "base64"));
      console.log(`${name}.png`);
    }
    tab.close();
  } finally {
    child.kill();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
