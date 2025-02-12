import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@0.11.0/+esm';
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
// Custom checkers implementation using chess.js as a base
class CheckersGame {
    constructor() {
      this.reset();
    }
  
    reset() {
      this.board = Array(8).fill().map(() => Array(8).fill(null));
      this.currentPlayer = 'white';
      this.gameOver = false;
      this.winner = null;
      this.pendingJumps = [];
      this.initializeBoard();
    }
  
    initializeBoard() {
      // Black pieces (top 3 rows)
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
          if ((row + col) % 2 === 1) {
            this.board[row][col] = { color: 'black', king: false };
          }
        }
      }
      
      // White pieces (bottom 3 rows)
      for (let row = 5; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if ((row + col) % 2 === 1) {
            this.board[row][col] = { color: 'white', king: false };
          }
        }
      }
    }
  
    toAlgebraic(row, col) {
      const files = 'abcdefgh';
      const ranks = '87654321';
      return files[col] + ranks[row];
    }
  
    toRowCol(algebraic) {
      const files = 'abcdefgh';
      const ranks = '87654321';
      return {
        row: ranks.indexOf(algebraic[1]),
        col: files.indexOf(algebraic[0])
      };
    }
  
    getValidMoves(from) {
      const { row, col } = this.toRowCol(from);
      const piece = this.board[row][col];
      if (!piece || piece.color !== this.currentPlayer) return [];
  
      // Check for forced captures first
      const jumps = this.getPossibleJumps(from);
      if (jumps.length > 0) {
        return jumps;
      }
  
      // Regular moves
      const moves = [];
      const directions = piece.king ? 
        [[-1,-1],[-1,1],[1,-1],[1,1]] : // King can move both directions
        piece.color === 'white' ? 
          [[-1,-1],[-1,1]] : // White moves up
          [[1,-1],[1,1]];    // Black moves down
  
      for (const [rowDir, colDir] of directions) {
        const newRow = row + rowDir;
        const newCol = col + colDir;
        
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
          const to = this.toAlgebraic(newRow, newCol);
          if (!this.board[newRow][newCol]) {
            moves.push({ from, to });
          }
        }
      }
  
      return moves;
    }
  
    getPossibleJumps(from) {
      const { row, col } = this.toRowCol(from);
      const piece = this.board[row][col];
      if (!piece) return [];
  
      const jumps = [];
      const directions = piece.king ? 
        [[-1,-1],[-1,1],[1,-1],[1,1]] : // King can jump both directions
        piece.color === 'white' ? 
          [[-1,-1],[-1,1]] : // White jumps up
          [[1,-1],[1,1]];    // Black jumps down
  
      for (const [rowDir, colDir] of directions) {
        const jumpRow = row + rowDir * 2;
        const jumpCol = col + colDir * 2;
        
        if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
          const middleRow = row + rowDir;
          const middleCol = col + colDir;
          const middlePiece = this.board[middleRow][middleCol];
          const jumpSquare = this.toAlgebraic(jumpRow, jumpCol);
          
          if (!this.board[jumpRow][jumpCol] && 
              middlePiece && 
              middlePiece.color !== piece.color) {
            jumps.push({
              from,
              to: jumpSquare,
              capture: this.toAlgebraic(middleRow, middleCol)
            });
          }
        }
      }
      
      return jumps;
    }
  
    move(from, to) {
      const { row: fromRow, col: fromCol } = this.toRowCol(from);
      const { row: toRow, col: toCol } = this.toRowCol(to);
      const piece = this.board[fromRow][fromCol];
      
      if (!piece || piece.color !== this.currentPlayer) {
        return false;
      }
  
      // Check if this is part of a jump sequence
      if (this.pendingJumps.length > 0) {
        const jump = this.pendingJumps.find(j => j.to === to);
        if (!jump) return false;
        
        // Execute the jump
        this.board[toRow][toCol] = {...piece};
        this.board[fromRow][fromCol] = null;
        
        // Remove captured piece
        const { row: capRow, col: capCol } = this.toRowCol(jump.capture);
        this.board[capRow][capCol] = null;
        
        // Check for promotion
        if ((piece.color === 'white' && toRow === 0) || 
            (piece.color === 'black' && toRow === 7)) {
          this.board[toRow][toCol].king = true;
        }
        
        // Check for additional jumps
        const nextJumps = this.getPossibleJumps(to);
        if (nextJumps.length > 0) {
          this.pendingJumps = nextJumps;
          return true;
        }
        
        this.pendingJumps = [];
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.checkGameOver();
        return true;
      }
      
      // Regular move
      const moves = this.getValidMoves(from);
      const validMove = moves.some(m => m.to === to);
      if (!validMove) return false;
      
      this.board[toRow][toCol] = {...piece};
      this.board[fromRow][fromCol] = null;
      
      // Check for promotion
      if ((piece.color === 'white' && toRow === 0) || 
          (piece.color === 'black' && toRow === 7)) {
        this.board[toRow][toCol].king = true;
      }
      
      this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
      this.checkGameOver();
      return true;
    }
  
    checkGameOver() {
      // Check if current player has no valid moves
      let hasValidMoves = false;
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (this.board[row][col]?.color === this.currentPlayer) {
            const algebraic = this.toAlgebraic(row, col);
            if (this.getValidMoves(algebraic).length > 0) {
              hasValidMoves = true;
              break;
            }
          }
        }
        if (hasValidMoves) break;
      }
      
      if (!hasValidMoves) {
        this.gameOver = true;
        this.winner = this.currentPlayer === 'white' ? 'black' : 'white';
      }
    }
  
    getState() {
      return {
        board: this.board,
        currentPlayer: this.currentPlayer,
        gameOver: this.gameOver,
        winner: this.winner,
        pendingJumps: this.pendingJumps
      };
    }
  
    loadState(state) {
      this.board = state.board;
      this.currentPlayer = state.currentPlayer;
      this.gameOver = state.gameOver;
      this.winner = state.winner;
      this.pendingJumps = state.pendingJumps || [];
    }
  }
  const gameState = {
    playerColor: 'white',
    boardFlipped: false,
    checkers: new CheckersGame(),
    currentGame: null,
    gameCode: '',
    apiBaseUrl: 'https://chess-game-production-9494.up.railway.app',
    isConnected: false,
    betam: 0,
    onetime: false,
    pendingJumps: [],
    selectedSquare: null
};
// Piece Symbols
// Replace the PIECE_SYMBOLS with SVG icons or image references

// Piece Symbols - Updated for Checkers
const PIECE_SYMBOLS = {
    'p': '○', // White pawn = white piece
    'n': '●', // Black knight = black piece (using knight as stand-in)
    'q': '♔'  // Queen = king
};
// Add these at the top with other utility functions

// Update the handleBoardClick function
function handleBoardClick(event) {
    const square = event.target.closest('.square.dark');
    if (!square) return;

    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const algebraic = gameState.checkers.toAlgebraic(row, col);
    const piece = gameState.checkers.board[row][col];

    // If in a jump sequence
    if (gameState.pendingJumps.length > 0) {
        const isValidJump = gameState.pendingJumps.some(j => j.to === algebraic);
        if (isValidJump) {
            const jump = gameState.pendingJumps.find(j => j.to === algebraic);
            if (gameState.checkers.move(jump.from, jump.to)) {
                // Check for additional jumps
                const nextJumps = gameState.checkers.getPossibleJumps(jump.to);
                if (nextJumps.length > 0) {
                    gameState.pendingJumps = nextJumps;
                    gameState.selectedSquare = jump.to;
                    renderBoard();
                    showNotification("You must continue jumping!");
                    return;
                }
                
                // No more jumps - send move to server
                sendMoveToServer(jump.from, jump.to);
                gameState.pendingJumps = [];
                gameState.selectedSquare = null;
                renderBoard();
            }
        } else {
            showError("You must complete the jump sequence!");
        }
        return;
    }

    // Normal move logic
    if (gameState.selectedSquare) {
        tryMakeMove(gameState.selectedSquare, algebraic);
    } else {
        // Select a piece if it's the player's turn and color
        if (piece && piece.color === gameState.playerColor) {
            gameState.selectedSquare = algebraic;
            renderBoard();
        }
    }
}

function tryMakeMove(from, to) {
    const moveResult = gameState.checkers.move(from, to);
    if (moveResult) {
        if (gameState.checkers.pendingJumps.length > 0) {
            // There are more jumps available
            gameState.pendingJumps = gameState.checkers.pendingJumps;
            gameState.selectedSquare = to;
            renderBoard();
            showNotification("You must continue jumping!");
        } else {
            // Regular move completed
            sendMoveToServer(from, to);
            gameState.selectedSquare = null;
            renderBoard();
        }
    } else {
        showError("Invalid move");
    }
}

function sendMoveToServer(from, to) {
    socket.emit('move', {
        gameCode: gameState.gameCode,
        from,
        to,
        player: gameState.playerColor
    });
}
function endTurn(from, to) {
    // Send move to server
    socket.emit('move', {
        gameCode: gameState.gameCode,
        from,
        to,
        player: gameState.playerColor
    });

    renderBoard();
}
function handleGameUpdate(update) {
    if (!update || !update.gameState) return;
    
    gameState.currentGame = update.gameState;
    gameState.checkers.loadState(update.gameState.state);
    
    // Clear highlights
    document.querySelectorAll('.selected, .highlight').forEach(el => {
        el.classList.remove('selected', 'highlight');
    });
    
    // Highlight last move
    if (update.move) {
        const { row: fromRow, col: fromCol } = gameState.checkers.toRowCol(update.move.from);
        const fromSquare = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
        if (fromSquare) fromSquare.classList.add('last-move-from');
        
        const { row: toRow, col: toCol } = gameState.checkers.toRowCol(update.move.to);
        const toSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
        if (toSquare) toSquare.classList.add('last-move-to');
    }
    
    updateGameState(update.gameState);
    renderBoard();
}

function updateGameState(gameData) {
    // Update turn display
    const turnDisplay = document.getElementById('turn-display');
    if (turnDisplay) {
        turnDisplay.textContent = `Current turn: ${gameData.turn}`;
        turnDisplay.className = gameData.turn === 'white' ? 'white-turn' : 'black-turn';
    }
    
    // Update timer if available
    if (gameData.white_time !== undefined && gameData.black_time !== undefined) {
        whiteTimeDisplay.textContent = formatTime(gameData.white_time);
        blackTimeDisplay.textContent = formatTime(gameData.black_time);
    }
    
    // Check for game over
    if (gameData.status === 'finished') {
        handleGameOver({
            winner: gameData.winner,
            reason: gameData.result
        });
    }
}
function renderBoard() {
    board.innerHTML = '';
    
    // Determine if we need to flip the board
    const rows = gameState.boardFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const cols = gameState.boardFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    
    for (const row of rows) {
        for (const col of cols) {
            const square = document.createElement('div');
            square.className = (row + col) % 2 === 0 ? 'square light' : 'square dark';
            square.dataset.row = row;
            square.dataset.col = col;
            square.dataset.square = gameState.checkers.toAlgebraic(row, col);
            
            // Highlight selected square
            if (gameState.selectedSquare === gameState.checkers.toAlgebraic(row, col)) {
                square.classList.add('selected');
            }
            
            // Highlight possible moves
            if (gameState.selectedSquare) {
                const moves = gameState.checkers.getValidMoves(gameState.selectedSquare);
                if (moves.some(m => m.to === gameState.checkers.toAlgebraic(row, col))) {
                    square.classList.add('highlight');
                }
            }
            
            // Only render pieces on dark squares
            if ((row + col) % 2 === 1) {
                const piece = gameState.checkers.board[row][col];
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.className = `piece ${piece.color}`;
                    pieceElement.textContent = piece.king ? '♔' : '●';
                    
                    if (piece.king) {
                        pieceElement.classList.add('king');
                    }
                    
                    square.appendChild(pieceElement);
                }
            }
            
            board.appendChild(square);
        }
    }
}

// Render Board - Updated for Checkers

// Initialize the game properly
async function initGame() {
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');
    gameState.playerColor = params.get('color') || 'white';
    gameState.boardFlipped = gameState.playerColor === 'black';

    // Initialize the checkers game
    gameState.checkers = new CheckersGame();
    
    // Create and render the board
    createBoard();
    renderBoard();

    // Rest of initialization code...
    const gameCodeElement = document.getElementById('game-code-text');
    if (gameCodeElement) {
        gameCodeElement.textContent = gameState.gameCode || 'Not set';
    }

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
        socket.on('gameOver', handleGameOver);
        
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

        socket.on('gameReady', (data) => {
            const notification = 'Both players connected! Game is starting...';
            showNotification(notification, 5000);
            displayAlert("White must move first!", 'warning');
            initGame();
            playSound('join');
            gameStatus.textContent = 'Game in progress';
        });
        
        setTimeout(() => {
            if (!gameState.isConnected) {
                fetchInitialGameState();
            }
        }, 2000);
        
        setInterval(fetchGameState, 30000);
        
    } catch (error) {
        console.error('Init error:', error);
        showError('Error loading game');
    }

}
function handleGameUpdate(update) {
    if (!update || !update.gameState) return;
    
    document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
        el.classList.remove('last-move-from', 'last-move-to');
    });
    
    gameState.currentGame = update.gameState;
    gameState.checkers.load(update.gameState.state); // Changed from fen to state
    gameState.turn = update.gameState.turn;
    
    updatePlayerInfo(update.gameState);
    
    if (update.move) {
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
  //initGame();
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


// Create Board - Updated for Checkers






// Handle Jump Sequence - Specific to Checkers
function handleJumpSequence(toAlgebraic) {
    const fromSquare = gameState.pendingJumps[0].from;
    const move = gameState.checkers.move({ from: fromSquare, to: toAlgebraic });
    
    if (move) {
        // Check if more jumps are available
        const nextJumps = gameState.checkers.getJumpMoves(toAlgebraic);
        
        if (nextJumps.length > 0) {
            // Continue jump sequence
            gameState.pendingJumps = nextJumps;
            gameState.selectedSquare = toAlgebraic;
            highlightSquare(...algebraicToRowCol(toAlgebraic));
            highlightLegalMoves(toAlgebraic);
        } else {
            // End of jump sequence
            gameState.pendingJumps = [];
            gameState.selectedSquare = null;
            clearHighlights();
            
            // Send move to server
            const moveData = {
                gameCode: gameState.gameCode,
                from: fromSquare,
                to: toAlgebraic,
                player: gameState.playerColor
            };
            
            if (gameState.isConnected) {
                socket.emit('move', moveData);
            } else {
                fetch(`${gameState.apiBaseUrl}/api/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(moveData)
                });
            }
        }
        
        renderBoard();
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
// Highlight Legal Moves - Updated for Checkers
function highlightLegalMoves(square) {
    const moves = gameState.checkers.getValidMoves(square);
    moves.forEach(move => {
        const { row, col } = algebraicToRowCol(move.to);
        highlightSquare(row, col);
    });
}

// Update Game State - Updated for Checkers

// Try Make Move - Updated for Checkers
function initializeGameUI(gameData) {
    gameState.currentGame = gameData;
    gameState.checkers = new Draughts(gameData.state || 'start');
    updatePlayerInfo(gameData);
    createBoard();
    updateGameState(gameData);
    updateConnectionStatus();
}

function handleMove(source, target) {
    // Checkers move logic here
    if (gameState.pendingJumps.length > 0) {
        // Handle jump sequence
        const isValidJump = gameState.pendingJumps.some(j => j.to === target);
        if (!isValidJump) {
            showError("You must complete the jump sequence!");
            return 'snapback';
        }
        // Process the jump...
    } else {
        // Normal move
        if (!isValidMove(source, target)) {
            return 'snapback';
        }
        // Process the move...
    }
    
    // Emit move to server
    socket.emit('move', {
        gameCode: gameState.gameCode,
        from: source,
        to: target,
        player: gameState.playerColor
    });
    
    return true;
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
// Initialize Game UI - Updated for Checkers

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


// Handle Board Clicks// Add these variables at the top with your other game state variables
let pendingFrom = null;
let pendingTo = null;

// Modify your handleBoardClick function to detect promotions

// Try to Make a Move
// Update tryMakeMove to accept promotion parameter

// Helper Functions
function algebraicToRowCol(algebraic) {
    const col = algebraic.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = 8 - parseInt(algebraic[1]);
    return { row, col };
  }
  
  function rowColToAlgebraic(row, col) {
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    return file + rank;
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
  showFinalResult({
    winner: gameState.playerColor,
    reason: data.message,
    bet: data.bet
  });
  
  // Update UI
  gameStatus.textContent = `You won! ${data.message}`;
});

socket.on('gameLost', (data) => {
  showFinalResult({
    winner: gameState.playerColor === 'white' ? 'black' : 'white',
    reason: data.message,
    bet: data.bet
  });
  
  // Update UI
  gameStatus.textContent = `You lost! ${data.message}`;
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
function showFinalResult(result) {
  if (!result) return;

  const isWinner = result.winner === gameState.playerColor;
  const betAmount = Number(result.bet) || 0;
  
  gameResultModal.classList.add('active');
  
  resultTitle.textContent = isWinner ? 'You Won!' : 'You Lost!';
  resultMessage.textContent = result.reason || 
    (isWinner ? 'You won the game!' : 'You lost the game');

  if (betAmount > 0) {
    if (isWinner) {
      const winnings = betAmount * 1.8; // 1.8x payout
      resultAmount.textContent = `+${formatBalance(winnings)}`;
    } else {
      resultAmount.textContent = `-${formatBalance(betAmount)}`;
    }
  } else {
    resultAmount.textContent = '';
  }

  resultAmount.className = isWinner ? 'result-amount win' : 'result-amount lose';
}
// The rest of your functions (rowColToAlgebraic, algebraicToRowCol, highlightSquare, 
// clearHighlights, formatTime, playSound, addMoveToHistory, showError, etc.) 
// can remain the same as they're generic utility functions
function createBoard() {
    board.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = (row + col) % 2 === 0 ? 'square light' : 'square dark';
            square.dataset.row = row;
            square.dataset.col = col;
            square.dataset.square = gameState.checkers.toAlgebraic(row, col);
            
            // Only add pieces to dark squares (checkers rules)
            if ((row + col) % 2 === 1) {
                const piece = gameState.checkers.chess.get(gameState.checkers.toAlgebraic(row, col));
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
                    pieceElement.textContent = PIECE_SYMBOLS[piece.type];
                    square.appendChild(pieceElement);
                }
            }
            
            board.appendChild(square);
        }
    }
    
    // Ensure the board is clickable
    board.addEventListener('click', handleBoardClick);
}




document.addEventListener('DOMContentLoaded', () => {
    initGame();
    
    // Set up socket listeners
    socket.on('connect', () => {
        gameState.isConnected = true;
        updateConnectionStatus();
    });
    
    socket.on('disconnect', () => {
        gameState.isConnected = false;
        updateConnectionStatus();
    });
});
// Initialize Game - Same as before but with checkers

// Add this new handler for multiple jumps
socket.on('mustContinueJump', (data) => {
    gameState.pendingJumps = data.possibleJumps;
    gameState.selectedSquare = data.from;
    highlightSquare(...algebraicToRowCol(data.from));
    highlightLegalMoves(data.from);
    showNotification('You must continue jumping!');
});

// The rest of your existing code (event listeners, helper functions, etc.) can remain the same
// Just make sure to update any chess-specific terminology to checkers where appropriate

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    board.addEventListener('click', handleBoardClick);
    
    socket.on('connect', () => {
        gameState.isConnected = true;
        updateConnectionStatus();
    });
    
    socket.on('disconnect', () => {
        gameState.isConnected = false;
        updateConnectionStatus();
    });
});
