const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads');

// Mock file database reference (would be shared from upload.js in production)
let uploadedFiles = [];

// Initialize with module to share data
function setUploadedFiles(files) {
  uploadedFiles = files;
}

function getCurrentUser(req) {
  const authHeader = req.get('authorization');
  let currentUser = null;
  
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      currentUser = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      throw new Error('Authentication failed');
    }
  }
  return currentUser;
}

// Download file by filename
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename format (prevent directory traversal)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Authenticate user
    let currentUser = null;
    try {
      currentUser = getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const filePath = path.join(UPLOAD_DIR, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify real file path is within upload directory (prevent directory traversal)
    const realPath = fs.realpathSync(filePath);
    const realUploadDir = fs.realpathSync(UPLOAD_DIR);
    
    if (!realPath.startsWith(realUploadDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Get file info to check access
    const fileInfo = uploadedFiles.find(f => f.filename === filename);
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'File record not found' });
    }

    // Check access permissions
    const canAccess = 
      fileInfo.publicAccess || 
      fileInfo.uploadedBy === currentUser.userId || 
      currentUser.role === 'admin';

    if (!canAccess) {
      console.log(`Unauthorized download attempt by ${currentUser.userId} for file ${filename}`);
      return res.status(403).json({ error: 'Access denied to this file' });
    }

    // Log download access (for audit trail)
    console.log(`File downloaded: ${filename} by ${currentUser.userId}`);

    // Send file
    const stat = fs.statSync(filePath);
    res.set({
      'Content-Type': fileInfo.mimetype || 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${fileInfo.originalName}"`,
      'Cache-Control': 'no-cache'
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('File stream error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    });

  } catch (error) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'File download failed' });
    }
  }
});

// Download thumbnail
router.get('/thumb/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Authenticate
    let currentUser = null;
    try {
      currentUser = getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Thumbnail filename (replace extension with .thumb.ext)
    const ext = path.extname(filename);
    const thumbFilename = filename.replace(ext, `.thumb${ext}`);
    const thumbPath = path.join(UPLOAD_DIR, thumbFilename);

    if (!fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // Verify real path
    const realPath = fs.realpathSync(thumbPath);
    const realUploadDir = fs.realpathSync(UPLOAD_DIR);
    
    if (!realPath.startsWith(realUploadDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Check file access
    const fileInfo = uploadedFiles.find(f => f.filename === filename);
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'File record not found' });
    }

    const canAccess = 
      fileInfo.publicAccess || 
      fileInfo.uploadedBy === currentUser.userId || 
      currentUser.role === 'admin';

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Send thumbnail
    const stat = fs.statSync(thumbPath);
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=3600'
    });

    const fileStream = fs.createReadStream(thumbPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Thumbnail stream error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download thumbnail' });
      }
    });

  } catch (error) {
    console.error('Thumbnail download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Thumbnail download failed' });
    }
  }
});

module.exports = router;
module.exports.setUploadedFiles = setUploadedFiles;
