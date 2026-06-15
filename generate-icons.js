// Run with: node generate-icons.js
// Requires: npm install canvas (or: npx --yes @resvg/resvg-js)
// Generates icons/icon-192.png and icons/icon-512.png from icons/icon.svg

const fs = require('fs');
const path = require('path');

const svgSrc = fs.readFileSync(path.join(__dirname, 'icons', 'icon.svg'), 'utf8');

async function generate() {
  try {
    const { Resvg } = require('@resvg/resvg-js');

    for (const size of [192, 512]) {
      const resvg = new Resvg(svgSrc, {
        fitTo: { mode: 'width', value: size },
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();
      const out = path.join(__dirname, 'icons', `icon-${size}.png`);
      fs.writeFileSync(out, pngBuffer);
      console.log(`Generated ${out} (${pngBuffer.length} bytes)`);
    }
  } catch (err) {
    console.error('Install @resvg/resvg-js first:  npm install @resvg/resvg-js');
    process.exit(1);
  }
}

generate();
