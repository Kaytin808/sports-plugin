const sharp = require('sharp');
const { TimedCache } = require('./cache');

const rasterCache = new TimedCache(24 * 60 * 60 * 1000);

async function svgToPng(svg, cacheKey, width, height) {
  const cached = rasterCache.get(cacheKey);
  if (cached) return cached;
  const png = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toBuffer();
  return rasterCache.set(cacheKey, png);
}

module.exports = { svgToPng };
