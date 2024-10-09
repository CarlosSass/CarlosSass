import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@0.11.0/+esm';
import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';

// Enhanced DOM Elements
const board = document.getElementById('board');
const gameStatus = document.getElementById('game-status');
const whiteTimeDisplay = document.getElementById('white-time');
const blackTimeDisplay = document.getElementById('black-time');
const moveHistory = document.getElementById('move-history');
const errorDisplay = document.getElementById('error-message');
const gameResultModal = document.getElementById('game-result-modal');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const resultAmount = document.getElementById('result-amount');
const resultCloseBtn = document.getElementById('result-close-btn');
const balanceDisplay = document.getElementById('balance-display');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// Initialize Supabase
const supabase = createClient(
  'https://evberyanshxxalxtwnnc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw'
);

// Enhanced Socket.IO Configuration
const socket = io('https://chess-game-production-9494.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ['websocket'],
  secure: true,
  withCredentials: true,
  autoConnect: true
});

// Enhanced Game State
const gameState = {
  playerColor: 'white',
  boardFlipped: false,
  chess: new Chess(),
  selectedSquare: null,
  currentGame: null,
  gameCode: '',
  apiBaseUrl: 'https://chess-game-production-9494.up.railway.app',
  isConnected: false,
  betAmount: 0,
  balance: 1000, // Starting balance
  processedGameOver: false,
  pendingFrom: null,
  pendingTo: null
};

// Enhanced Piece Symbols with better SVGs
const PIECE_SYMBOLS = {
  // [Previous piece symbols remain the same...]
};

// Enhanced Sound Effects
const sounds = {
  move: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-chess-notification-889.mp3'),
  capture: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3'),
  check: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3'),
  gameStart: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3'),
  gameEnd: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3'),
  chat: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3')
};

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
  initGame();
  initBoard();
  initEventListeners();
});

async function initGame() {
  const params = new URLSearchParams(window.location.search);
  gameState.gameCode = params.get('code') || generateGameCode();
  gameState.playerColor = params.get('color') || (Math.random() > 0.5 ? 'white' : 'black');
  gameState.boardFlipped = gameState.playerColor === 'black';

  document.getElementById('game-code-text').textContent = gameState.gameCode;
  document.getElementById('player-color-indicator').textContent = gameState.playerColor;
  document.getElementById('balance-display').textContent = formatBalance(gameState.balance);

  try {
    socket.emit('joinGame', { 
      gameCode: gameState.gameCode,
      playerColor: gameState.playerColor,
      balance: gameState.balance
    });

    setupSocketListeners();
    showWaitingOverlay();
  } catch (error) {
    showError(`Initialization failed: ${error.message}`);
  }
}

function setupSocketListeners() {
  socket.on('connect', () => {
    gameState.isConnected = true;
    updateConnectionStatus();
  });

  socket.on('disconnect', () => {
    gameState.isConnected = false;
    updateConnectionStatus();
  });

  socket.on('gameState', initializeGameUI);
  socket.on('gameUpdate', handleGameUpdate);
  socket.on('moveError', showError);
  socket.on('drawOffer', handleDrawOffer);
  socket.on('gameOver', handleGameResult);
  socket.on('timerUpdate', handleTimerUpdate);
  socket.on('chatMessage', handleChatMessage);
  socket.on('balanceUpdate', updateBalanceDisplay);
  socket.on('playerDisconnected', handlePlayerDisconnect);
}

function handleGameResult(result) {
  if (gameState.processedGameOver) return;
  
  gameState.processedGameOver = true;
  const isWinner = result.winner === gameState.playerColor;
  const isDraw = !result.winner;
  
  // Update balance if financial transaction occurred
  if (result.newBalance !== undefined) {
    gameState.balance = result.newBalance;
    updateBalanceDisplay({ newBalance: result.newBalance });
  }

  // Prepare result display
  let message = result.reason || (isWinner ? 'You won!' : 'You lost!');
  let amountMessage = '';
  
  if (isWinner && result.winningAmount) {
    amountMessage = `+${formatBalance(result.winningAmount)}`;
  } else if (!isDraw && result.betAmount) {
    amountMessage = `-${formatBalance(result.betAmount)}`;
  } else if (isDraw && result.betAmount) {
    amountMessage = `Refunded ${formatBalance(result.betAmount)}`;
  }

  showGameResultModal({
    isWinner,
    isDraw,
    message,
    amount: amountMessage,
    animation: isWinner ? 'moneyIncrease' : 'moneyDecrease'
  });

  // Play appropriate sound
  playSound(isWinner ? 'gameEnd' : isDraw ? 'move' : 'capture');
}

function handlePlayerDisconnect(data) {
  if (!gameState.processedGameOver) {
    const message = `Opponent disconnected! ${data.timeLeft > 0 ? 
      `They have ${data.timeLeft} seconds to reconnect` : 'You win by forfeit!'}`;
    
    showNotification(message);
    
    if (data.timeLeft <= 0) {
      handleGameResult({
        winner: gameState.playerColor,
        reason: 'Opponent disconnected',
        winningAmount: gameState.betAmount * 1.8,
        betAmount: gameState.betAmount
      });
    }
  }
}

function handleChatMessage(message) {
  const chatMessage = document.createElement('div');
  chatMessage.className = `chat-message ${message.sender === gameState.playerColor ? 'own-message' : 'opponent-message'}`;
  chatMessage.innerHTML = `
    <span class="sender">${message.sender}:</span>
    <span class="content">${message.content}</span>
    <span class="time">${new Date(message.timestamp).toLocaleTimeString()}</span>
  `;
  chatContainer.appendChild(chatMessage);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  playSound('chat');
}

function sendChatMessage() {
  const content = chatInput.value.trim();
  if (content && gameState.currentGame?.status === 'ongoing') {
    socket.emit('chatMessage', {
      gameCode: gameState.gameCode,
      sender: gameState.playerColor,
      content,
      timestamp: new Date().toISOString()
    });
    chatInput.value = '';
  }
}

// Enhanced UI Functions
function showGameResultModal(data) {
  resultTitle.textContent = data.isWinner ? 'Victory!' : data.isDraw ? 'Game Drawn' : 'Game Over';
  resultMessage.textContent = data.message;
  resultAmount.textContent = data.amount || '';
  resultAmount.className = data.isWinner ? 'win' : data.isDraw ? 'draw' : 'lose';
  
  if (data.animation) {
    showAnimation(data.animation);
  }
  
  gameResultModal.classList.add('active');
}

function updateBalanceDisplay(data) {
  if (data.newBalance !== undefined) {
    gameState.balance = data.newBalance;
    balanceDisplay.textContent = formatBalance(data.newBalance);
    
    if (data.amount) {
      showNotification(`${data.amount > 0 ? '+' : ''}${formatBalance(data.amount)}`);
    }
  }
}

// Helper Functions
function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function formatBalance(amount) {
  return `${amount?.toLocaleString() || '0'} ETB`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function playSound(type) {
  const sound = sounds[type];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.log('Audio error:', e));
  }
}

// Initialize board and event listeners
function initBoard() {
  // [Your existing board initialization code...]
}

function initEventListeners() {
  board.addEventListener('click', handleBoardClick);
  resultCloseBtn.addEventListener('click', () => {
    gameResultModal.classList.remove('active');
    window.location.href = '/';
  });
  
  document.getElementById('offer-draw').addEventListener('click', offerDraw);
  document.getElementById('resign').addEventListener('click', resignGame);
  document.getElementById('flip-board').addEventListener('click', flipBoard);
  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  
  window.addEventListener('beforeunload', (e) => {
    if (gameState.currentGame?.status === 'ongoing') {
      e.preventDefault();
      return e.returnValue = 'Are you sure you want to leave? You may forfeit the game.';
    }
  });
}

// [Rest of your existing functions (renderBoard, handleGameUpdate, etc.)...]

// New Features:
// 1. Board flipping
function flipBoard() {
  gameState.boardFlipped = !gameState.boardFlipped;
  renderBoard();
  document.getElementById('flip-board').textContent = 
    gameState.boardFlipped ? 'Unflip Board' : 'Flip Board';
}

// 2. Enhanced move handling
function tryMakeMove(from, to, promotion) {
  try {
    const chess = new Chess(gameState.currentGame.fen);
    const move = chess.move({ from, to, promotion });
    
    if (!move) throw new Error('Invalid move');
    
    // Optimistic UI update
    gameState.chess.move(move);
    renderBoard();
    
    // Send to server
    socket.emit('move', {
      gameCode: gameState.gameCode,
      from,
      to,
      promotion,
      player: gameState.playerColor
    });
    
  } catch (error) {
    showError(error.message);
    if (gameState.currentGame?.fen) {
      gameState.chess.load(gameState.currentGame.fen);
      renderBoard();
    }
  }
}

// 3. Draw and resignation handling
function offerDraw() {
  if (confirm('Offer draw to your opponent?')) {
    socket.emit('offerDraw', {
      gameCode: gameState.gameCode,
      player: gameState.playerColor
    });
  }
}

function resignGame() {
  if (confirm('Are you sure you want to resign?')) {
    socket.emit('resign', {
      gameCode: gameState.gameCode,
      player: gameState.playerColor
    });
  }
}

// 4. Enhanced error handling
function showError(message, duration = 3000) {
  errorDisplay.textContent = message;
  errorDisplay.style.display = 'block';
  errorDisplay.classList.add('error-animation');
  
  setTimeout(() => {
    errorDisplay.style.display = 'none';
    errorDisplay.classList.remove('error-animation');
  }, duration);
}

// CSS for new features
const enhancedStyles = `
  /* Enhanced error display */
  .error-animation {
    animation: shake 0.5s ease-in-out;
  }
  
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-5px); }
    40%, 80% { transform: translateX(5px); }
  }
  
  /* Chat styles */
  #chat-container {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #ddd;
    padding: 10px;
    margin-top: 10px;
    background: #f9f9f9;
  }
  
  .chat-message {
    margin: 5px 0;
    padding: 8px;
    border-radius: 5px;
    max-width: 80%;
  }
  
  .own-message {
    background: #e3f2fd;
    margin-left: auto;
  }
  
  .opponent-message {
    background: #f1f1f1;
    margin-right: auto;
  }
  
  /* Balance animation */
  .balance-update {
    animation: pulseGreen 1s;
  }
  
  @keyframes pulseGreen {
    0% { color: inherit; }
    50% { color: #4CAF50; transform: scale(1.1); }
    100% { color: inherit; }
  }
`;

document.head.insertAdjacentHTML('beforeend', `<style>${enhancedStyles}</style>`);
