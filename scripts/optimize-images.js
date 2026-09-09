const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const html = fs.readdirSync(root).filter(file => file.endsWith('.html')).map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const sources = [...html.matchAll(/\bsrc="([^"]+\.png(?:\.png)?)"/gi)].map(match => match[1]);

(async () => {
  for (const source of [...new Set(sources)]) {
    const input = path.join(root, source);
    if (!fs.existsSync(input) || fs.statSync(input).size < 300_000) continue;
    const output = input.replace(/\.png(?:\.png)?$/i, '.webp');
    if (fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(input).mtimeMs) continue;
    await sharp(input).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(output);
    console.log(`${source} -> ${path.relative(root, output).replaceAll('\\', '/')} (${Math.round(fs.statSync(input).size / 1024)} KB -> ${Math.round(fs.statSync(output).size / 1024)} KB)`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
