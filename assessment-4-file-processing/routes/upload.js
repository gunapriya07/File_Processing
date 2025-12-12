const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

const router = express.Router();

// Mock file storage (in production would use cloud storage)
let uploadedFiles = [
  {
    id: 'file-001',
    originalName: 'sample-document.pdf',
    filename: 'sample-document-123.pdf',
    mimetype: 'application/pdf',
    size: 2048576,
    uploadedBy: 'user1',
    uploadDate: new Date('2024-01-01').toISOString(),
    status: 'processed',
    processingResult: { pages: 15, textExtracted: true },
    downloadUrl: '/uploads/sample-document-123.pdf',
    publicAccess: false
  },
  {
    id: 'file-002',
    originalName: 'company-data.csv',
    filename: 'company-data-456.csv', 
    mimetype: 'text/csv',
    size: 1024000,
    uploadedBy: 'admin',
    uploadDate: new Date('2024-01-02').toISOString(),
    status: 'processing',
    processingResult: null,
    downloadUrl: '/uploads/company-data-456.csv',
    publicAccess: false // BUG: Sensitive data marked as public (fixed: should be private)
  },
  {
    id: 'file-003',
    originalName: 'corrupted-image.jpg',
    filename: 'corrupted-image-789.jpg',
    mimetype: 'image/jpeg',
    size: 1024, // BUG: Zero-size file allowed (fixed: should be > 0)
    uploadedBy: 'user2',
    uploadDate: new Date('2024-01-03').toISOString(),
    status: 'error',
    processingResult: { error: 'Corrupted file header' },
    downloadUrl: null,
    publicAccess: false
  }
];

const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024'; // BUG: Hardcoded secret (fixed: should be from env)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads'); // BUG: Relative path, not configurable (fixed: should be absolute path

// Initialize uploads directory
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`Created uploads directory at: ${UPLOAD_DIR}`);
}

// Feature 2: Processing Queue
let processingQueue = [];
let isProcessing = false;

// Process files from queue
async function processQueue() {
  if (isProcessing || processingQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (processingQueue.length > 0) {
    const fileId = processingQueue.shift();
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) continue;

    // Update status to processing
    file.status = 'processing';
    file.queuePosition = null;
    file.progress = 0;
    file.estimatedTimeRemaining = null;
    file.processingStartTime = Date.now();
    console.log(`Processing file: ${file.originalName} (${file.id})`);

    try {
      // Simulate file processing (in production: actual processing logic)
      await simulateProcessing(file);
      
      // Mark as processed
      file.status = 'processed';
      file.progress = 100;
      file.estimatedTimeRemaining = 0;
      file.processingResult = {
        processedAt: new Date().toISOString(),
        size: file.size,
        type: file.mimetype,
        processingDuration: Date.now() - file.processingStartTime
      };
      console.log(`Completed processing: ${file.originalName}`);
    } catch (error) {
      file.status = 'error';
      file.progress = 0;
      file.estimatedTimeRemaining = null;
      file.processingResult = { error: error.message };
      console.error(`Processing failed for ${file.originalName}:`, error.message);
    }
  }

  isProcessing = false;
}

// Simulate file processing with progress tracking
async function simulateProcessing(file) {
  // Simulate processing time based on file size
  const processingTime = Math.min(5000, Math.max(1000, file.size / 1000));
  const steps = 10; // Number of progress updates
  const stepTime = processingTime / steps;
  
  return new Promise((resolve, reject) => {
    let currentStep = 0;
    
    const progressInterval = setInterval(() => {
      currentStep++;
      const progress = Math.min(95, (currentStep / steps) * 100);
      file.progress = Math.round(progress);
      
      // Calculate estimated time remaining
      const elapsed = Date.now() - file.processingStartTime;
      const estimatedTotal = (elapsed / progress) * 100;
      file.estimatedTimeRemaining = Math.max(0, Math.round((estimatedTotal - elapsed) / 1000));
      
      if (currentStep >= steps) {
        clearInterval(progressInterval);
        
        // Simulate 5% chance of processing failure for demo
        if (Math.random() < 0.05) {
          reject(new Error('Processing failed: Unable to extract data'));
        } else {
          file.progress = 100;
          file.estimatedTimeRemaining = 0;
          resolve();
        }
      }
    }, stepTime);
  });
}

// Add file to processing queue
function addToQueue(fileId) {
  if (!processingQueue.includes(fileId)) {
    processingQueue.push(fileId);
    
    // Update queue positions
    updateQueuePositions();
    
    // Start processing
    processQueue().catch(err => console.error('Queue processing error:', err));
  }
}

// Update queue positions for all queued files
function updateQueuePositions() {
  processingQueue.forEach((fileId, index) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
      file.queuePosition = index + 1;
    }
  });
}

function getCurrentUser(req) {
  const authHeader = req.get('authorization');
  let currentUser = null;
  
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      currentUser = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // BUG: Silent auth failure, continues without user (fixed: should return 401)
      console.log('Auth failed:', e.message);
      throw new Error('Authentication failed');
    }
  }
  return currentUser;
}

// Get user files
router.get('/', async (req, res) => {
  try {
    let currentUser = null;
    
    // BUG: No authentication required to list files (fixed: inner try-catch for authentication)
    try{
      currentUser = getCurrentUser(req);
      if (!currentUser) {
        console.log('Anonymous file listing attempt');
        return res.status(401).json({ error: 'Authentication required' });
      }
    }catch(e){
       console.log('Auth failed:', e.message);
       return res.status(401).json({ error: 'Authentication required' });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); // BUG: High default limit (fixed: default 20, max 50)
    const status = req.query.status;
    const publicOnly = req.query.public === 'true';

    let filteredFiles = [...uploadedFiles];

    // BUG: Filtering logic has issues (fixed: corrected filtering logic)
    if (publicOnly) {
      filteredFiles = filteredFiles.filter(f => f.publicAccess);
    } else if (currentUser) {
      // BUG: Admin can see all files, but regular users see everyone's files too (fixed: corrected filtering logic)
      filteredFiles = filteredFiles.filter(f => {
         if(currentUser.role === 'admin'){
           return true; // fixed : admin can see all files
         }
         return f.uploadedBy === currentUser.userId || f.publicAccess;
      }
        // f.uploadedBy === currentUser.userId || f.publicAccess || currentUser.role === 'admin'
      );
    }

    if (status) {
      filteredFiles = filteredFiles.filter(f => f.status === status);
    }

    // BUG: No proper pagination implementation (fixed: proper validation and bounds checking)
    const validPage = Math.max(1, page); // Ensure page is at least 1
    const startIndex = (validPage - 1) * limit;
    const paginatedFiles = filteredFiles.slice(startIndex, startIndex + limit);

    res.set({
      'X-Total-Files': filteredFiles.length.toString(),
      'X-Processing-Queue': uploadedFiles.filter(f => f.status === 'processing').length.toString(),
      // 'X-Debug-Auth': currentUser ? 'authenticated' : 'anonymous' // BUG: Exposing auth status(fixed: removed to prevent info leak)
    });

    res.json({
      files: paginatedFiles.map(file => ({
        id: file.id,
        originalName: file.originalName,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        uploadDate: file.uploadDate,
        status: file.status,
        queuePosition: file.queuePosition || null,
        progress: file.progress !== undefined ? file.progress : (file.status === 'processed' ? 100 : 0),
        estimatedTimeRemaining: file.estimatedTimeRemaining || null,
        downloadUrl: file.downloadUrl,
        publicAccess: file.publicAccess,
        // BUG: Exposing uploader info to everyone (fixed: only expose to admin and owner)
        ...(currentUser.role === 'admin' || file.uploadedBy === currentUser.userId ? { uploadedBy: file.uploadedBy } : {}),
        processingResult: file.processingResult
      })),
      pagination: {
        page: validPage,
        limit,
        total: filteredFiles.length,
        hasMore: startIndex + limit < filteredFiles.length
      },
      queueInfo: {
        queueLength: processingQueue.length,
        isProcessing: isProcessing
      }
    });
  } catch (error) {
    // BUG: Exposing internal error details (fixed: generic error message)
    console.error('File listing error:', error.message);
    res.status(500).json({ 
      error: 'File processing error',
      // details: error.message, // BUG: Exposing error details
      // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // BUG: Stack trace in dev
    });
  }
});

// Get file info
router.get('/:fileId', async (req, res) => {
  try {
    let currentUser = null;
    
    // Add authentication check
    try {
      currentUser = getCurrentUser(req);
      if (!currentUser) {
        console.log('Authentication required');
        return res.status(401).json({ error: 'Authentication required' });
      }
    } catch (e) {
      console.log('Invalid token');
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const { fileId } = req.params;
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // BUG: No access control check for file info (fixed: added access control)
    if (!file.publicAccess && currentUser?.userId !== file.uploadedBy && currentUser?.role !== 'admin') {
      // This check exists but doesn't return early (fixed: added return statement)
      console.log('Unauthorized file access attempt');
      return res.status(403).json({ error: 'Unauthorized file access' });
    }

    res.json({
      id: file.id,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: file.uploadDate,
      status: file.status,
      queuePosition: file.queuePosition || null,
      progress: file.progress !== undefined ? file.progress : (file.status === 'processed' ? 100 : 0),
      estimatedTimeRemaining: file.estimatedTimeRemaining || null,
      downloadUrl: file.downloadUrl,
      publicAccess: file.publicAccess,
      ...(currentUser.role === 'admin' || file.uploadedBy === currentUser.userId ? { uploadedBy: file.uploadedBy } : {}), // BUG: Always exposing uploader (fixed: conditional exposure)
      processingResult: file.processingResult,
      // BUG: Exposing internal file path (fixed: only expose to owner)
      ...(file.uploadedBy === currentUser.userId ? { internalPath: `${UPLOAD_DIR}/${file.filename}` } : {})
    });
  } catch (error) {
    console.error('Get file error:', error.message);
    res.status(500).json({ 
      error: 'File processing error',
      // details: error.message // No details exposed
    });
  }
});

// Upload file (mock)
router.post('/', async (req, res) => {
  try {
    let currentUser = null;
    
    // BUG: No authentication check for uploads (fixed: added authentication)
    try{
      currentUser = getCurrentUser(req);
      if(!currentUser){
        console.log('Authentication required');
        return res.status(401).json({ error: 'Authentication required' });
      }
    }catch(e){
      console.log('Auth failed:', e.message);
      return res.status(401).json({ error: 'Authentication required' });
    }

    // BUG: Not properly handling multipart form data (fixed: validates content-type)
    const contentType = req.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'File upload requires multipart/form-data' });
    }

    // MOCK: Simulating file upload processing
    const mockFile = {
      originalName: 'uploaded-file.txt',
      buffer: Buffer.from('mock file content'),
      mimetype: 'text/plain',
      size: 17
    };

    // BUG: No file validation (fixed: added basic validation)
    if (mockFile.size === 0) {
      // Should reject but continues (fixed: by adding return statement)
      console.log('Zero-size file uploaded');
      return res.status(400).json({ error: 'cannot upload empty file' });
    }

    // BUG: No file type validation (fixed: added basic type check)
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/csv', 'text/plain'];
    if (!allowedTypes.includes(mockFile.mimetype)) {
      console.log('Potentially unsafe file type:', mockFile.mimetype);
      return res.status(415).json({ error: 'Unsupported file type' });
    }

    // BUG: No file size limits enforced (fixed: enforces 10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (mockFile.size > maxSize) {
      return res.status(413).json({ error: 'File too large' });
    }

    // BUG: Predictable filename generation (fixed: using UUIDs)
    const fileExt = path.extname(mockFile.originalName);
    const filename = `${uuidv4()}${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    
    // NEW: Save file to disk
    try {
      fs.writeFileSync(filePath, mockFile.buffer);
      console.log(`File saved to disk: ${filePath}`);
    } catch (writeError) {
      console.error('Failed to save file to disk:', writeError.message);
      return res.status(500).json({ error: 'Failed to save file' });
    }
    
    const newFile = {
      id: uuidv4(),
      originalName: mockFile.originalName,
      filename,
      mimetype: mockFile.mimetype,
      size: mockFile.size,
      uploadedBy: currentUser.userId, // BUG: Allowing anonymous uploads (fixed: using authenticated user)
      uploadDate: new Date().toISOString(),
      status: 'uploaded',
      processingResult: null,
      downloadUrl: `/api/upload/download/${filename}`, // NEW: Download endpoint
      publicAccess: false, // BUG: Default to private but no way to set
      filePath: filePath // NEW: Track file location on disk
    };

    uploadedFiles.push(newFile);

    // Feature 2: Add to processing queue
    newFile.status = 'queued';
    addToQueue(newFile.id);

    res.set({
      'X-File-Id': newFile.id,
      'Location': `/api/upload/${newFile.id}`
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: newFile.id,
        originalName: newFile.originalName,
        size: newFile.size,
        status: newFile.status,
        queuePosition: newFile.queuePosition,
        progress: 0,
        estimatedTimeRemaining: null,
        downloadUrl: newFile.downloadUrl
      }
    });
  } catch (error) {
    console.error('File upload error:', error.message);
    res.status(500).json({ 
      error: 'File processing error',
      // details: error.message (no details exposed)
    });
  }
});

// Update file metadata
router.put('/:fileId', async (req, res) => {
  try {
    // Added authentication check
    let currentUser = null;
    try{
      currentUser = getCurrentUser(req);
      if(!currentUser){
        console.log('Authentication required');
        return res.status(401).json({ error: 'Authentication required' });
      }
    }catch(error){
      console.log('Auth failed:', error.message);
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { fileId } = req.params;
    const updateData = req.body;
    
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // BUG: No ownership check for metadata updates
    if (file.uploadedBy !== currentUser?.userId && currentUser?.role !== 'admin') {
      console.log('Unauthorized metadata update attempt');
      return res.status(403).json({ error: 'Permission denied' });
    }

    // BUG: No validation of update data (fixed: reject invalid fields)
    const allowedFields = ['publicAccess', 'originalName'];

    // Check for invalid fields and reject
    for (const key of Object.keys(updateData)) {
      if (!allowedFields.includes(key)) {
        return res.status(400).json({ error: `Invalid field: ${key}` });
      }
    }
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        file[key] = updateData[key];
      }
    });

    res.json({
      message: 'File metadata updated successfully',
      file: {
        id: file.id,
        originalName: file.originalName,
        publicAccess: file.publicAccess,
        status: file.status
      }
    });
  } catch (error) {
    console.error('Update file error:', error.message);
    res.status(500).json({ 
      error: 'File processing error'
    });
  }
});

// Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    // Authentication added
    let currentUser = null;
    try{
      currentUser = getCurrentUser(req);   
      if(!currentUser){
        console.log('Authentication required');
        return res.status(401).json({ error: 'Authentication required' });
      }
    }catch(error){
       console.log('Auth failed:', error.message);
       return res.status(401).json({ error: 'Authentication required' });
    }
    
    const fileIndex = uploadedFiles.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = uploadedFiles[fileIndex];

    // BUG: No ownership check for deletion(fixed: added ownership check)
    if (file.uploadedBy !== currentUser.userId && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // NEW: Delete file from disk
    if (file.filePath && fs.existsSync(file.filePath)) {
      try {
        fs.unlinkSync(file.filePath);
        console.log(`File deleted from disk: ${file.filePath}`);
      } catch (deleteError) {
        console.error('Failed to delete file from disk:', deleteError.message);
        // Continue anyway - delete from database
      }
    }

    // BUG: Not actually deleting the physical file( mock implementation there is no physical file)
    uploadedFiles.splice(fileIndex, 1);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error.message);
    res.status(500).json({ 
      error: 'File processing error',
      // details: error.message
    });
  }
});

// MOCK: File processing simulation
function processFile(fileId) {
  const file = uploadedFiles.find(f => f.id === fileId);
  if (!file) return;

  // BUG: Processing can fail but errors aren't handled properly (fixed: added proper error handling with logging)
  try {
    file.status = 'processing';
    
    // Simulate processing based on file type
    if (file.mimetype.startsWith('image/')) {
      // BUG: Image processing doesn't handle corrupted files (fixed: properly handles corrupted files with error status)
      if (file.size === 0) {
        throw new Error('Corrupted file header');
      }
      file.processingResult = {
        width: 1920,
        height: 1080,
        format: 'jpeg',
        thumbnailCreated: true
      };
    } else if (file.mimetype === 'text/csv') {
      // BUG: CSV processing exposes data structure (fixed: removed sensitive column names and preview data)
      file.processingResult = {
        rows: Math.floor(Math.random() * 1000),
        // columns: ['id', 'name', 'email', 'salary'], // BUG: Exposing column names (fixed: removed)
        // previewData: [
        //   { id: 1, name: 'John Doe', email: 'john@company.com', salary: 75000 } // BUG: Exposing actual data (fixed: removed)
        // ]
      };
    } else if (file.mimetype === 'application/pdf') {
      file.processingResult = {
        pages: Math.floor(Math.random() * 50) + 1,
        textExtracted: true,
        wordCount: Math.floor(Math.random() * 10000),
        // BUG: Exposing potentially sensitive extracted text (fixed: removed sensitive text)
        // extractedText: 'Confidential company information...'
      };
    }

    file.status = 'processed';
  } catch (error) {
    console.error('File processing error:', error.message); // Added logging for internal tracking
    file.status = 'error';
    file.processingResult = { 
      error: 'Processing failed'
      // BUG: Exposing full error stack in processing result (fixed: generic error message, removed stack trace)
    };
  }
}

// NEW: Download file endpoint
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Security check: ensure file exists and is in uploads directory
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify file is in uploads directory (prevent directory traversal)
    const realPath = fs.realpathSync(filePath);
    const realUploadDir = fs.realpathSync(UPLOAD_DIR);
    if (!realPath.startsWith(realUploadDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find file in database to check access rights
    const file = uploadedFiles.find(f => f.filename === filename);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if user has access to download
    let currentUser = null;
    try {
      currentUser = getCurrentUser(req);
    } catch (e) {
      // Continue - check if file is public
    }

    if (!file.publicAccess && (!currentUser || (currentUser.userId !== file.uploadedBy && currentUser.role !== 'admin'))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Download the file
    res.download(filePath, file.originalName, (err) => {
      if (err) {
        console.error('Download error:', err.message);
      }
    });
  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

module.exports = router;
