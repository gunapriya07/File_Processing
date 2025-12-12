// File encryption utilities

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';

// Generate random IV
function generateIV() {
  return crypto.randomBytes(16);
}

// Derive key from password
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

// Encrypt file on disk
function encryptFile(inputPath, outputPath, password) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(inputPath)) {
        return reject(new Error('Input file not found'));
      }

      // Generate random salt and IV
      const salt = crypto.randomBytes(16);
      const iv = generateIV();
      const key = deriveKey(password, salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Create streams
      const inputStream = fs.createReadStream(inputPath);
      const outputStream = fs.createWriteStream(outputPath);

      // Write salt and IV to output file first
      outputStream.write(salt);
      outputStream.write(iv);

      // Pipe input through cipher to output
      inputStream
        .pipe(cipher)
        .pipe(outputStream)
        .on('finish', () => {
          console.log(`File encrypted: ${inputPath} -> ${outputPath}`);
          resolve({
            success: true,
            encryptedPath: outputPath,
            salt: salt.toString(ENCODING),
            iv: iv.toString(ENCODING)
          });
        })
        .on('error', (error) => {
          console.error('Encryption error:', error.message);
          // Clean up output file on error
          try {
            fs.unlinkSync(outputPath);
          } catch {}
          reject(error);
        });

      inputStream.on('error', (error) => {
        console.error('Input stream error:', error.message);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Decrypt file on disk
function decryptFile(inputPath, outputPath, password) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(inputPath)) {
        return reject(new Error('Encrypted file not found'));
      }

      // Read file header
      const fd = fs.openSync(inputPath, 'r');
      const saltBuffer = Buffer.alloc(16);
      const ivBuffer = Buffer.alloc(16);
      
      fs.readSync(fd, saltBuffer, 0, 16, 0);
      fs.readSync(fd, ivBuffer, 0, 16, 16);
      fs.closeSync(fd);

      const key = deriveKey(password, saltBuffer);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);

      // Create streams (skip salt and IV bytes)
      const inputStream = fs.createReadStream(inputPath, {
        start: 32 // Skip 16 bytes salt + 16 bytes IV
      });
      const outputStream = fs.createWriteStream(outputPath);

      inputStream
        .pipe(decipher)
        .pipe(outputStream)
        .on('finish', () => {
          console.log(`File decrypted: ${inputPath} -> ${outputPath}`);
          resolve({
            success: true,
            decryptedPath: outputPath
          });
        })
        .on('error', (error) => {
          console.error('Decryption error:', error.message);
          try {
            fs.unlinkSync(outputPath);
          } catch {}
          reject(error);
        });

      inputStream.on('error', (error) => {
        console.error('Input stream error:', error.message);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Encrypt file content in memory
function encryptBuffer(buffer, password) {
  try {
    const salt = crypto.randomBytes(16);
    const iv = generateIV();
    const key = deriveKey(password, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(buffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Combine salt + IV + encrypted data
    const result = Buffer.concat([salt, iv, encrypted]);

    return {
      success: true,
      encrypted: result.toString(ENCODING),
      salt: salt.toString(ENCODING),
      iv: iv.toString(ENCODING)
    };
  } catch (error) {
    console.error('Buffer encryption error:', error.message);
    throw error;
  }
}

// Decrypt buffer
function decryptBuffer(encryptedHex, password) {
  try {
    const encryptedBuffer = Buffer.from(encryptedHex, ENCODING);

    // Extract salt, IV, and encrypted data
    const salt = encryptedBuffer.slice(0, 16);
    const iv = encryptedBuffer.slice(16, 32);
    const encrypted = encryptedBuffer.slice(32);

    const key = deriveKey(password, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return {
      success: true,
      decrypted: decrypted.toString('utf8')
    };
  } catch (error) {
    console.error('Buffer decryption error:', error.message);
    throw error;
  }
}

// Hash password for storage
function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password)
    .digest(ENCODING);
}

// Verify password
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

module.exports = {
  encryptFile,
  decryptFile,
  encryptBuffer,
  decryptBuffer,
  hashPassword,
  verifyPassword,
  generateIV,
  deriveKey
};
