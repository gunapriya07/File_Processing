const express = require('express');
const cors = require('cors');
const path = require('path');
// Added: import multer to detect and handle upload-specific errors
const multer = require('multer');

// Import routes
const uploadRoutes = require('./routes/upload');
const processingLogsRoutes = require('./routes/processing-logs');
const archiveRoutes = require('./routes/archive');
const authRoutes = require('./routes/auth');
const downloadRoutes = require('./routes/download');

// Import middleware
const { createRateLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// NEW: Serve uploads folder for file downloads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// NEW: Apply rate limiting middleware
const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100
});
app.use('/api/', apiRateLimiter);

// Custom headers for puzzle hints
app.use((req, res, next) => {
  res.set({
    'X-Upload-Limit': '10MB',
    'X-Hidden-Metadata': 'check_file_processing_logs_endpoint',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  next();
});

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/processing-logs', processingLogsRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/download', downloadRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
  // Changed: Provide specific responses for known upload errors
  if (error instanceof multer.MulterError) {
    console.error('Multer error:', error.message);
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error && error.message === 'Unsupported file type') {
    console.error('Unsupported file type');
    return res.status(415).json({ error: 'Unsupported file type' });
  }
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`📁 Assessment 4: File Processing API running on http://localhost:${PORT}`);
  console.log(`📋 View instructions: http://localhost:${PORT}`);
  console.log(`🧩 Multi-layered puzzles and file security challenges await!`);
});
