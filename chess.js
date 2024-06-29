import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@0.11.0/+esm';
import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';

// DOM Elements
const board = document.getElementById('board');
const gameStatus = document.getElementById('game-status');
const whiteTimeDisplay = document.getElementById('white-time');
const blackTimeDisplay = document.getElementById('black-time');
const whiteUsername = document.getElementById('white-username');
const blackUsername = document.getElementById('black-username');
const moveHistory = document.getElementById('move-history');
const errorDisplay = document.getElementById('error-message');

// Initialize Supabase (for authentication and persistence)
const supabase = createClient(
    'https://evberyanshxxalxtwnnc.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw'
  );

// Initialize Socket.IO
const socket = io('http://localhost:3000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000
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
  apiBaseUrl: 'http://localhost:3000',
  isConnected: false
  
};

// Piece Symbols
const PIECE_SYMBOLS = {
    // White pieces (filled symbols)
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    // Black pieces (outlined symbols)
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };

// Sound Effects
const sounds = {
  move: new Audio('http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3'),
  capture: new Audio('http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3'),
  check: new Audio('http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/notify.mp3'),
  join: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-positive-interface-beep-221.mp3')
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
function showPromotionDialog(color) {
  const dialog = document.getElementById('promotion-dialog');
  const options = dialog.querySelectorAll('.promotion-option');
  
  // Set the appropriate pieces based on color
  options.forEach(option => {
    const pieceType = option.dataset.piece;
    const symbol = color === 'w' 
      ? PIECE_SYMBOLS[pieceType.toUpperCase()]
      : PIECE_SYMBOLS[pieceType.toLowerCase()];
    option.textContent = symbol;
  });
  
  dialog.style.display = 'flex';
}

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
  }
}
// Initialize Game
async function initGame() {
  const params = new URLSearchParams(window.location.search);
  gameState.gameCode = params.get('code');
  gameState.playerColor = params.get('color') || 'white';
  gameState.boardFlipped = gameState.playerColor === 'black'; // Add this line

  
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
    socket.on('gameReady', (data) => {
      const notification = 'Both players connected! Game is starting...';
      showNotification(notification, 5000); // Show for 5 seconds
      displayAlert("White must move first!", 'warning');
      initGame();
      playSound('join'); // Play the join sound
      // Update UI to show game is ready
      gameStatus.textContent = 'Game in progress';
      
      // Enable game controls
    
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
function initializeGameUI(gameData) {
  gameState.currentGame = gameData;
  gameState.chess.load(gameData.fen);
  
  // Update player info
  whiteUsername.textContent = gameData.white_username || 'White';
  blackUsername.textContent = gameData.black_username || 'Black';
  
  // Initialize timer display
  whiteTimeDisplay.textContent = formatTime(gameData.white_time || 600);
  blackTimeDisplay.textContent = formatTime(gameData.black_time || 600);
  
  // Create and render board
  createBoard();
  updateGameState(gameData);
  
  // Update connection status
  updateConnectionStatus();
}

// Handle game updates from server
function handleGameUpdate(update) {
  if (!update || !update.gameState) return;
  
  // Always clear previous move highlights first
  document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
      el.classList.remove('last-move-from', 'last-move-to');
  });
  
  gameState.currentGame = update.gameState;
  gameState.chess.load(update.gameState.fen);
  gameState.turn = update.gameState.turn;
  
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
      
      if (update.move.captured) {
          playSound('capture');
      } else if (gameState.chess.in_check()) {
          playSound('check');
      } else {
          playSound('move');
      }
      
      addMoveToHistory(update.move);
  }
  
  updateGameState(update.gameState);
}
// Update all game state displays
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
  
  // Update timers
  if (gameData.white_time !== undefined) {
    whiteTimeDisplay.textContent = formatTime(gameData.white_time);
  }
  if (gameData.black_time !== undefined) {
    blackTimeDisplay.textContent = formatTime(gameData.black_time);
  }
  blackUsername.textContent = gameData.black_username || 'Black';

  // Highlight active player
  document.querySelector('.white-player').classList.toggle('active', gameData.turn === 'white');
  document.querySelector('.black-player').classList.toggle('active', gameData.turn === 'black');
  // In updateGameState()
document.getElementById(`${gameData.turn}-username`).classList.add('active-player');
document.getElementById(`${gameData.turn === 'white' ? 'black' : 'white'}-username`)
  .classList.remove('active-player');
}

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

  function renderBoard() {
    document.querySelectorAll('.piece').forEach(p => p.remove());
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const algebraic = rowColToAlgebraic(row, col);
            const piece = gameState.chess.get(algebraic);
            if (!piece) continue;
            
            const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            
            const pieceElement = document.createElement('div');
            pieceElement.className = 'piece';
            pieceElement.textContent = PIECE_SYMBOLS[piece.type] || '';
            pieceElement.dataset.piece = `${piece.color}${piece.type}`;

            square.appendChild(pieceElement);
        }
    }
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
function update() {
  blackUsername.textContent = gameData.black_username || 'jj';

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
  
  alert(message);
  gameStatus.textContent = message;
}
// Add this listener in initGame():
socket.on('timerUpdate', ({ whiteTime, blackTime }) => {
    whiteTimeDisplay.textContent = formatTime(whiteTime);
    blackTimeDisplay.textContent = formatTime(blackTime);
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
  if (data.animation) {
    showAnimation(data.animation);
  }
  showNotification(`${data.reason} +$${data.amount}`);
});

// Handle losing the game
socket.on('gameLost', (data) => {
  // No animation or balance update for loser
  showNotification(data.reason);
  
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
    showNotification(`+$${data.amountChanged}`);
  } else {
    showNotification(`-$${Math.abs(data.amountChanged)}`);
  }
});





// Function to update bet display
function updateBetDisplay(betAmount) {
  const betElement = document.getElementById('current-bet');
  if (betElement) {
    betElement.textContent = betAmount;
    betElement.classList.add('bet-update');
    setTimeout(() => betElement.classList.remove('bet-update'), 500);
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
  
  if (backBtn) {
      backBtn.addEventListener('click', function() {
         
          if (confirm('Are you sure you want to leave the game?')) {
             
            window.history.back();
          }
        
      });
  }
});