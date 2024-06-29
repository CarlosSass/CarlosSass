import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js/+esm';
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

// --- Configuration ---
const config = {
    supabaseUrl: "https://evberyanshxxalxtwnnc.supabase.co",
    supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw",
    socketUrl: 'http://localhost:3000',
    timeControl: 10 // minutes per player
};

// --- Supabase Setup ---
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- DOM Elements ---
const elements = {
    board: document.getElementById('chessboard'),
    status: document.getElementById('status'),
    username: document.getElementById('username'),
    opponentUsername: document.getElementById('opponent-username'),
    balance: document.getElementById('balance'),
    gameOverModal: document.getElementById('game-over-modal'),
    gameOverMessage: document.getElementById('game-over-message'),
    closeModalBtn: document.getElementById('close-modal'),
    gameCodeDisplay: document.getElementById('game-code'),
    turnIndicator: document.getElementById('turn-indicator'),
    turnColor: document.getElementById('turn-color'),
    resignButton: document.getElementById('resign-button'),
    offerDrawButton: document.getElementById('offer-draw-button'),
    moveList: document.getElementById('move-list'),
    drawOfferModal: document.getElementById('draw-offer-modal'),
    closeDrawModalBtn: document.getElementById('close-draw-modal'),
    acceptDrawButton: document.getElementById('accept-draw-button'),
    rejectDrawButton: document.getElementById('reject-draw-button'),
    waitingPage: document.getElementById('waiting-page'),
    gameArea: document.querySelector('.game-area'),
    drawOfferMessage: document.getElementById('draw-offer-message'),
    playerimeDisplay: document.getElementById('player-time'),
    opponentimeDisplay: document.getElementById('opponent-time'),
    requestTakebackBtn: document.getElementById('request-takeback'),
    spectatorNotice: document.getElementById('spectator-notice'),
    gameControls: document.getElementById('game-controls'),
    rematchButton: document.getElementById('rematch-button')
};

// Check if board element exists
if (!elements.board) {
    console.error('Chessboard element not found in DOM');
    displayAlert('Chessboard element not found', 'error');
}

// --- Socket.IO Connection ---
const socket = io(config.socketUrl, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

// --- Game State ---
const phone = localStorage.getItem('phone');
let user = {};
let gameCode = '';
let color = '';
let game = new Chess();
let selectedSquare = null;
let possibleMoves = [];
let gameChannel = null;
let moveHistory = [];
let opponentOfferedDraw = false;
let isWaitingForOpponent = false;
let opponentPhone = null;
let isRendering = false;
let isSpectator = false;
let betAmount = 0;

// --- Sound Effects ---
const sounds = {
    move: new Audio('http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3'),
    capture: new Audio('http://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3'),
    check: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3'),
    notify: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/notify.mp3')
};

// --- Utility Functions ---
function displayAlert(message, type = 'info') {
    const alertBox = document.createElement('div');
    alertBox.className = `alert ${type}`;
    alertBox.textContent = message;
    document.body.appendChild(alertBox);
    setTimeout(() => alertBox.remove(), 3000);
}

function getSquareFromPOV(square, isWhitePerspective) {
    if (!square || typeof square !== 'string') return null;
    if (isWhitePerspective) return square;
    
    try {
        const file = square[0];
        const rank = square[1];
        const flippedFile = String.fromCharCode(97 + (104 - file.charCodeAt(0)));
        const flippedRank = 9 - parseInt(rank);
        return flippedFile + flippedRank;
    } catch (error) {
        console.error('Error flipping square:', error);
        return null;
    }
}

function getPieceSymbol(piece) {
    const symbols = {
        p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
        P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
    };
    return symbols[piece.color === 'w' ? piece.type.toUpperCase() : piece.type];
}

function playSound(sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.log("Audio play failed:", e));
}

// --- Time Management ---
function updateTimeDisplay(playerType, timeSeconds) {
    const minutes = Math.floor(timeSeconds / 60);
    const seconds = timeSeconds % 60;
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (playerType === 'player') {
        if (elements.playerimeDisplay) {
            elements.playerimeDisplay.textContent = formattedTime;
            elements.playerimeDisplay.className = timeSeconds < 30 ? 'time-low' : '';
        }
    } else {
        if (elements.opponentimeDisplay) {
            elements.opponentimeDisplay.textContent = formattedTime;
            elements.opponentimeDisplay.className = timeSeconds < 30 ? 'time-low' : '';
        }
    }
}

// --- Move Handling ---
async function makeMove(from, to, promotion = 'q') {
    try {
        if (moveHistory.length === 0 && game.turn() !== 'w') {
            displayAlert("White must move first!", 'warning');
            return;
        }

        const move = game.move({
            from: from,
            to: to,
            promotion: promotion
        });

        if (!move) {
            displayAlert('Invalid move', 'warning');
            return;
        }

        moveHistory.push({
            from: move.from,
            to: move.to,
            san: move.san,
            promotion: move.promotion
        });
        updateMoveList(move);

        if (move.captured) {
            playSound(sounds.capture);
        } else {
            playSound(sounds.move);
        }

        highlightLastMove(move.from, move.to);

        socket.emit('make_move', {
            gameCode: gameCode,
            move: {
                from: from,
                to: to,
                promotion: move.promotion
            },
            fen: game.fen(),
            turn: game.turn() === 'w' ? 'white' : 'black',
            moves: moveHistory
        });

        const { error: updateError } = await supabase
            .from('chess_games')
            .update({
                fen: game.fen(),
                moves: moveHistory,
                turn: game.turn() === 'w' ? 'white' : 'black',
                updated_at: new Date().toISOString()
            })
            .eq('code', gameCode);

        if (updateError) {
            console.error('Error updating game state:', updateError);
            game.undo();
            moveHistory.pop();
            renderFullBoard(game.board());
            return;
        }

        selectedSquare = null;
        possibleMoves = [];
        renderFullBoard(game.board());
        checkGameStatus();

    } catch (error) {
        console.error('Error making move:', error);
        displayAlert('Failed to make move', 'error');
    }
}

// --- Move List Functions ---
function updateMoveList(move) {
    const listItem = document.createElement('li');
    const moveNumber = Math.floor(moveHistory.length / 2) + 1;
    const turn = moveHistory.length % 2 === 0 ? `${moveNumber}.` : '';
    
    listItem.innerHTML = `${turn} ${move.san}`;
    
    if (moveHistory.length > 0 && move === moveHistory[moveHistory.length - 1]) {
        listItem.classList.add('current-move');
    }
    
    elements.moveList.appendChild(listItem);
    elements.moveList.scrollTop = elements.moveList.scrollHeight;
}

// --- Highlighting Functions ---
function highlightLastMove(from, to) {
    document.querySelectorAll('.last-move').forEach(el => {
        el.classList.remove('last-move');
    });

    const fromEl = document.querySelector(`.square[data-square="${from}"]`);
    const toEl = document.querySelector(`.square[data-square="${to}"]`);
    
    if (fromEl) fromEl.classList.add('last-move');
    if (toEl) toEl.classList.add('last-move');
}

function clearHighlights() {
    document.querySelectorAll('.selected, .possible-move, .capture-move').forEach(el => {
        el.classList.remove('selected', 'possible-move', 'capture-move');
    });
}

// --- User Data Handling ---
async function loadUserDetails() {
    if (!phone) {
        displayAlert('No user session found. Redirecting to login...', 'error');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('phone', phone)
            .single();

        if (error) throw error;

        user = data;
        if (elements.username) elements.username.textContent = data.username;
        if (elements.balance) elements.balance.textContent = `Balance: $${data.balance}`;
    } catch (error) {
        console.error('User fetch error:', error);
        displayAlert('Failed to load user details.', 'error');
    }
}

async function updateUserBalance(newBalance) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('phone', phone);
        if (error) throw error;
        user.balance = newBalance;
        if (elements.balance) elements.balance.textContent = `Balance: $${user.balance}`;
        return true;
    } catch (error) {
        console.error('Error updating balance:', error);
        displayAlert('Failed to update balance', 'error');
        return false;
    }
}

async function fetchOpponentUsername(opponentPhone) {
    if (!opponentPhone) return null;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('username')
            .eq('phone', opponentPhone)
            .single();
        if (error) throw error;
        return data?.username;
    } catch (error) {
        console.error('Error fetching opponent username:', error);
        return null;
    }
}

// --- Game Logic ---
function updateTurnDisplay(turn) {
    const turnColorText = turn === 'w' ? 'White' : 'Black';
    if (elements.turnColor) elements.turnColor.textContent = turnColorText;
    if (elements.turnIndicator) elements.turnIndicator.className = `${turn === 'w' ? 'white' : 'black'}-turn`;

    if (elements.status) {
        if (game.isCheck()) {
            elements.status.textContent = `${turnColorText} is in check!`;
        } else if (game.isGameOver()) {
            elements.status.textContent = 'Game over';
        } else {
            elements.status.textContent = '';
        }
    }
}

function checkGameStatus() {
    if (game.isGameOver()) {
        let outcome = '';
        if (game.isCheckmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            outcome = `Checkmate! ${winner} wins!`;
            playSound(sounds.notify);
        } else if (game.isDraw()) {
            if (game.isStalemate()) {
                outcome = 'Stalemate! It\'s a draw.';
            } else if (game.isThreefoldRepetition()) {
                outcome = 'Draw by threefold repetition.';
            } else if (game.isInsufficientMaterial()) {
                outcome = 'Draw by insufficient material.';
            } else {
                outcome = 'Game ended in a draw.';
            }
            playSound(sounds.notify);
        }
        handleGameOver(outcome);
    } else if (game.isCheck()) {
        playSound(sounds.check);
    }
}

// --- Board Rendering ---
function renderFullBoard(board) {
    try {
        if (!elements.board) {
            console.error('Board element not found');
            return;
        }

        elements.board.innerHTML = '';
        const isWhitePerspective = color === 'white';
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const squareNotation = getSquareNotation(rank, file, isWhitePerspective);
                const square = createSquareElement(squareNotation, (rank + file) % 2 === 0);
                const piece = board[rank][file];
                
                if (piece) {
                    square.appendChild(createPieceElement(piece));
                }
                
                // Highlight possible moves
                if (selectedSquare) {
                    const gameSquare = getSquareFromPOV(squareNotation, isWhitePerspective);
                    const moveData = possibleMoves.find(m => m.to === gameSquare);
                    
                    if (moveData) {
                        square.classList.add('possible-move');
                        if (moveData.flags.includes('c') || moveData.flags.includes('e')) {
                            square.classList.add('capture-move');
                        }
                    }
                }
                
                // Highlight selected square
                if (squareNotation === selectedSquare) {
                    square.classList.add('selected');
                }
                
                elements.board.appendChild(square);
            }
        }
    } catch (error) {
        console.error('Error rendering board:', error);
    }
}

function getSquareNotation(rank, file, isWhitePerspective) {
    const visualRank = isWhitePerspective ? 8 - rank : rank + 1;
    const visualFile = String.fromCharCode(97 + (isWhitePerspective ? file : 7 - file));
    return visualFile + visualRank;
}

function createSquareElement(notation, isLight) {
    const square = document.createElement('div');
    square.className = `square ${isLight ? 'light' : 'dark'}`;
    square.dataset.square = notation;
    square.onclick = () => onSquareClick(notation);
    return square;
}

function createPieceElement(piece) {
    const pieceElement = document.createElement('div');
    pieceElement.className = `piece ${piece.color}`;
    pieceElement.textContent = getPieceSymbol(piece);
    return pieceElement;
}

// --- Game Management ---
async function handleGameOver(outcome) {
    if (elements.gameOverMessage) elements.gameOverMessage.textContent = outcome;
    if (elements.gameOverModal) elements.gameOverModal.style.display = 'block';

    // Disable game controls
    if (elements.resignButton) elements.resignButton.disabled = true;
    if (elements.offerDrawButton) elements.offerDrawButton.disabled = true;
    if (elements.requestTakebackBtn) elements.requestTakebackBtn.disabled = true;

    let winnerColor;
    if (outcome.includes('wins')) {
        winnerColor = outcome.includes('White') ? 'white' : 'black';
    } else if (outcome.includes('resignation')) {
        winnerColor = outcome.split(' ')[0].toLowerCase();
    } else if (outcome.includes('inactivity') || outcome.includes('timeout')) {
        winnerColor = outcome.split(' ')[0].toLowerCase();
    }

    const isWinner = winnerColor && winnerColor === color;
    const isDraw = outcome.includes('draw');

    try {
        const { data: gameData, error } = await supabase
            .from('chess_games')
            .select('bet, white_phone, black_phone')
            .eq('code', gameCode)
            .single();

        if (error) throw error;

        if (gameData && gameData.bet > 0) {
            const betAmount = gameData.bet;

            if (!isDraw) {
                if (isWinner) {
                    const winnings = betAmount * 2;
                    const updatedBalance = user.balance + winnings;
                    const updated = await updateUserBalance(updatedBalance);
                    if (updated) {
                        displayAlert(`You won $${winnings}! Your balance is now $${user.balance}`, 'success');
                    }
                } else {
                    // Deduct from loser
                    const updatedBalance = user.balance - betAmount;
                    const updated = await updateUserBalance(updatedBalance);
                    if (updated) {
                        displayAlert(`You lost $${betAmount}. Your balance is now $${user.balance}`, 'info');
                    }
                }
            } else {
                // Draw - refund both players
                const updatedBalance = user.balance + betAmount;
                const updated = await updateUserBalance(updatedBalance);
                if (updated) {
                    displayAlert(`Your $${betAmount} bet was refunded due to a draw. Balance: $${user.balance}`, 'info');
                }
            }
        }
    } catch (error) {
        console.error('Error handling game over:', error);
    }
}

// --- Move Handling ---
function onSquareClick(clickedSquare) {
    // Add null checks at the beginning
    if (!clickedSquare || game.isGameOver() || isWaitingForOpponent || isSpectator) return;

    // Ensure game.turn() is valid
    const currentTurn = game.turn();
    if (typeof currentTurn !== 'string') return;

    if (currentTurn !== color[0]) {
        displayAlert("It's not your turn!", 'warning');
        return;
    }

    const isWhitePerspective = color === 'white';
    const gameSquare = getSquareFromPOV(clickedSquare, isWhitePerspective);
    
    // Add null check for gameSquare
    if (!gameSquare) return;

    const piece = game.get(gameSquare);
    
    if (!selectedSquare) {
        if (piece && piece.color === color[0]) {
            selectedSquare = clickedSquare;
            possibleMoves = game.moves({
                square: gameSquare,
                verbose: true
            });
            renderFullBoard(game.board());
        }
    } else {
        if (selectedSquare === clickedSquare) {
            selectedSquare = null;
            possibleMoves = [];
            renderFullBoard(game.board());
            return;
        }

        const fromSquare = getSquareFromPOV(selectedSquare, isWhitePerspective);
        const toSquare = gameSquare;

        // Add null check for fromSquare
        if (!fromSquare) {
            selectedSquare = null;
            possibleMoves = [];
            renderFullBoard(game.board());
            return;
        }

        const move = possibleMoves.find(m =>
            m.from === fromSquare &&
            m.to === toSquare
        );

        if (move) {
            if (move.flags.includes('p')) {
                showPromotionDialog(fromSquare, toSquare);
            } else {
                makeMove(fromSquare, toSquare);
            }
        } else if (piece && piece.color === color[0]) {
            selectedSquare = clickedSquare;
            possibleMoves = game.moves({
                square: gameSquare,
                verbose: true
            });
            renderFullBoard(game.board());
        } else {
            displayAlert('Invalid move', 'warning');
        }
    }
}

function showPromotionDialog(from, to) {
    // Remove any existing promotion dialog
    const existingDialog = document.querySelector('.promotion-dialog');
    if (existingDialog) existingDialog.remove();

    const promotionPieces = ['q', 'r', 'b', 'n'];
    const promotionDialog = document.createElement('div');
    promotionDialog.className = 'promotion-dialog';
    
    promotionDialog.innerHTML = `
        <div class="promotion-title">Promote to:</div>
        <div class="promotion-options">
            ${promotionPieces.map(piece => `
                <div class="promotion-option" data-piece="${piece}">
                    ${getPieceSymbol({ type: piece, color: color[0] })}
                </div>
            `).join('')}
        </div>
    `;

    // Position the dialog near the promotion square
    const boardRect = elements.board.getBoundingClientRect();
    const squareEl = document.querySelector(`.square[data-square="${getSquareFromPOV(to, color === 'white')}"]`);
    if (squareEl) {
        const squareRect = squareEl.getBoundingClientRect();
        promotionDialog.style.position = 'absolute';
        promotionDialog.style.left = `${squareRect.left - boardRect.left}px`;
        promotionDialog.style.top = color === 'white' 
            ? `${squareRect.top - boardRect.top - 160}px`
            : `${squareRect.top - boardRect.top + 40}px`;
    }

    // Add click handlers for each promotion option
    promotionDialog.querySelectorAll('.promotion-option').forEach(option => {
        option.addEventListener('click', () => {
            const promotion = option.dataset.piece;
            makeMove(from, to, promotion);
            promotionDialog.remove();
        });
    });

    // Close dialog if clicked outside
    const closeDialog = (e) => {
        if (!promotionDialog.contains(e.target)) {
            promotionDialog.remove();
            document.removeEventListener('click', closeDialog);
            selectedSquare = null;
            possibleMoves = [];
            renderFullBoard(game.board());
        }
    };

    setTimeout(() => {
        document.addEventListener('click', closeDialog);
    }, 10);

    elements.board.appendChild(promotionDialog);
}

// --- Game Actions ---
async function resignGame() {
    if (game.isGameOver() || isWaitingForOpponent) return;

    const confirmed = confirm('Are you sure you want to resign?');
    if (!confirmed) return;

    const winner = color === 'white' ? 'black' : 'white';
    const outcome = `${winner} wins by resignation.`;

    socket.emit('resign_game', {
        gameCode: gameCode,
        winner: winner
    });

    handleGameOver(outcome);
    displayAlert('You resigned.', 'info');
}

async function offerDraw() {
    if (game.isGameOver() || isWaitingForOpponent) return;

    const confirmed = confirm('Are you sure you want to offer a draw?');
    if (!confirmed) return;

    socket.emit('offer_draw', {
        gameCode: gameCode,
        offerFrom: color
    });

    displayAlert('You offered a draw.', 'info');
}

async function requestTakeback() {
    if (game.isGameOver() || isWaitingForOpponent || moveHistory.length === 0) return;
    
    const confirmed = confirm('Request takeback of last move?');
    if (!confirmed) return;

    socket.emit('request_takeback', { gameCode });
    displayAlert('Takeback requested', 'info');
}

async function acceptDraw() {
    if (game.isGameOver() || !opponentOfferedDraw || isWaitingForOpponent) return;

    socket.emit('accept_draw', {
        gameCode: gameCode
    });

    handleGameOver('Game ended in a draw by agreement.');
    if (elements.drawOfferModal) elements.drawOfferModal.style.display = 'none';
    opponentOfferedDraw = false;
}

async function rejectDraw() {
    if (!opponentOfferedDraw) return;

    socket.emit('reject_draw', {
        gameCode: gameCode
    });

    displayAlert('You rejected the draw offer.', 'info');
    if (elements.drawOfferModal) elements.drawOfferModal.style.display = 'none';
    opponentOfferedDraw = false;
}

function requestRematch() {
    socket.emit('request_rematch', { gameCode });
    displayAlert('Rematch requested', 'info');
}

// --- Socket.IO Event Handlers ---
socket.on('connect', () => {
    console.log('Connected to Socket.IO server');
    if (elements.status) elements.status.textContent = 'Connected to server.';
    
    const urlParams = new URLSearchParams(window.location.search);
    const gameCodeFromURL = urlParams.get('code');
    const storedGameCode = localStorage.getItem('gameCode');

    if (storedGameCode) {
        socket.emit('join_game', { gameCode: storedGameCode });
    } else if (gameCodeFromURL) {
        socket.emit('join_game', { gameCode: gameCodeFromURL });
        localStorage.setItem('gameCode', gameCodeFromURL);
    }
});

socket.on('game_joined', (data) => {
    console.log('Game joined data:', data);
    color = data.color;
    localStorage.setItem('playerColor', color);
    
    // Render the board immediately with default position
    renderFullBoard(game.board());
    
    // Request game state if we're white (host)
    if (color === 'white') {
        socket.emit('request_game_state', { gameCode: data.gameCode });
    }
});

socket.on('game_state', (data) => {
    console.log('Received game state:', data);
    game.load(data.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    moveHistory = data.moves || [];
    
    // Update time displays
    if (data.whiteTime !== undefined && data.blackTime !== undefined) {
        updateTimeDisplay('player', color === 'white' ? data.whiteTime : data.blackTime);
        updateTimeDisplay('opponent', color === 'white' ? data.blackTime : data.whiteTime);
    }
    
    if (color === 'white' && game.turn() === 'w') {
        displayAlert('Game started! You (White) move first.', 'success');
    }
    
    renderFullBoard(game.board());
    updateTurnDisplay(game.turn());
});

let firsttime=true;
socket.on('opponent_joined', async (data) => {
    if(firsttime){
        displayAlert('Opponent has joined!', 'success');
        opponentnameupdate();
        firsttime = false;
    }

    // Update UI to show game is ready
    if (elements.waitingPage) elements.waitingPage.style.display = 'none';
    if (elements.gameArea) elements.gameArea.style.display = 'flex';
    isWaitingForOpponent = false;
    
    // Render the board with current state
    renderFullBoard(game.board());
});

socket.on('time_update', (data) => {
    updateTimeDisplay('player', color === 'white' ? data.whiteTime : data.blackTime);
    updateTimeDisplay('opponent', color === 'white' ? data.blackTime : data.whiteTime);
});

socket.on('opponent_moved', (data) => {
    const move = game.move(data.move);
    if (!move) return;

    moveHistory.push({
        from: move.from,
        to: move.to,
        san: move.san,
        promotion: move.promotion
    });

    updateMoveList(move);
    highlightLastMove(move.from, move.to);
    renderFullBoard(game.board());
    checkGameStatus();
});

socket.on('game_over', (data) => {
    if (!data || !data.reason) return;
    handleGameOver(data.reason);
});

socket.on('draw_offered', (data) => {
    if (!data || data.offerFrom === color) return;

    opponentOfferedDraw = true;
    playSound(sounds.notify);
    
    if (elements.drawOfferMessage) {
        elements.drawOfferMessage.textContent = 'Your opponent has offered a draw.';
    }
    if (elements.drawOfferModal) {
        elements.drawOfferModal.style.display = 'block';
    }
});

socket.on('draw_accepted', () => {
    handleGameOver('Game ended in a draw by agreement.');
    displayAlert('Draw accepted.', 'info');
});

socket.on('draw_rejected', () => {
    opponentOfferedDraw = false;
    if (elements.drawOfferModal) elements.drawOfferModal.style.display = 'none';
    displayAlert('Opponent rejected the draw offer.', 'info');
});

socket.on('opponent_resigned', (data) => {
    if (!data || !data.winner) return;

    const winner = data.winner;
    const outcome = winner === color ?
        'Opponent resigned. You win!' :
        'You resigned. Opponent wins.';

    handleGameOver(outcome);
});

socket.on('takeback_requested', () => {
    playSound(sounds.notify);
    const accept = confirm('Opponent requests takeback. Accept?');
    socket.emit('respond_takeback', { 
        gameCode, 
        accepted: accept 
    });
    
    if (accept) {
        displayAlert('Takeback accepted', 'info');
    } else {
        displayAlert('Takeback rejected', 'info');
    }
});

socket.on('takeback_accepted', () => {
    if (moveHistory.length > 0) {
        game.undo();
        moveHistory.pop();
        renderFullBoard(game.board());
        displayAlert('Takeback accepted', 'info');
        playSound(sounds.notify);
    }
});

socket.on('takeback_rejected', () => {
    displayAlert('Opponent rejected the takeback request', 'info');
});

socket.on('rematch_requested', () => {
    playSound(sounds.notify);
    const accept = confirm('Opponent requests a rematch. Accept?');
    socket.emit('respond_rematch', {
        gameCode,
        accepted: accept
    });
    
    if (accept) {
        displayAlert('Rematch accepted! Starting new game...', 'success');
    } else {
        displayAlert('Rematch declined', 'info');
    }
});

socket.on('rematch_accepted', () => {
    // Reset game state for rematch
    game = new Chess();
    moveHistory = [];
    selectedSquare = null;
    possibleMoves = [];
    renderFullBoard(game.board());
    
    // Swap colors for rematch
    color = color === 'white' ? 'black' : 'white';
    localStorage.setItem('playerColor', color);
    
    if (color === 'white') {
        displayAlert('Rematch started! You (White) move first.', 'success');
    } else {
        displayAlert('Rematch started! Waiting for White to move...', 'info');
    }
});

async function opponentnameupdate() {
    const urlParams = new URLSearchParams(window.location.search);
    gameCode = urlParams.get('code');
    color = urlParams.get('color');

    try {
        const { data: gameData, error } = await supabase
            .from('chess_games')
            .select('fen, turn, moves, white_phone, black_phone, status, bet')
            .eq('code', gameCode)
            .single();

        if (error) throw error;

        if (gameData) {
            game.load(gameData.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            moveHistory = gameData.moves || [];
            betAmount = gameData.bet || 0;
            console.log(betAmount);
            if (!await updateUserBalance(user.balance - betAmount)) {
                displayMessage(null, 'Failed to deduct bet.', 'error');
                return;
            } else {
                displayAlert('Bet deducted successfully', 'success');
            }

            // Render the board immediately with loaded state
            renderFullBoard(game.board());

            if (isSpectator) {
                initSpectatorMode();
                return;
            }

            // Determine if current user is the game creator by checking if they're white_phone
            const isCreator = gameData.white_phone === phone;
            
            // If no color assigned yet and user is creator (white_phone), assign white
            if (!color && isCreator) {
                color = 'white';
                localStorage.setItem('playerColor', color);
            }
            // If no color assigned and user is not creator, assign black
            else if (!color && !isCreator) {
                color = 'black';
                localStorage.setItem('playerColor', color);
            }

            opponentPhone = color === 'white' ? gameData.black_phone : gameData.white_phone;
            
            if (opponentPhone) {
                const opponentUsername = await fetchOpponentUsername(opponentPhone);
                if (elements.opponentUsername) {
                    elements.opponentUsername.textContent = opponentUsername || 'Opponent';
                }
                isWaitingForOpponent = false;
            } 

            updateTurnDisplay(game.turn());
            setupRealtimeListener();
        }
    } catch (error) {
        console.error('Error initializing game:', error);
    }
}

// --- Initialization ---
showPromotionDialog()
async function initGame() {
    const urlParams = new URLSearchParams(window.location.search);
    gameCode = urlParams.get('code');
    color = urlParams.get('color');
    isSpectator = urlParams.get('spectate') === 'true';

    if (!gameCode) {
        displayAlert('Invalid game URL.', 'error');
        return;
    }

    if (elements.gameCodeDisplay) elements.gameCodeDisplay.textContent = gameCode;

    await loadUserDetails();

    // Set up event listeners
    if (elements.resignButton) elements.resignButton.addEventListener('click', resignGame);
    if (elements.offerDrawButton) elements.offerDrawButton.addEventListener('click', offerDraw);
    if (elements.acceptDrawButton) elements.acceptDrawButton.addEventListener('click', acceptDraw);
    if (elements.rejectDrawButton) elements.rejectDrawButton.addEventListener('click', rejectDraw);
    if (elements.requestTakebackBtn) elements.requestTakebackBtn.addEventListener('click', requestTakeback);
    if (elements.closeModalBtn) elements.closeModalBtn.addEventListener('click', () => {
        if (elements.gameOverModal) elements.gameOverModal.style.display = 'none';
        window.location.href = '/games';
    });
    if (elements.closeDrawModalBtn) elements.closeDrawModalBtn.addEventListener('click', () => {
        if (elements.drawOfferModal) elements.drawOfferModal.style.display = 'none';
    });
    if (elements.rematchButton) elements.rematchButton.addEventListener('click', requestRematch);

    try {
        const { data: gameData, error } = await supabase
            .from('chess_games')
            .select('fen, turn, moves, white_phone, black_phone, status, bet')
            .eq('code', gameCode)
            .single();

        if (error) throw error;

        if (gameData) {
            game.load(gameData.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            moveHistory = gameData.moves || [];
            betAmount = gameData.bet || 0;

            // Render the board immediately with loaded state
            renderFullBoard(game.board());

            if (isSpectator) {
                initSpectatorMode();
                return;
            }

            // Determine if current user is the game creator by checking if they're white_phone
            const isCreator = gameData.white_phone === phone;
            
            // If no color assigned yet and user is creator (white_phone), assign white
            if (!color && isCreator) {
                color = 'white';
                localStorage.setItem('playerColor', color);
            }
            // If no color assigned and user is not creator, assign black
            else if (!color && !isCreator) {
                color = 'black';
                localStorage.setItem('playerColor', color);
            }

            opponentPhone = color === 'white' ? gameData.black_phone : gameData.white_phone;
            
            if (opponentPhone) {
                const opponentUsername = await fetchOpponentUsername(opponentPhone);
                if (elements.opponentUsername) {
                    elements.opponentUsername.textContent = opponentUsername || 'Opponent';
                }
                if (elements.waitingPage) elements.waitingPage.style.display = 'none';
                if (elements.gameArea) elements.gameArea.style.display = 'flex';
                isWaitingForOpponent = false;
                
                // If game just started (no moves yet), white goes first
                if (moveHistory.length === 0 && color === 'white') {
                    displayAlert('Game started! You (White) move first.', 'success');
                }
            } else {
                if (elements.opponentUsername) elements.opponentUsername.textContent = 'Waiting for opponent...';
                if (elements.waitingPage) elements.waitingPage.style.display = 'flex';
                if (elements.gameArea) elements.gameArea.style.display = 'none';
                isWaitingForOpponent = true;
            }

            updateTurnDisplay(game.turn());
            setupRealtimeListener();

            socket.emit('join_game', {
                gameCode: gameCode,
                playerColor: color,
                playerPhone: phone,
                isCreator: isCreator
            });
        }
    } catch (error) {
        console.error('Error initializing game:', error);
        displayAlert('Failed to initialize game.', 'error');
    }
}

function initSpectatorMode() {
    isSpectator = true;
    renderFullBoard(game.board());
    
    // Disable move inputs
    document.querySelectorAll('.square').forEach(sq => {
        sq.onclick = null;
        sq.style.cursor = 'default';
    });
    
    // Update UI for spectator
    if (elements.spectatorNotice) elements.spectatorNotice.style.display = 'block';
    if (elements.gameControls) elements.gameControls.style.display = 'none';
    
    displayAlert('You are viewing this game as a spectator', 'info');
}

// --- Supabase Realtime Listener ---
async function setupRealtimeListener() {
    if (gameChannel) {
        supabase.removeChannel(gameChannel);
    }

    gameChannel = supabase.channel(`chess_game_${gameCode}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chess_games',
            filter: `code=eq.${gameCode}`
        }, (payload) => {
            // Fallback in case Socket.IO fails
            if (payload.new.fen !== game.fen()) {
                game.load(payload.new.fen);
                moveHistory = payload.new.moves || [];

                if (elements.moveList) {
                    elements.moveList.innerHTML = '';
                    moveHistory.forEach(move => updateMoveList(move));
                }
                checkGameStatus();
                initGame();
                renderFullBoard(game.board());
                
               
            }
        })
        .subscribe();
}


// Start the game
initGame();