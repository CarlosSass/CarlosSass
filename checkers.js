import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';

// DOM Elements
const board = document.getElementById('board');
const gameStatus = document.getElementById('game-status');
const redTimeDisplay = document.getElementById('red-time');
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
    playerColor: 'red',
    boardFlipped: false,
    selectedSquare: null,
    currentGame: null,
    gameCode: '',
    apiBaseUrl: 'https://chess-game-production-9494.up.railway.app',
    isConnected: false,
    betam: 0,
    onetime: false,
    pendingMoves: [],
    mustCapture: false
};

// Piece Symbols (Checkers)
const PIECE_SYMBOLS = {
    'r': `<svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="#ff3333" stroke="#000" stroke-width="3"/>
    </svg>`,
    'R': `<svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="#ff3333" stroke="#000" stroke-width="3"/>
        <circle cx="50" cy="50" r="25" fill="#ffcccc" stroke="#000" stroke-width="2"/>
    </svg>`,
    'b': `<svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="#333" stroke="#fff" stroke-width="3"/>
    </svg>`,
    'B': `<svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="#333" stroke="#fff" stroke-width="3"/>
        <circle cx="50" cy="50" r="25" fill="#ccc" stroke="#fff" stroke-width="2"/>
    </svg>`
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
    
    socket.on('connect', () => {
        gameState.isConnected = true;
        updateConnectionStatus();
    });
    
    socket.on('disconnect', () => {
        gameState.isConnected = false;
        updateConnectionStatus();
    });
});

// Initialize Game
async function initGame() {
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');
    gameState.playerColor = params.get('color') || 'red';
    gameState.boardFlipped = gameState.playerColor === 'black';

    if (!gameState.gameCode) {
        showError('No game code provided');
        return;
    }

    try {
        socket.emit('joinGame', gameState.gameCode, 'checkers');
        showWaitingOverlay();
        
        socket.on('gameState', initializeGameUI);
        socket.on('gameUpdate', handleGameUpdate);
        socket.on('moveError', showError);
        socket.on('gameOver', handleGameOver);
        
        socket.on('playerUpdate', (data) => {
            if (gameState.currentGame) {
                if (data.color === 'red') {
                    gameState.currentGame.red_username = data.username;
                } else {
                    gameState.currentGame.black_username = data.username;
                }
                updatePlayerInfo(gameState.currentGame);
            }
        });

        socket.on('gameReady', () => {
            showNotification("Both players connected! Game is starting...", 5000);
            displayAlert("Red moves first!", 'warning');
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

// Create Checkers Board
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
            
            if (gameState.boardFlipped) {
                square.classList.add('flipped');
            }

            const piece = getPieceAtPosition(row, col);
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.className = 'piece';
                pieceElement.innerHTML = PIECE_SYMBOLS[piece] || '';
                square.appendChild(pieceElement);
            }
            
            board.appendChild(square);
        }
    }
}

// Get piece at position from game state
function getPieceAtPosition(row, col) {
    if (!gameState.currentGame?.board_state?.pieces) return null;
    const algebraic = rowColToAlgebraic(row, col);
    const piece = gameState.currentGame.board_state.pieces.find(p => p.position === algebraic);
    return piece ? (piece.isKing ? piece.color[0].toUpperCase() : piece.color[0].toLowerCase()) : null;
}

// Render Board
function renderBoard() {
    document.querySelectorAll('.piece').forEach(p => p.remove());
    
    if (gameState.currentGame?.board_state?.lastCapture) {
        playSound('capture');
    } else if (gameState.currentGame?.board_state?.lastMove) {
        playSound('move');
    }
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const algebraic = rowColToAlgebraic(row, col);
            const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            const piece = getPieceAtPosition(row, col);
            
            if (piece && square) {
                const pieceElement = document.createElement('div');
                pieceElement.className = 'piece';
                pieceElement.innerHTML = PIECE_SYMBOLS[piece] || '';
                square.appendChild(pieceElement);
            }
        }
    }
}

// Handle Board Clicks
function handleBoardClick(event) {
    if (!gameState.currentGame || gameState.currentGame.status === 'finished') return;
    
    const square = event.target.closest('.square');
    if (!square) return;
    
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const algebraic = rowColToAlgebraic(row, col);
    
    // If we have pending moves (multi-capture)
    if (gameState.pendingMoves.length > 0) {
        handlePendingMove(algebraic);
        return;
    }
    
    if (gameState.selectedSquare) {
        tryMakeMove(gameState.selectedSquare, algebraic);
        gameState.selectedSquare = null;
        clearHighlights();
    } else {
        const piece = getPieceAtPosition(row, col);
        if (piece && piece.toLowerCase() === gameState.playerColor[0]) {
            gameState.selectedSquare = algebraic;
            highlightSquare(row, col);
            highlightLegalMoves(algebraic);
        }
    }
}

// Handle pending moves (for multi-capture)
function handlePendingMove(to) {
    const move = gameState.pendingMoves.find(m => m.to === to);
    if (move) {
        tryMakeMove(move.from, move.to);
        gameState.pendingMoves = [];
    } else {
        showError('Invalid capture sequence');
        gameState.pendingMoves = [];
        clearHighlights();
    }
}

// Try to Make a Move
async function tryMakeMove(from, to) {
    try {
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
        showError(error.message);
    }
}

// Handle Game Updates
function handleGameUpdate(update) {
    if (!update || !update.gameState) return;
    
    document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
        el.classList.remove('last-move-from', 'last-move-to');
    });
    
    gameState.currentGame = update.gameState;
    
    if (update.move) {
        const { row: fromRow, col: fromCol } = algebraicToRowCol(update.move.from);
        const fromSquare = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
        if (fromSquare) fromSquare.classList.add('last-move-from');
        
        const { row: toRow, col: toCol } = algebraicToRowCol(update.move.to);
        const toSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
        if (toSquare) toSquare.classList.add('last-move-to');
        
        addMoveToHistory(update.move);
    }
    
    updateGameState(update.gameState);
}

// Update Game State
function updateGameState(gameData) {
    renderBoard();
    
    if (gameData.status === 'finished') {
        gameStatus.textContent = `Game over - ${gameData.winner} wins by ${gameData.result}`;
    } else {
        gameStatus.textContent = `${gameData.turn}'s turn`;
        
        // Check if player must capture
        if (gameData.board_state.mustCapture && 
            gameData.turn[0] === gameState.playerColor[0]) {
            gameStatus.textContent += ' (Must capture!)';
            gameState.mustCapture = true;
        } else {
            gameState.mustCapture = false;
        }
    }
    
    // Update timers
    if (gameData.red_time !== undefined && gameData.black_time !== undefined) {
        redTimeDisplay.textContent = formatTime(gameData.red_time);
        blackTimeDisplay.textContent = formatTime(gameData.black_time);
    }
}

// Highlight Legal Moves
function highlightLegalMoves(square) {
    if (!gameState.currentGame?.board_state?.legalMoves) return;
    
    const legalMoves = gameState.currentGame.board_state.legalMoves.filter(
        move => move.from === square
    );
    
    legalMoves.forEach(move => {
        const { row, col } = algebraicToRowCol(move.to);
        highlightSquare(row, col);
        
        // If this is a capture, check for subsequent captures
        if (move.captures && move.captures.length > 0) {
            const { row: capRow, col: capCol } = algebraicToRowCol(move.to);
            highlightSquare(capRow, capCol, 'capture-highlight');
        }
    });
}

// Helper Functions
function rowColToAlgebraic(row, col) {
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    return file + rank;
}

function algebraicToRowCol(algebraic) {
    const col = algebraic.charCodeAt(0) - 97;
    const row = 8 - parseInt(algebraic[1], 10);
    return { row, col };
}

function highlightSquare(row, col, type = 'highlight') {
    const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (square) square.classList.add(type);
}

function clearHighlights() {
    document.querySelectorAll('.highlight, .capture-highlight').forEach(el => {
        el.classList.remove('highlight', 'capture-highlight');
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
    
    const moveElement = document.createElement('div');
    moveElement.className = 'move';
    moveElement.textContent = `${move.from}-${move.to}`;
    
    if (move.captures && move.captures.length > 0) {
        moveElement.textContent += ` (x${move.captures.length})`;
    }
    
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
    setTimeout(() => {
        errorDisplay.style.display = 'none';
    }, 3000);
}

// Initialize Game UI
function initializeGameUI(gameData) {
    gameState.currentGame = gameData;
    createBoard();
    updateGameState(gameData);
    updateConnectionStatus();
    removeWaitingOverlay();
}

// Update Player Info
function updatePlayerInfo(gameData) {
    const redUsernameElement = document.getElementById('red-username');
    const blackUsernameElement = document.getElementById('black-username');

    redUsernameElement.textContent = gameData.red_username || 'Red';
    blackUsernameElement.textContent = gameData.black_username || 'Black';
    
    if (gameData.red_time !== undefined) {
        redTimeDisplay.textContent = formatTime(gameData.red_time);
    }
    if (gameData.black_time !== undefined) {
        blackTimeDisplay.textContent = formatTime(gameData.black_time);
    }
}

// Game Over Handling
function handleGameOver(result) {
    let message = `Game over - ${result.winner} wins by ${result.reason}`;
    if (result.reason === 'draw') {
        message = 'Game ended in a draw';
    }
    showFinalResult(result);
    gameStatus.textContent = message;
}

function showFinalResult(result) {
    if (!result) return;

    const isWinner = result.winner === gameState.playerColor;
    const betAmount = Number(result.bet) || 0;
    
    gameResultModal.classList.add('active');
    
    resultTitle.textContent = isWinner ? 'You Won!' : 'You Lost!';
    resultMessage.textContent = result.reason || 
        (isWinner ? 'You won the game!' : 'You lost the game');

    if (isWinner) {
        const winnings = gameState.betam * 1.8; // 1.8x payout for winner
        resultAmount.textContent = `+${formatBalance(winnings)}`;
    } else {
        resultAmount.textContent = `-${formatBalance(gameState.betam)}`;
    }

    resultAmount.className = isWinner ? 'result-amount win' : 'result-amount lose';
}

// Utility Functions
function formatBalance(amount) {
    const numericAmount = typeof amount === 'number' ? amount : 0;
    return numericAmount.toLocaleString() + ' ETB' || '0 ETB';
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

// Reconnection Logic
function setupReconnectionUI() {
    const reconnectBtn = document.createElement('button');
    reconnectBtn.id = 'reconnect-btn';
    reconnectBtn.textContent = 'Reconnect Now';
    reconnectBtn.style.display = 'none';
    reconnectBtn.addEventListener('click', () => {
        socket.connect();
        reconnectBtn.style.display = 'none';
    });
    
    document.body.appendChild(reconnectBtn);

    socket.on('connect_error', () => {
        reconnectBtn.style.display = 'block';
    });
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

// Back button functionality
document.getElementById('back-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the game?')) {
        window.history.back();
    }
});

resultCloseBtn.addEventListener('click', () => {
    gameResultModal.classList.remove('active');
    window.location.href = '/';
});
