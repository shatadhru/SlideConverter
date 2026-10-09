const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security and compression headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SlideConverter',
    platform: process.platform,
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server if run directly (not as serverless function)
if (require.main === module) {
  function startServer(port) {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`SlideConverter server running at http://localhost:${port}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && !process.env.PORT) {
        console.log(`Port ${port} in use, trying port ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
  }
  startServer(PORT);
}

module.exports = app;
