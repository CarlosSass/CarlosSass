import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@0.11.0/+esm';
import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';

// DOM Elements
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

// Initialize Supabase
const supabase = createClient(
  'https://evberyanshxxalxtwnnc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw'
);

// Initialize Socket.IO
const socket = io('https://chess-game-production-9494.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ['websocket'],
  secure: true,
  withCredentials: true
});

// Game State
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
  hasInitialized: false,
  pendingPromotion: null
};

// Piece Symbols
const PIECE_SYMBOLS = {
  'K': '<svg viewBox="0 0 45 45"><g fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt"/><path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g></svg>',
  'Q': '<svg viewBox="0 0 45 45"><g fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="14" cy="9" r="2.5"/><circle cx="22.5" cy="8" r="2.5"/><circle cx="31" cy="9" r="2.5"/><circle cx="39" cy="12" r="2.5"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#000000"/></g></svg>',
  'R': '<svg viewBox="0 0 45 45"><g fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none"/></g></svg>',
  'B': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><g fill="#ffffff"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>',
  'N': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#ffffff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#ffffff"/><circle cx="9.5" cy="25.5" r="0.5" fill="#000000"/><path d="M15.5 15.5a0.5 1.5 30 1 1-0.866-0.5 0.5 1.5 30 1 1 0.866 0.5z" fill="#000000"/></g></svg>',
  'P': '<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/></svg>',
  'k': '<svg viewBox="0 0 45 45"><g fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt"/><path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g></svg>',
  'q': '<svg viewBox="0 0 45 45"><g fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="14" cy="9" r="2.5"/><circle cx="22.5" cy="8" r="2.5"/><circle cx="31" cy="9" r="2.5"/><circle cx="39" cy="12" r="2.5"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#ffffff"/></g></svg>',
  'r': '<svg viewBox="0 0 45 45"><g fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none"/></g></svg>',
  'b': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><g fill="#333333"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>',
  'n': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#333333"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#333333"/><circle cx="9.5" cy="25.5" r="0.5" fill="#ffffff"/><path d="M15.5 15.5a0.5 1.5 30 1 1-0.866-0.5 0.5 1.5 30 1 1 0.866 0.5z" fill="#ffffff"/></g></svg>',
  'p': '<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/></svg>'
};

// Sound Effects
const sounds = {
  move: new Audio('move-self.mp3'),
  capture: new Audio('capture.mp3'),
  check: new Audio('notify.mp3'),
  join: new Audio('join.mp3')
};

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initGame();
  board.addEventListener('click', handleBoardClick);
  
  // Setup connection status indicator
  socket.on('connect', () => {
    gameState.isConnected = true;
    updateConnectionStatus();
  });
  
  socket.on('disconnect', () => {
    gameState.isConnected = false;
    updateConnectionStatus();
  });
});

// Render the chess board with pieces
function renderBoard() {
  document.querySelectorAll('.piece').forEach(p => p.remove());
  
  if (gameState.chess.history().length > 0) {
    const lastMove = gameState.chess.history({ verbose: true }).slice(-1)[0];
    if (lastMove?.captured) {
      playSound('capture');
    } else if (gameState.chess.in_check()) {
      playSound('check');
    } else {
      playSound('move');
    }
  }
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const algebraic = rowColToAlgebraic(row, col);
      const piece = gameState.chess.get(algebraic);
      if (!piece) continue;
      
      const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      const pieceElement = document.createElement('div');
      pieceElement.className = 'piece';
      pieceElement.innerHTML = PIECE_SYMBOLS[piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()] || '';
      pieceElement.classList.add(piece.color === 'w' ? 'white-piece' : 'black-piece');
      square.appendChild(pieceElement);
    }
  }
}

// Handle game updates from server
function handleGameUpdate(update) {
  if (!update?.gameState) return;
  
  document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
    el.classList.remove('last-move-from', 'last-move-to');
  });
  
  gameState.currentGame = update.gameState;
  gameState.chess.load(update.gameState.fen);
  gameState.turn = update.gameState.turn;
  
  updatePlayerInfo(update.gameState);
  
  if (update.move) {
    const { from, to } = update.move;
    if (from) {
      const { row: fromRow, col: fromCol } = algebraicToRowCol(from);
      const fromSquare = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
      if (fromSquare) fromSquare.classList.add('last-move-from');
    }
    
    if (to) {
      const { row: toRow, col: toCol } = algebraicToRowCol(to);
      const toSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
      if (toSquare) toSquare.classList.add('last-move-to');
    }
    
    addMoveToHistory(update.move);
  }
  
  updateGameState(update.gameState);
}

// Show promotion dialog
function showPromotionDialog(color) {
  const dialog = document.getElementById('promotion-dialog');
  const options = dialog.querySelectorAll('.promotion-option');
  
  options.forEach(option => {
    option.innerHTML = '';
    option.className = 'promotion-option';
    option.classList.add(color === 'w' ? 'white-promotion' : 'black-promotion');
    
    const pieceType = option.dataset.piece;
    const symbol = color === 'w' 
      ? PIECE_SYMBOLS[pieceType.toUpperCase()]
      : PIECE_SYMBOLS[pieceType.toLowerCase()];
    
    const pieceContainer = document.createElement('div');
    pieceContainer.className = 'promotion-piece';
    pieceContainer.innerHTML = symbol;
    option.appendChild(pieceContainer);
  });
  
  dialog.style.display = 'flex';
}

// Handle board clicks
function handleBoardClick(event) {
  if (!gameState.currentGame || gameState.currentGame.status === 'finished') return;
  
  const square = event.target.closest('.square');
  if (!square) return;
  
  const row = parseInt(square.dataset.row);
  const col = parseInt(square.dataset.col);
  const algebraic = rowColToAlgebraic(row, col);
  
  if (gameState.selectedSquare) {
    const piece = gameState.chess.get(gameState.selectedSquare);
    const isPromotion = piece?.type === 'p' && 
                     ((piece.color === 'w' && algebraic[1] === '8') || 
                     (piece.color === 'b' && algebraic[1] === '1'));
    
    if (isPromotion) {
      gameState.pendingPromotion = {
        from: gameState.selectedSquare,
        to: algebraic,
        color: piece.color
      };
      showPromotionDialog(piece.color);
    } else {
      tryMakeMove(gameState.selectedSquare, algebraic);
    }
    gameState.selectedSquare = null;
    clearHighlights();
  } else {
    const piece = gameState.chess.get(algebraic);
    if (piece && piece.color[0] === gameState.playerColor[0]) {
      gameState.selectedSquare = algebraic;
      highlightSquare(row, col);
      highlightLegalMoves(algebraic);
    }
  }
}

// Handle promotion selection
document.querySelectorAll('.promotion-option').forEach(button => {
  button.addEventListener('click', () => {
    const promotion = button.dataset.piece;
    document.getElementById('promotion-dialog').style.display = 'none';

    if (gameState.pendingPromotion) {
      tryMakeMove(
        gameState.pendingPromotion.from, 
        gameState.pendingPromotion.to, 
        promotion
      );
      gameState.pendingPromotion = null;
    }
  });
});

// Attempt to make a move
async function tryMakeMove(from, to, promotion) {
  try {
    const move = gameState.chess.move({ from, to, promotion });
    if (!move) return;
    
    renderBoard();
    
    const moveData = {
      gameCode: gameState.gameCode,
      from,
      to,
      player: gameState.playerColor,
      promotion
    };

    if (gameState.isConnected) {
      socket.emit('move', moveData);
    } else {
      const response = await fetch(`${gameState.apiBaseUrl}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moveData)
      });
      
      if (!response.ok) throw new Error('Move failed');
    }
  } catch (error) {
    console.error('Move error:', error);
    if (gameState.currentGame?.fen) {
      gameState.chess.load(gameState.currentGame.fen);
      renderBoard();
    }
    showError(error.message);
  }
}

// Initialize Game
async function initGame() {
  const params = new URLSearchParams(window.location.search);
  gameState.gameCode = params.get('code');
  gameState.playerColor = params.get('color') || 'white';
  gameState.boardFlipped = gameState.playerColor === 'black';

  document.getElementById('game-code-text').textContent = gameState.gameCode || 'Not set';

  if (!gameState.gameCode) {
    showError('No game code provided');
    return;
  }

  try {
    socket.emit('joinGame', gameState.gameCode);
    showWaitingOverlay();
    
    socket.on('gameState', initializeGameUI);
    socket.on('gameUpdate', handleGameUpdate);
    socket.on('moveError', showError);
    socket.on('drawOffer', handleDrawOffer);
    socket.on('gameOver', handleGameResult);
    
    socket.on('playerUpdate', (data) => {
      if (gameState.currentGame) {
        if (data.color === 'white') {
          gameState.currentGame.white_username = data.username;
        } else {
          gameState.currentGame.black_username = data.username;
        }
        updatePlayerInfo(gameState.currentGame);
      }
    });

    socket.on('gameReady', () => {
      showNotification('Both players connected! Game is starting...');
      displayAlert("White must move first!", 'warning');
      playSound('join');
    });
  
    setTimeout(() => {
      if (!gameState.isConnected) fetchInitialGameState();
    }, 2000);
    
    setInterval(fetchGameState, 30000);
    
  } catch (error) {
    console.error('Init error:', error);
    showError('Error loading game');
  }
}

// Copy game code to clipboard
document.getElementById('copy-code')?.addEventListener('click', () => {
  if (!gameState.gameCode) return;
  
  navigator.clipboard.writeText(gameState.gameCode).then(() => {
    const button = document.getElementById('copy-code');
    button.textContent = '✓ Copied!';
    setTimeout(() => button.textContent = '📋', 2000);
  }).catch(console.error);
});

// Update game state display
function updateGameState(gameData) {
  renderBoard();
  
  if (gameData.status === 'finished') {
    gameStatus.textContent = `Game over - ${gameData.winner} wins by ${gameData.result}`;
  } else if (gameData.draw_offer) {
    gameStatus.textContent = `${gameData.draw_offer} offers a draw`;
  } else {
    gameStatus.textContent = `${gameData.turn}'s turn${gameState.chess.in_check() ? ' (CHECK!)' : ''}`;
  }
  
  if (gameData.white_time !== undefined && gameData.black_time !== undefined) {
    if (gameState.playerColor === 'black') {
      whiteTimeDisplay.textContent = formatTime(gameData.white_time);
      blackTimeDisplay.textContent = formatTime(gameData.black_time);
    } else {
      whiteTimeDisplay.textContent = formatTime(gameData.black_time);
      blackTimeDisplay.textContent = formatTime(gameData.white_time);
    }
  }
}

// Initialize game UI
function initializeGameUI(gameData) {
  gameState.currentGame = gameData;
  gameState.chess.load(gameData.fen);
  updatePlayerInfo(gameData);
  createBoard();
  updateGameState(gameData);
  updateConnectionStatus();
  removeWaitingOverlay();
  gameState.hasInitialized = true;
}

// Update player info display
function updatePlayerInfo(gameData) {
  const whiteUsernameElement = document.getElementById('white-username');
  const blackUsernameElement = document.getElementById('black-username');

  if (gameState.playerColor === 'black') {
    whiteUsernameElement.textContent = gameData.white_username || 'White';
    blackUsernameElement.textContent = gameData.black_username || 'Black';
    whiteTimeDisplay.textContent = formatTime(gameData.white_time || 600);
    blackTimeDisplay.textContent = formatTime(gameData.black_time || 600);
  } else {
    whiteUsernameElement.textContent = gameData.black_username || 'Black';
    blackUsernameElement.textContent = gameData.white_username || 'White';
    whiteTimeDisplay.textContent = formatTime(gameData.black_time || 600);
    blackTimeDisplay.textContent = formatTime(gameData.white_time || 600);
  }
}

// Create chess board
function createBoard() {
  board.innerHTML = '';
  
  const rowStart = gameState.boardFlipped ? 7 : 0;
  const rowEnd = gameState.boardFlipped ? -1 : 8;
  const rowStep = gameState.boardFlipped ? -1 : 1;
  
  const colStart = gameState.boardFlipped ? 7 : 0;
  const colEnd = gameState.boardFlipped ? -1 : 8;
  const colStep = gameState.boardFlipped ? -1 : 1;

  for (let row = rowStart; row !== rowEnd; row += rowStep) {
    for (let col = colStart; col !== colEnd; col += colStep) {
      const square = document.createElement('div');
      square.className = `square ${(row + col) % 2 ? 'dark' : 'light'}`;
      square.dataset.row = row;
      square.dataset.col = col;
      square.dataset.square = rowColToAlgebraic(row, col);
      
      if (gameState.boardFlipped) square.classList.add('flipped');
      board.appendChild(square);
    }
  }

  renderBoard();
}

// Helper functions
function rowColToAlgebraic(row, col) {
  return String.fromCharCode(97 + col) + (8 - row);
}

function algebraicToRowCol(algebraic) {
  return {
    row: 8 - parseInt(algebraic[1], 10),
    col: algebraic.charCodeAt(0) - 97
  };
}

function highlightLegalMoves(square) {
  gameState.chess.moves({ square, verbose: true }).forEach(move => {
    const { row, col } = algebraicToRowCol(move.to);
    highlightSquare(row, col);
  });
}

function highlightSquare(row, col) {
  const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (square) square.classList.add('highlight');
}

function clearHighlights() {
  document.querySelectorAll('.highlight').forEach(el => {
    el.classList.remove('highlight');
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeDisplay = gameState.playerColor === 'black' ? whiteTimeDisplay : blackTimeDisplay;
  
  if (seconds <= 10) timeDisplay.classList.add('time-warning');
  else timeDisplay.classList.remove('time-warning');
  
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function playSound(type) {
  try {
    sounds[type].currentTime = 0;
    sounds[type].play();
  } catch (e) {
    console.log('Audio error:', e);
  }
}

function addMoveToHistory(move) {
  if (!moveHistory) return;
  
  const moveNumber = Math.ceil(moveHistory.children.length / 2) + 1;
  const isWhiteMove = moveHistory.children.length % 2 === 0;
  
  if (isWhiteMove) {
    const moveElement = document.createElement('div');
    moveElement.className = 'move-number';
    moveElement.textContent = `${moveNumber}.`;
    moveHistory.appendChild(moveElement);
  }
  
  const moveElement = document.createElement('div');
  moveElement.className = 'move';
  moveElement.textContent = `${move.from}-${move.to}`;
  moveHistory.appendChild(moveElement);
  moveHistory.scrollTop = moveHistory.scrollHeight;
}

function showError(message) {
  if (!errorDisplay) {
    alert(message);
    return;
  }
  
  errorDisplay.textContent = message;
  errorDisplay.style.display = 'block';
  setTimeout(() => errorDisplay.style.display = 'none', 3000);
}

function updateConnectionStatus() {
  const statusElement = document.getElementById('connection-status');
  if (!statusElement) return;
  
  statusElement.textContent = gameState.isConnected 
    ? 'Online (Real-time)' 
    : 'Offline (Polling every 30s)';
  statusElement.className = gameState.isConnected ? 'online' : 'offline';
}

// Fallback functions
async function fetchInitialGameState() {
  try {
    const response = await fetch(`${gameState.apiBaseUrl}/api/game-by-code/${gameState.gameCode}`);
    const gameData = await response.json();
    if (gameData) initializeGameUI(gameData);
  } catch (error) {
    console.error('API fallback error:', error);
    showError('Connection issues - trying to reconnect...');
  }
}

async function fetchGameState() {
  if (gameState.isConnected) return;
  
  try {
    const response = await fetch(`${gameState.apiBaseUrl}/api/game-by-code/${gameState.gameCode}`);
    const gameData = await response.json();
    if (gameData) updateGameState(gameData);
  } catch (error) {
    console.error('Periodic sync error:', error);
  }
}

// Game actions
document.getElementById('offer-draw')?.addEventListener('click', () => {
  if (!gameState.currentGame) return;
  
  if (confirm('Offer draw to your opponent?')) {
    socket.emit('offerDraw', {
      gameCode: gameState.gameCode,
      player: gameState.playerColor
    });
  }
});

document.getElementById('resign')?.addEventListener('click', () => {
  if (!gameState.currentGame) return;
  
  if (confirm('Are you sure you want to resign?')) {
    socket.emit('resign', {
      gameCode: gameState.gameCode,
      player: gameState.playerColor
    });
  }
});

function handleDrawOffer(offer) {
  if (confirm(`${offer.player} offers a draw. Accept?`)) {
    socket.emit('acceptDraw', { gameCode: gameState.gameCode });
  } else {
    socket.emit('declineDraw', { gameCode: gameState.gameCode });
  }
}

// Timer updates
socket.on('timerUpdate', ({ whiteTime, blackTime, currentTurn }) => {
  if (gameState.playerColor === 'black') {
    whiteTimeDisplay.textContent = formatTime(whiteTime);
    blackTimeDisplay.textContent = formatTime(blackTime);
  } else {
    whiteTimeDisplay.textContent = formatTime(blackTime);
    blackTimeDisplay.textContent = formatTime(whiteTime);
  }
  
  if (currentTurn === gameState.playerColor) {
    document.getElementById(`${gameState.playerColor}-time`).classList.add('active-turn');
    document.getElementById(`${gameState.playerColor === 'white' ? 'black' : 'white'}-time`).classList.remove('active-turn');
  }
});

// Notifications
socket.on('notification', (data) => {
  switch(data.type) {
    case 'role-assignment':
      showNotification(`You are playing as ${data.role.toUpperCase()}. ${data.message}`);
      break;
    case 'game-start':
      showNotification(data.message);
      removeWaitingOverlay();
      break;
    case 'opponent-connected':
      removeWaitingOverlay();
      showNotification('Your opponent has joined! Game starting...');
      break;
  }
});

// Handle game results
function handleGameResult(result) {
  const isWinner = result.winner === gameState.playerColor;
  const isDraw = !result.winner;
  
  let message = result.reason || (isWinner ? 'You won the game!' : 'You lost the game');
  let amountMessage = '';
  
  if (isWinner) {
    amountMessage = result.winningAmount ? `+${formatBalance(result.winningAmount)}` : '';
  } else if (isDraw) {
    message = result.reason || 'Game ended in a draw';
    amountMessage = result.betAmount ? `Refunded ${formatBalance(result.betAmount)}` : '';
  } else {
    amountMessage = result.betAmount ? `-${formatBalance(Math.abs(result.betAmount))}` : '';
  }

  showGameResultModal({
    isWinner,
    isDraw,
    message,
    amount: amountMessage,
    bet: result.betAmount,
    newBalance: isWinner ? result.winnerNewBalance : result.loserNewBalance
  });

  gameStatus.textContent = message;
  
  if (isWinner) playSound('check');
  else if (isDraw) playSound('move');
  else playSound('capture');
}

function showGameResultModal(data) {
  const { isWinner, isDraw, message, amount } = data;
  
  resultTitle.textContent = isWinner ? 'You Won!' : isDraw ? 'Game Drawn' : 'Game Over';
  resultMessage.textContent = message;
  
  if (amount) {
    resultAmount.textContent = amount;
    resultAmount.className = isWinner ? 'win' : isDraw ? 'draw' : 'lose';
  } else {
    resultAmount.textContent = '';
  }

  if (data.newBalance !== undefined) {
    document.getElementById('balance-display').textContent = formatBalance(data.newBalance);
  }

  gameResultModal.classList.add('active');
}

function formatBalance(amount) {
  return (typeof amount === 'number' ? amount : 0).toLocaleString() + ' ETB';
}

// UI helpers
function displayAlert(message, type = 'info') {
  const alertBox = document.createElement('div');
  alertBox.className = `alert ${type}`;
  alertBox.textContent = message;
  document.body.appendChild(alertBox);
  setTimeout(() => alertBox.remove(), 3000);
}

function showWaitingOverlay() {
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function removeWaitingOverlay() {
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    playSound("join");
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'game-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

// Back button handler
document.addEventListener('DOMContentLoaded', function() {
  const backBtn = document.getElementById('back-btn');
  resultCloseBtn.addEventListener('click', () => {
    gameResultModal.classList.remove('active');
    window.location.href = '/';
  });
  
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to leave the game?')) {
        window.history.back();
      }
    });
  }
});
