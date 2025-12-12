// Added: Thumbnail generation using sharp
// Why: README specifies thumbnail generation for images.

const sharp = require('sharp');
const path = require('path');

module.exports.generateThumbnail = async function generateThumbnail(filePath) {
  const ext = path.extname(filePath);
  const thumbPath = filePath.replace(ext, `.thumb${ext}`);
  await sharp(filePath)
    .resize(200, 200, { fit: 'inside' })
    .toFile(thumbPath);
  return thumbPath;
};
