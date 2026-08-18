const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const [name, url] of [
    ["school", "https://tron2020classprofile.github.io/school"],
    ["coop", "https://tron2020classprofile.github.io/co-op"],
    ["lifestyle", "https://tron2020classprofile.github.io/lifestyle"],
  ]) {
    try {
      await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await p.waitForTimeout(2500);
      const height = await p.evaluate(() => document.body.scrollHeight);
      console.log(name, "height:", height, "url:", p.url());
      const shots = 6;
      for (let i = 0; i < shots; i++) {
        await p.evaluate((y) => window.scrollTo(0, y), Math.floor(Math.max(0, height - 950) * (i / (shots - 1))));
        await p.waitForTimeout(800);
        await p.screenshot({ path: `shots/ref-${name}-${i}.png` });
      }
    } catch (e) {
      console.log(name, "ERR", e.message.slice(0, 120));
    }
  }
  await b.close();
})();
