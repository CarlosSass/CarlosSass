require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Test route - REQUIRED for Railway

// Add a test page to debug Socket.IO
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <script src="https://cdn.socket.io/4.7.1/socket.io.min.js"></script>
    <script>
      const socket = io();
      socket.on('connect', () => {
        document.body.innerHTML += '<p>Connected! Socket ID: ' + socket.id + '</p>';
      });
      socket.on('welcome', (data) => {
        document.body.innerHTML += '<p>Server says: ' + JSON.stringify(data) + '</p>';
      });
    </script>
    <h1>Socket.IO Test</h1>
    <p>Check console (F12) for connection logs</p>
  `);
});
// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

// Socket.IO test
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
  transports: ['websocket', 'polling'] // Required for Railway
});

// Basic Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Send immediate response to verify connection
  socket.emit('welcome', { 
    message: 'Successfully connected to Socket.IO!', 
    timestamp: new Date().toISOString() 
  });

  // Echo back any test messages
  socket.on('test', (data) => {
    console.log('Received test:', data);
    socket.emit('test-response', { 
      echo: data,
      serverTime: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
