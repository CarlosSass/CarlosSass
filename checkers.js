import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { Draughts } from 'https://cdn.jsdelivr.net/npm/draughts.js@1.0.1/+esm';
import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';


// DOM Elements (same as before)
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

// Initialize Supabase (same as before)
const supabase = createClient(
    'https://evberyanshxxalxtwnnc.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw'
);

// Initialize Socket.IO (same as before)
const socket = io('https://chess-game-production-9494.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ['websocket'],
  secure: true,
  withCredentials: true
});

// Game State - Updated for Checkers
const gameState = {
  playerColor: 'white',
  boardFlipped: false,
  checkers: new Checkers(), // Changed from Chess to Checkers
  selectedSquare: null,
  currentGame: null,
  gameCode: '',
  apiBaseUrl: 'https://chess-game-production-9494.up.railway.app',
  isConnected: false,
  betam: 0,
    checkers: new Draughts(),
  onetime: false,
  pendingJumps: [] // Added for checkers jump sequences
};

// Piece Symbols - Updated for Checkers
const PIECE_SYMBOLS = {
    // White pieces
    'w': '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="22.5" r="20" fill="#ffffff" stroke="#000000" stroke-width="2"/></svg>',
    'W': '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="22.5" r="20" fill="#ffffff" stroke="#000000" stroke-width="2"/><circle cx="22.5" cy="22.5" r="15" fill="#ffffff" stroke="#000000" stroke-width="1"/></svg>',
    
    // Black pieces
    'b': '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="22.5" r="20" fill="#333333" stroke="#ffffff" stroke-width="2"/></svg>',
    'B': '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="22.5" r="20" fill="#333333" stroke="#ffffff" stroke-width="2"/><circle cx="22.5" cy="22.5" r="15" fill="#333333" stroke="#ffffff" stroke-width="1"/></svg>'
};

// Render Board - Updated for Checkers
function renderBoard() {
    document.querySelectorAll('.piece').forEach(p => p.remove());
    
    if (gameState.checkers.history().length > 0) {
        const lastMove = gameState.checkers.history()[gameState.checkers.history().length - 1];
        if (lastMove.captured) {
            playSound('capture');
        } else {
            playSound('move');
        }
    }
    
    // Get board state from checkers.js
    const boardState = gameState.checkers.board();
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Only render on dark squares for checkers
            if ((row + col) % 2 === 1) {
                const algebraic = rowColToAlgebraic(row, col);
                const piece = boardState[row][col];
                
                if (piece) {
                    const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                    const pieceElement = document.createElement('div');
                    pieceElement.className = 'piece';
                    
                    // Get the correct SVG based on piece type
                    pieceElement.innerHTML = PIECE_SYMBOLS[piece.type] || '';
                    
                    // Add color class for styling
                    pieceElement.classList.add(piece.color === 'w' ? 'white-piece' : 'black-piece');
                    if (piece.king) {
                        pieceElement.classList.add('king');
                    }
                    
                    square.appendChild(pieceElement);
                }
            }
        }
    }
}

// Handle Game Update - Updated for Checkers
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

// Create Board - Updated for Checkers
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
            // Only create squares on dark squares for checkers
            if ((row + col) % 2 === 1) {
                const square = document.createElement('div');
                square.className = `square dark`; // All playable squares are dark in checkers
                square.dataset.row = row;
                square.dataset.col = col;
                
                const algebraic = rowColToAlgebraic(row, col);
                square.dataset.square = algebraic;
                
                if (gameState.boardFlipped) {
                    square.classList.add('flipped');
                }

                board.appendChild(square);
            } else {
                // Light squares (not playable in checkers)
                const square = document.createElement('div');
                square.className = `square light`;
                square.dataset.row = row;
                square.dataset.col = col;
                board.appendChild(square);
            }
        }
    }

    renderBoard();
}

// Handle Board Click - Updated for Checkers
function handleBoardClick(event) {
    if (!gameState.currentGame || gameState.currentGame.status === 'finished') return;
    
    const square = event.target.closest('.square');
    if (!square || !square.classList.contains('dark')) return; // Only allow clicks on dark squares
    
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const algebraic = rowColToAlgebraic(row, col);
    
    // Check if we're in a jump sequence
    if (gameState.pendingJumps.length > 0) {
        handleJumpSequence(algebraic);
        return;
    }
    
    if (gameState.selectedSquare) {
        // Try to make a move
        tryMakeMove(gameState.selectedSquare, algebraic);
        gameState.selectedSquare = null;
        clearHighlights();
    } else {
        // Select a piece
        const piece = gameState.checkers.get(algebraic);
        if (piece && piece.color[0] === gameState.playerColor[0]) {
            gameState.selectedSquare = algebraic;
            highlightSquare(row, col);
            highlightLegalMoves(algebraic);
        }
    }
}

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

// Try Make Move - Updated for Checkers
async function tryMakeMove(from, to) {
    try {
        const move = gameState.checkers.move({ from, to });
        
        if (!move) {
            // Check if it's a jump move
            const jumps = gameState.checkers.getJumpMoves(from);
            if (jumps.some(j => j.to === to)) {
                gameState.pendingJumps = jumps.filter(j => j.from === from);
                return handleJumpSequence(to);
            }
            return;
        }
        
        // Check if this move leads to a jump sequence
        const nextJumps = gameState.checkers.getJumpMoves(to);
        if (nextJumps.length > 0) {
            gameState.pendingJumps = nextJumps;
            gameState.selectedSquare = to;
            highlightSquare(...algebraicToRowCol(to));
            highlightLegalMoves(to);
            return;
        }
        
        renderBoard();
        
        const moveData = {
            gameCode: gameState.gameCode,
            from,
            to,
            player: gameState.playerColor
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
        if (gameState.currentGame?.state) {
            gameState.checkers.load(gameState.currentGame.state);
            renderBoard();
        }
        showError(error.message);
    }
}

// Highlight Legal Moves - Updated for Checkers
function highlightLegalMoves(square) {
    const moves = gameState.checkers.getValidMoves(square);
    moves.forEach(move => {
        const { row, col } = algebraicToRowCol(move.to);
        highlightSquare(row, col);
    });
}

// Update Game State - Updated for Checkers
function updateGameState(gameData) {
    renderBoard();
    
    if (gameData.status === 'finished') {
        gameStatus.textContent = `Game over - ${gameData.winner} wins by ${gameData.result}`;
    } else if (gameData.draw_offer) {
        gameStatus.textContent = `${gameData.draw_offer} offers a draw`;
    } else {
        gameStatus.textContent = `${gameData.turn}'s turn`;
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

// Initialize Game UI - Updated for Checkers
function initializeGameUI(gameData) {
    gameState.currentGame = gameData;
    gameState.checkers.load(gameData.state); // Changed from fen to state

    updatePlayerInfo(gameData);
    createBoard();
    updateGameState(gameData);
    updateConnectionStatus();
}

// The rest of your functions (rowColToAlgebraic, algebraicToRowCol, highlightSquare, 
// clearHighlights, formatTime, playSound, addMoveToHistory, showError, etc.) 
// can remain the same as they're generic utility functions

// Initialize Game - Same as before but with checkers
async function initGame() {
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');
    gameState.playerColor = params.get('color') || 'white';
    gameState.boardFlipped = gameState.playerColor === 'black';

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
    
    setupReconnectionUI();
}

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
