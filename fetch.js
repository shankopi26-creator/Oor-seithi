// Runs on GitHub Actions every hour. Needs Node 20. No packages.
const fs = require("fs");

// Edit this list. Wrong URLs are skipped; check the Actions log to see which failed.
const FEEDS = [
  { name: "Virakesari", url: "https://www.virakesari.lk/rss" },
  { name: "Uthayan", url: "https://newuthayan.com/feed/" },
  { name: "Newsfirst", url: "https://www.newsfirst.lk/feed" },
  { name: "The Island", url: "https://island.lk/feed" },
  { name: "Nation.lk", url: "https://nation.lk/online/rss.xml" },
];

const CATS = [
  ["school", /விடுமுறை|பாடசாலை|பாடசாலைகள்|school|holiday|closed|exam|பரீட்சை/i],
  ["fuel", /எரிபொருள்|பெட்ரோல்|டீசல்|fuel|petrol|diesel/i],
  ["weather", /வானிலை|மழை|புயல்|வெள்ளம்|weather|rain|flood|cyclone/i],
  ["gov", /அரசு|அமைச்சு|அறிவிப்பு|gazette|ministry|government/i],
];

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
   .replace(/<[^>]+>/g, " ")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
   .replace(/\s+/g, " ").trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};

function parse(xml, source) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 15).map((b) => {
    let link = decode(tag(b, "link"));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const title = decode(tag(b, "title"));
    const summary = decode(tag(b, "description") || tag(b, "summary")).slice(0, 200);
    const date = new Date(decode(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated")) || Date.now());
    const text = title + " " + summary;
    const cat = (CATS.find(([, re]) => re.test(text)) || ["other"])[0];
    return { title, summary, link, source, cat, urgent: cat === "school", date: isNaN(date) ? new Date().toISOString() : date.toISOString() };
  }).filter((x) => x.title && x.link);
}

(async () => {
  let items = [];
  for (const f of FEEDS) {
    try {
      const r = await fetch(f.url, { headers: { "User-Agent": "OorSeithi/1.0 (community news reader)" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const got = parse(await r.text(), f.name);
      console.log("OK  ", f.name, got.length);
      items = items.concat(got);
    } catch (e) {
      console.log("FAIL", f.name, f.url, e.message);
    }
  }
  const seen = new Set();
  items = items.filter((i) => !seen.has(i.link) && seen.add(i.link));
  items.sort((a, b) => (b.urgent - a.urgent) || (new Date(b.date) - new Date(a.date)));
  fs.writeFileSync("news.json", JSON.stringify({ updated: new Date().toISOString(), items: items.slice(0, 80) }, null, 1));
  console.log("Saved", items.length);
})();
