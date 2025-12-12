// Added: Content-based file validation (magic number checks)
// Why: README requires validating file types by content, not just extension/MIME.

const fs = require('fs');

const SIGNATURES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

function hasSignature(buffer, sig) {
  if (!sig || buffer.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buffer[i] !== sig[i]) return false;
  }
  return true;
}

module.exports.validateByContent = function validateByContent(filePath, mimetype) {
  try {
    const buffer = fs.readFileSync(filePath);
    const sig = SIGNATURES[mimetype];
    if (!sig) {
      // For types we don't have signatures for, accept by size > 0
      return buffer.length > 0;
    }
    return hasSignature(buffer, sig);
  } catch (e) {
    return false;
  }
};
