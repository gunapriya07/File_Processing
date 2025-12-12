// Added: Simple virus scan stub to simulate malware detection before saving files
// Why: README requires virus scanning integration to prevent malicious uploads.

module.exports.scanFile = async function scanFile(filePath) {
  return new Promise((resolve, reject) => {
    // NOTE: In production integrate with ClamAV or a cloud AV service.
    // Here we simulate a tiny probability of detection to exercise error paths.
    const simulatedDetection = Math.random() < 0.01; // 1% chance
    setTimeout(() => {
      if (simulatedDetection) {
        reject(new Error('Malware detected in uploaded file'));
      } else {
        resolve({ clean: true });
      }
    }, 200);
  });
};
