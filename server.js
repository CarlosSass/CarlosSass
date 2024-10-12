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
// Initialize Supabase (for authentication and persistence)
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
  transports: ['websocket'], // Force WebSocket protocol
  secure: true,
  withCredentials: true
});

// Game State
const gameState = {
  playerColor: 'white', // This will be set from URL params
  boardFlipped: false ,// Add this new property
  chess: new Chess(),
  selectedSquare: null,
  currentGame: null,
  playerColor: 'white',
  gameCode: '',
  apiBaseUrl: 'https://chess-game-production-9494.up.railway.app', // Updated
  isConnected: false,
  betam:0,
  onetime:false
  
};

// Piece Symbols
// Replace the PIECE_SYMBOLS with SVG icons or image references
const PIECE_SYMBOLS = {
    // White pieces - using light colors with dark outlines
    'K': '<svg viewBox="0 0 45 45"><g fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt"/><path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g></svg>',
    'Q': '<svg viewBox="0 0 45 45"><g fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="14" cy="9" r="2.5"/><circle cx="22.5" cy="8" r="2.5"/><circle cx="31" cy="9" r="2.5"/><circle cx="39" cy="12" r="2.5"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#000000"/></g></svg>',
    'R': '<svg viewBox="0 0 45 45"><g fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none"/></g></svg>',
    'B': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><g fill="#ffffff"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>',
    'N': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#ffffff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#ffffff"/><circle cx="9.5" cy="25.5" r="0.5" fill="#000000"/><path d="M15.5 15.5a0.5 1.5 30 1 1-0.866-0.5 0.5 1.5 30 1 1 0.866 0.5z" fill="#000000"/></g></svg>',
    'P': '<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/></svg>',
    
    // Black pieces - using dark colors with light outlines
    'k': '<svg viewBox="0 0 45 45"><g fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt"/><path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g></svg>',
    'q': '<svg viewBox="0 0 45 45"><g fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="14" cy="9" r="2.5"/><circle cx="22.5" cy="8" r="2.5"/><circle cx="31" cy="9" r="2.5"/><circle cx="39" cy="12" r="2.5"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#ffffff"/></g></svg>',
    'r': '<svg viewBox="0 0 45 45"><g fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none"/></g></svg>',
    'b': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><g fill="#333333"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>',
    'n': '<svg viewBox="0 0 45 45"><g fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#333333"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#333333"/><circle cx="9.5" cy="25.5" r="0.5" fill="#ffffff"/><path d="M15.5 15.5a0.5 1.5 30 1 1-0.866-0.5 0.5 1.5 30 1 1 0.866 0.5z" fill="#ffffff"/></g></svg>',
    'p': '<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#333333" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/></svg>'
};
  // Modify the renderBoard function to use SVG pieces
// Update the renderBoard function to properly display SVG pieces
function renderBoard() {
    // Clear existing pieces
    document.querySelectorAll('.piece').forEach(p => p.remove());
    
    // Play move sound when the board updates (unless it's the initial render)
    if (gameState.chess.history().length > 0) {
        const lastMove = gameState.chess.history({ verbose: true })[gameState.chess.history().length - 1];
        if (lastMove.captured) {
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
            
            // Get the correct SVG based on piece color and type
            const pieceKey = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
            pieceElement.innerHTML = PIECE_SYMBOLS[pieceKey] || '';
            
            // Add color class for styling
            pieceElement.classList.add(piece.color === 'w' ? 'white-piece' : 'black-piece');
            square.appendChild(pieceElement);
        }
    }
}

function handleGameUpdate(update) {
    if (!update || !update.gameState) return;
    
    // Always clear previous move highlights first
    document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
        el.classList.remove('last-move-from', 'last-move-to');
    });
    
    gameState.currentGame = update.gameState;
    gameState.chess.load(update.gameState.fen);
    gameState.turn = update.gameState.turn;
    
    // Update player info
    updatePlayerInfo(update.gameState);
    
    if (update.move) {
        // Highlight the previous move regardless of whose turn it is
        if (update.move.from) {
            const { row: fromRow, col: fromCol } = algebraicToRowCol(update.move.from);
            const fromSquare = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
            if (fromSquare) fromSquare.classList.add('last-move-from');
        }
        
        if (update.move.to) {
            const { row: toRow, col: toCol } = algebraicToRowCol(update.move.to);
            const toSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
            if (toSquare) toSquare.classList.add('last-move-to');
        }
        
        // Sound is now handled in renderBoard()
        addMoveToHistory(update.move);
    }
    
    updateGameState(update.gameState);
  }
  // Update the showPromotionDialog function
  function showPromotionDialog(color) {
    const dialog = document.getElementById('promotion-dialog');
    const options = dialog.querySelectorAll('.promotion-option');
    
    // Clear any existing content
    options.forEach(option => {
      option.innerHTML = '';
      option.className = 'promotion-option'; // Reset classes
      option.classList.add(color === 'w' ? 'white-promotion' : 'black-promotion');
    });
    
    // Set the appropriate pieces based on color
    options.forEach(option => {
      const pieceType = option.dataset.piece;
      const symbol = color === 'w' 
        ? PIECE_SYMBOLS[pieceType.toUpperCase()]
        : PIECE_SYMBOLS[pieceType.toLowerCase()];
      
      // Create container for the piece
      const pieceContainer = document.createElement('div');
      pieceContainer.className = 'promotion-piece';
      pieceContainer.innerHTML = symbol;
      
      option.appendChild(pieceContainer);
    });
    
    dialog.style.display = 'flex';
  }
  
  // Update the CSS for pieces and promotion dialog
  const style = document.createElement('style');
  style.textContent = `
    /* Chess pieces */
  
     
    
    /* Promotion dialog */
    #promotion-dialog {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.85);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      backdrop-filter: blur(3px);
    }
    
    .promotion-options {
      display: flex;
      background: #f0d9b5;
      padding: 20px;
      border-radius: 12px;
      gap: 15px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
    }
    
    .promotion-option {
      width: 65px;
      height: 65px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: 2px solid #b58863;
      border-radius: 8px;
      transition: all 0.2s ease;
      background-color: #f0d9b5;
    }
    
    .promotion-option:hover {
      transform: scale(1.15);
      background: #e8d0a5;
      box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    }
    
    .promotion-piece {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .promotion-piece svg {
      width: 80%;
      height: 80%;
    }
    
    /* Mobile responsive */
    @media (max-width: 400px) {
      .promotion-option {
        width: 50px;
        height: 50px;
      }
      
      .promotion-options {
        padding: 15px;
        gap: 10px;
      }
    }
  `;
  document.head.appendChild(style);

  // ... rest of your existing code ...
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






// Update the handleBoardClick function
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
      // Store the move and show promotion dialog
      pendingFrom = gameState.selectedSquare;
      pendingTo = algebraic;
      showPromotionDialog(piece.color);
    } else {
      // Normal move
      tryMakeMove(gameState.selectedSquare, algebraic);
    }
    gameState.selectedSquare = null;
    clearHighlights();
  } else {
    // Select a piece
    const piece = gameState.chess.get(algebraic);
    if (piece && piece.color[0] === gameState.playerColor[0]) {
      gameState.selectedSquare = algebraic;
      highlightSquare(row, col);
      highlightLegalMoves(algebraic);
    }
  }
}

// Add this new function to show the promotion dialog

// Update the promotion button event listeners
document.querySelectorAll('.promotion-option').forEach(button => {
  button.addEventListener('click', () => {
    const promotion = button.dataset.piece;
    document.getElementById('promotion-dialog').style.display = 'none';

    if (pendingFrom && pendingTo) {
      tryMakeMove(pendingFrom, pendingTo, promotion);

      pendingFrom = null;
      pendingTo = null;
    }
  });
});

// Update tryMakeMove to handle promotion properly
async function tryMakeMove(from, to, promotion) {
  try {
      // Get the moving piece
      const piece = gameState.chess.get(from);
      const isPromotion = piece?.type === 'p' && 
                         ((piece.color === 'w' && to[1] === '8') || 
                          (piece.color === 'b' && to[1] === '1'));

      // Only validate locally for non-promotion moves
      if (!isPromotion) {
          const move = gameState.chess.move({ from, to });
          if (!move) return;
      }

      // Optimistic UI update
      renderBoard();
      
      // Send move to server
      const moveData = {
          gameCode: gameState.gameCode,
          from,
          to,
          player: gameState.playerColor
      };

      if (isPromotion && promotion) {
          moveData.promotion = promotion;
      }

      if (gameState.isConnected) {
          socket.emit('move', moveData);
      } else {
          const response = await fetch(`${gameState.apiBaseUrl}/api/move`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(moveData)
          });
          
          if (!response.ok) {
              throw new Error('Move failed');
          }
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



function displayAlert(message, type = 'info') {
  const alertBox = document.createElement('div');
  alertBox.className = `alert ${type}`;
  alertBox.textContent = message;
  document.body.appendChild(alertBox);
  setTimeout(() => alertBox.remove(), 3000);
}

function showWaitingOverlay() {
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) {
      overlay.classList.remove('hidden');
  }
}

// Add this function somewhere in your script
function removeWaitingOverlay() {
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) {
      overlay.classList.add('hidden');
      playSound("join");
  }
}
// Initialize Game
async function initGame() {
  const params = new URLSearchParams(window.location.search);
  gameState.gameCode = params.get('code');
  gameState.playerColor = params.get('color') || 'white';
  gameState.boardFlipped = gameState.playerColor === 'black';

  // Display the game code
  const gameCodeElement = document.getElementById('game-code-text');
  if (gameCodeElement) {
    gameCodeElement.textContent = gameState.gameCode || 'Not set';
  }

  if (!gameState.gameCode) {
    showError('No game code provided');
    return;
  }

  try {
    // Join game room via Socket.IO
    socket.emit('joinGame', gameState.gameCode);
    showWaitingOverlay();
    
    // Set up Socket.IO listeners
    socket.on('gameState', initializeGameUI);
    socket.on('gameUpdate', handleGameUpdate);
    socket.on('moveError', showError);
    socket.on('drawOffer', handleDrawOffer);
    socket.on('gameOver', handleGameOver);
    
    // Add this new listener for player updates
    socket.on('playerUpdate', (data) => {
      if (gameState.currentGame) {
        // Update the game state with new player info
        if (data.color === 'white') {
          gameState.currentGame.white_username = data.username;
        } else {
          gameState.currentGame.black_username = data.username;
        }
        // Update the UI
        updatePlayerInfo(gameState.currentGame);
      }
    });

    socket.on('gameReady', (data) => {
      const notification = 'Both players connected! Game is starting...';
      showNotification(notification, 5000);
      displayAlert("White must move first!", 'warning');
      initGame();
      playSound('join');
      
      gameStatus.textContent = 'Game in progress';
    });
  
    // Fallback to REST API if Socket.IO isn't connected after 2 seconds
    setTimeout(() => {
      if (!gameState.isConnected) {
        fetchInitialGameState();
      }
    }, 2000);
    
    // Set up periodic state sync (every 30 seconds)
    setInterval(fetchGameState, 30000);
    
  } catch (error) {
    console.error('Init error:', error);
    showError('Error loading game');
  }
}
// Add click handler for the copy button
document.getElementById('copy-code')?.addEventListener('click', () => {
  if (!gameState.gameCode) return;
  
  navigator.clipboard.writeText(gameState.gameCode).then(() => {
    const button = document.getElementById('copy-code');
    button.textContent = '✓ Copied!';
    setTimeout(() => {
      button.textContent = '📋';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
});
// Initialize Game UI with initial state
// In the initializeGameUI function:
// In the initializeGameUI function:
function updateGameState(gameData) {
  // Update board
  renderBoard();
  
  // Update status
  if (gameData.status === 'finished') {
    gameStatus.textContent = `Game over - ${gameData.winner} wins by ${gameData.result}`;
  } else if (gameData.draw_offer) {
    gameStatus.textContent = `${gameData.draw_offer} offers a draw`;
  } else {
    gameStatus.textContent = `${gameData.turn}'s turn${
        gameState.chess.in_check() ? ' (CHECK!)' : ''
      }`;
  }
  
  // Update timers based on player color
  if (gameData.white_time !== undefined && gameData.black_time !== undefined) {
    if (gameState.playerColor === 'black') {
      whiteTimeDisplay.textContent = formatTime(gameData.white_time);
      blackTimeDisplay.textContent = formatTime(gameData.black_time);
    } else {
      // Player is black - swap the times
      whiteTimeDisplay.textContent = formatTime(gameData.black_time);
      blackTimeDisplay.textContent = formatTime(gameData.white_time);
    }
  }
}
function initializeGameUI(gameData) {
  gameState.currentGame = gameData;
  gameState.chess.load(gameData.fen);

  // Update player info based on current player color
  updatePlayerInfo(gameData);

  // Create and render board
  createBoard();
  updateGameState(gameData);
  
  // Update connection status
  updateConnectionStatus();
}

// New helper function to update player info
function updatePlayerInfo(gameData) {
  const whiteUsernameElement = document.getElementById('white-username');
  const blackUsernameElement = document.getElementById('black-username');

  if (gameState.playerColor === 'black') {
    whiteUsernameElement.textContent = gameData.white_username || 'White';
    blackUsernameElement.textContent = gameData.black_username || 'Black';
    
    // Initialize timer display (normal)
    whiteTimeDisplay.textContent = formatTime(gameData.white_time || 600);
    blackTimeDisplay.textContent = formatTime(gameData.black_time || 600);
  } else {
    // Player is black - swap the display
    whiteUsernameElement.textContent = gameData.black_username || 'Black';
    blackUsernameElement.textContent = gameData.white_username || 'White';
    
    // Swap time displays
    whiteTimeDisplay.textContent = formatTime(gameData.black_time || 600);
    blackTimeDisplay.textContent = formatTime(gameData.white_time || 600);
  }
}
// Handle game updates from server

// Create Chess Board
function createBoard() {
  board.innerHTML = '';
  
  // Determine row iteration based on flipped state
  const rowStart = gameState.boardFlipped ? 7 : 0;
  const rowEnd = gameState.boardFlipped ? -1 : 8;
  const rowStep = gameState.boardFlipped ? -1 : 1;
  
  // Determine column iteration based on flipped state
  const colStart = gameState.boardFlipped ? 7 : 0;
  const colEnd = gameState.boardFlipped ? -1 : 8;
  const colStep = gameState.boardFlipped ? -1 : 1;

  for (let row = rowStart; row !== rowEnd; row += rowStep) {
    for (let col = colStart; col !== colEnd; col += colStep) {
      const square = document.createElement('div');
      square.className = `square ${(row + col) % 2 ? 'dark' : 'light'}`;
      square.dataset.row = row;
      square.dataset.col = col;
      
      const algebraic = rowColToAlgebraic(row, col);
      square.dataset.square = algebraic; // Essential for move highlighting
      
      // Add orientation class based on player color
      if (gameState.boardFlipped) {
        square.classList.add('flipped');
      }

      const piece = gameState.chess.get(algebraic);
      
      if (piece) {
        const pieceElement = document.createElement('div');
        pieceElement.className = 'piece';
        pieceElement.textContent = PIECE_SYMBOLS[piece.type] || '';
        pieceElement.dataset.piece = `${piece.color}${piece.type}`;
        square.appendChild(pieceElement);
      }
      
      board.appendChild(square);
    }
  }

  // Reapply any existing move highlights after board creation
  if (gameState.currentGame?.lastMove) {
    const { from, to } = gameState.currentGame.lastMove;
    if (from) {
      const fromSquare = document.querySelector(`[data-square="${from}"]`);
      if (fromSquare) fromSquare.classList.add('last-move-from');
    }
    if (to) {
      const toSquare = document.querySelector(`[data-square="${to}"]`);
      if (toSquare) toSquare.classList.add('last-move-to');
    }
  }
}

// Handle Board Clicks// Add these variables at the top with your other game state variables
let pendingFrom = null;
let pendingTo = null;

// Modify your handleBoardClick function to detect promotions

// Try to Make a Move
// Update tryMakeMove to accept promotion parameter

// Helper Functions
function rowColToAlgebraic(row, col) {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return file + rank;
}

function algebraicToRowCol(algebraic) {
  // No changes needed here either
  const col = algebraic.charCodeAt(0) - 97;
  const row = 8 - parseInt(algebraic[1], 10);
  return { row, col };
}

function highlightLegalMoves(square) {
  const moves = gameState.chess.moves({ square, verbose: true });
  moves.forEach(move => {
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
  
  // Auto-scroll to bottom
  moveHistory.scrollTop = moveHistory.scrollHeight;
}

function showError(message) {
  if (!errorDisplay) {
    alert(message);
    return;
  }
  
  errorDisplay.textContent = message;
  errorDisplay.style.display = 'block';
  setTimeout(() => {
    errorDisplay.style.display = 'none';
  }, 3000);
}

function updateConnectionStatus() {
  const statusElement = document.getElementById('connection-status');
  if (!statusElement) return;
  
  statusElement.textContent = gameState.isConnected 
    ? 'Online (Real-time)' 
    : 'Offline (Polling every 30s)';
  statusElement.className = gameState.isConnected ? 'online' : 'offline';
}

// Fallback Functions
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

// Game Actions
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

// Handle draw offers
function handleDrawOffer(offer) {
  if (confirm(`${offer.player} offers a draw. Accept?`)) {
    socket.emit('acceptDraw', { gameCode: gameState.gameCode });
  } else {
    socket.emit('declineDraw', { gameCode: gameState.gameCode });
  }
}

// Handle game over
function handleGameOver(result) {
  let message = `Game over - ${result.winner} wins by ${result.reason}`;
  if (result.reason === 'draw') {
    message = 'Game ended in a draw';
  }
  showFinalResult(result);
  
  //alert(message);
  gameStatus.textContent = message;
}
// Add this listener in initGame():

// Update the timerUpdate listener to handle swapped times:
socket.on('timerUpdate', ({ whiteTime, blackTime }) => {
  if (gameState.playerColor === 'black') {
    whiteTimeDisplay.textContent = formatTime(whiteTime);
    blackTimeDisplay.textContent = formatTime(blackTime);
  } else {
    // Player is black - swap the times
    whiteTimeDisplay.textContent = formatTime(blackTime);
    blackTimeDisplay.textContent = formatTime(whiteTime);
  }
});

  // Listen for notifications from the server
socket.on('notification', (data) => {
  switch(data.type) {
    case 'role-assignment':
      // For the player who just joined
      showNotification(`You are playing as ${data.role.toUpperCase()}. ${data.message}`);
     // updatePlayerRole(data.role); // Update UI to show their role
      break;
      
    case 'game-start':
      // For both players when game begins
      showNotification(data.message);
      removeWaitingOverlay();
      //enableChessBoard(); // Enable the board for play
      break;
      
    case 'opponent-connected':
      // For the waiting player
      removeWaitingOverlay();
      showNotification(`Your opponent has joined! Game starting...`);
      break;
  }
});

// UI Notification Function (example)
// Animation functions
function showAnimation(type) {
  const animationContainer = document.getElementById('animation-container');
  
  // Clear any existing animations
  animationContainer.innerHTML = '';
  
  if (type === 'moneyIncrease') {
    // Create coins flying into wallet animation
    for (let i = 0; i < 10; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin-increase';
      coin.style.left = `${Math.random() * 100}%`;
      coin.style.top = `${Math.random() * 100}%`;
      animationContainer.appendChild(coin);
    }
  } 
  else if (type === 'moneyDecrease') {
    // Create coins flying out of wallet animation
    for (let i = 0; i < 10; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin-decrease';
      coin.style.left = '50%';
      coin.style.top = '50%';
      animationContainer.appendChild(coin);
    }
  }
  
  // Remove animations after 3 seconds
  setTimeout(() => {
    animationContainer.innerHTML = '';
  }, 3000);
}

// Update balance display


// Show notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'game-notification';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}
// CSS for notifications
// Handle winning the game
// Handle winning the game
socket.on('gameWon', (data) => {
  // Only show positive animation for winner

  showNotification("kaleavwib");


  //showNotification(`${data.reason} +$${data.amount}`);
});

// Handle losing the game
socket.on('gameLost', (data) => {
  // No animation or balance update for loser
  //showNotification(data.reason);
  
  // Optional: You could show a different message style
  const notification = document.createElement('div');
  notification.className = 'game-notification lost';
  notification.textContent = data.reason;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
});
// Handle balance updates (for real-time updates)
socket.on('balanceUpdate', (data) => {
  
  if (data.amountChanged > 0) {
    //showNotification(`+$${data.amountChanged}`);
  } else {
    //showNotification(`-$${Math.abs(data.amountChanged)}`);
  }
});





// Function to update bet display
function updateBetDisplay(betAmount) {
  const betElement = document.getElementById('current-bet');
  if (betElement) {
    betElement.textContent = betAmount;
    betElement.classList.add('bet-update');
    setTimeout(() => betElement.classList.remove('bet-update'), 500);
    if(!gameState.onetime){
      gameState.onetime=true;
      gameState.betam = betAmount;

    }
  }
}

// Fetch bet amount when game starts
socket.on('gameState', (gameData) => {
  if (gameData?.bet) {
    updateBetDisplay(gameData.bet);
  }
});

// Update when bet changes
socket.on('gameUpdate', (update) => {
  if (update?.gameState?.bet !== undefined) {
    updateBetDisplay(update.gameState.bet);
  }
});

// Reset when game ends
socket.on('gameOver', () => {
  updateBetDisplay(0);
});

// Initial fetch in case we missed the gameState event
async function fetchInitialBet() {
  try {
    const { data: game, error } = await supabase
      .from('chess_games')
      .select('bet')
      .eq('code', gameState.gameCode)
      .single();
      
    if (!error && game?.bet) {
      updateBetDisplay(game.bet);
    }
  } catch (err) {
    console.error("Couldn't fetch initial bet:", err);
  }
}

// Call this after game initialization
setTimeout(fetchInitialBet, 1000);
document.addEventListener('DOMContentLoaded', function() {
  // Get the back button
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

function formatBalance(amount) {
  const numericAmount = typeof amount === 'number' ? amount : 0;
  return numericAmount.toLocaleString() + ' ETB' || '0 ETB';
}
async function showFinalResult(gameData) {
  // Ensure gameData exists and has required properties
  if (!gameData) {
    console.error('showFinalResult: gameData is undefined');
    return;
  }

  const isWinner = gameData.winner === gameState.playerColor;
  const betAmount = Number(gameData.bet) || 0; // Ensure bet is a number
  
  gameResultModal.classList.add('active');
  isWinner ? showAnimation("moneyIncrease") : showAnimation("moneyDecrease");
  resultTitle.textContent = isWinner ? 'You Won!' : 'You Lost!';

  // Handle cases where reason might be missing
  const reason = gameData.reason || 'game completion';
  
  resultMessage.textContent = isWinner
    ? `You won the game by ${reason}! :)`
    : `You lost the game by ${reason} :(`;

  // Safely calculate and display amounts
  if (isWinner) {
    const winnings = gameState.betam * 1.8; // 1.8x payout for winner
    resultAmount.textContent = `+${formatBalance(winnings)}`;
  } else {
    resultAmount.textContent = `-${formatBalance(gameState.betam)}`;
  }

  resultAmount.className = isWinner ? 'result-amount win' : 'result-amount lose';

  // Reset game state if needed
  if (!isWinner && gameState.didwelose) {
    gameState.didwelose = false;
  }


}
