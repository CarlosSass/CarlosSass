import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js/+esm';

// --- Supabase Setup ---
const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- DOM Elements ---
const gameCodeInput = document.getElementById('game-code');
const betAmountInput = document.getElementById('bet-amount');
const createBtn = document.getElementById('create-game');
const joinBtn = document.getElementById('join-game');
const boardElement = document.getElementById('chessboard');
const statusEl = document.getElementById('status');
const usernameEl = document.getElementById('username');
const balanceEl = document.getElementById('balance');
const gameOverModal = document.getElementById('game-over-modal');
const gameOverMessage = document.getElementById('game-over-message');
const closeModalBtn = document.getElementById('close-modal');

// --- Game State ---
const phone = localStorage.getItem('phone');
let user = {};
let gameCode = '';
let color = '';
let game = new Chess();
let gameId = null;
let selectedSquare = null;
let possibleMoves = [];
let gameChannel = null;

// --- Utility Functions ---
const displayAlert = (message, type = 'info') => {
    const alertBox = document.createElement('div');
    alertBox.className = `alert ${type}`;
    alertBox.textContent = message;
    document.body.appendChild(alertBox);
    setTimeout(() => alertBox.remove(), 3000);
};

const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

const getSquareFromPOV = (square, isWhitePerspective) => {
    if (!square) return null;
    if (isWhitePerspective) return square;

    // Flip the square for black's perspective
    const file = square[0];
    const rank = square[1];
    const flippedFile = String.fromCharCode(97 + (104 - file.charCodeAt(0)));
    const flippedRank = 9 - parseInt(rank);
    return flippedFile + flippedRank;
};

const getPieceSymbol = (piece) => {
    const symbols = {
        p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
        P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
    };
    return symbols[piece.color === 'w' ? piece.type.toUpperCase() : piece.type];
};

// --- User Data Handling ---
async function loadUserDetails() {
    if (!phone) {
        displayAlert('No user session found', 'error');
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
        usernameEl.textContent = data.username;
        balanceEl.textContent = `Balance: ${data.balance}`;
    } catch (error) {
        console.error('User fetch error:', error);
        displayAlert('Failed to load user details', 'error');
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
        balanceEl.textContent = `Balance: ${newBalance}`;
        return true;
    } catch (error) {
        console.error('Error updating balance:', error);
        displayAlert('Failed to update balance', 'error');
        return false;
    }
}

// --- Board Rendering ---
function renderBoard() {
    if (!boardElement) {
        console.error("Chessboard element not found");
        return;
    }

    boardElement.innerHTML = '';
    const board = game.board();
    const isWhitePerspective = color === 'white';

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const visualRank = isWhitePerspective ? 8 - rank : rank + 1;
            const visualFile = String.fromCharCode(97 + (isWhitePerspective ? file : 7 - file));
            const squareNotation = visualFile + visualRank;

            const square = document.createElement('div');
            square.className = 'square';
            square.style.backgroundColor = (rank + file) % 2 === 0 ? '#f0d9b5' : '#b58863';
            square.dataset.square = squareNotation;
            square.onclick = () => onSquareClick(squareNotation);

            const piece = board[rank][file];
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.className = `piece ${piece.color}`;
                pieceElement.textContent = getPieceSymbol(piece);
                square.appendChild(pieceElement);
            }

            if (selectedSquare === squareNotation) {
                square.classList.add('selected');
            }

            if (possibleMoves.some(move => move.to === getSquareFromPOV(squareNotation, isWhitePerspective))) {
                const move = possibleMoves.find(m => m.to === getSquareFromPOV(squareNotation, isWhitePerspective));
                square.classList.add('possible-move');
                if (move.flags.includes('c') || move.flags.includes('e')) {
                    square.classList.add('capture-move');
                }
            }

            boardElement.appendChild(square);
        }
    }

    updateTurnDisplay(game.turn());
    checkGameStatus();
}

// --- Game Logic ---
function onSquareClick(clickedSquare) {
    if (game.isGameOver()) return;

    const isWhitePerspective = color === 'white';
    const gameSquare = getSquareFromPOV(clickedSquare, isWhitePerspective);
    const piece = game.get(gameSquare);

    if (game.turn() !== color[0]) {
        displayAlert("It's not your turn!", 'warning');
        return;
    }

    if (!selectedSquare) {
        if (piece && piece.color === color[0]) {
            selectedSquare = clickedSquare;
            possibleMoves = game.moves({
                square: gameSquare,
                verbose: true
            });
            renderBoard();
        }
    } else {
        if (selectedSquare === clickedSquare) {
            selectedSquare = null;
            possibleMoves = [];
            renderBoard();
            return;
        }

        if (piece && piece.color === color[0]) {
            selectedSquare = clickedSquare;
            possibleMoves = game.moves({
                square: gameSquare,
                verbose: true
            });
            renderBoard();
            return;
        }

        const fromSquare = getSquareFromPOV(selectedSquare, isWhitePerspective);
        const toSquare = gameSquare;

        const move = possibleMoves.find(m => m.from === fromSquare && m.to === toSquare);

        if (move) {
            if (move.flags.includes('p')) {
                promotePawn(fromSquare, toSquare);
            } else {
                makeMove(fromSquare, toSquare);
            }
        } else {
            displayAlert('Invalid move', 'warning');
        }
    }
}
async function makeMove(from, to, promotion = null) {
    try {
        const move = game.move({ from, to, promotion });

        if (!move) {
            displayAlert('Invalid move', 'error');
            return;
        }

        selectedSquare = null;
        possibleMoves = [];

        const nextTurn = game.turn() === 'w' ? 'white' : 'black';
        const isGameOver = game.isGameOver();
        const isCheckmate = game.isCheckmate();
        const gameStatus = isGameOver ? (isCheckmate ? 'checkmate' : 'draw') : 'ongoing';

        console.log("After move:", { isGameOver, isCheckmate, gameStatus, fen: game.fen() }); // <--- ADD THIS

        const { error } = await supabase
            .from('chess_games')
            .update({
                fen: game.fen(),
                turn: nextTurn,
                status: gameStatus
            })
            .eq('id', gameId);

        if (error) throw error;

        renderBoard();
        checkGameStatus(); // <--- ENSURE THIS IS CALLED HERE

    } catch (error) {
        console.error('Error making move:', error);
        displayAlert('Failed to make move', 'error');
        const { data } = await supabase
            .from('chess_games')
            .select('fen')
            .eq('id', gameId)
            .single();

        if (data) game.load(data.fen);
        renderBoard();
    }
}
function promotePawn(from, to) {
    const promotionPieces = ['q', 'r', 'b', 'n'];
    const promotionContainer = document.createElement('div');
    promotionContainer.className = 'promotion-container';

    promotionPieces.forEach(piece => {
        const promoOption = document.createElement('div');
        promoOption.className = `promo-option ${color[0]} ${piece}`;
        promoOption.textContent = getPieceSymbol({ type: piece, color: color[0] });
        promoOption.onclick = () => {
            makeMove(from, to, piece);
            promotionContainer.remove();
        };
        promotionContainer.appendChild(promoOption);
    });

    document.body.appendChild(promotionContainer);
}

// --- Game Management ---
createBtn.onclick = async () => {
    gameCode = gameCodeInput.value.trim();
    const bet = parseInt(betAmountInput.value);

    if (!gameCode || gameCode.length < 4) {
        return displayAlert('Game code must be at least 4 characters', 'error');
    }

    if (isNaN(bet) || bet <= 0) {
        return displayAlert('Please enter a valid bet amount', 'error');
    }

    if (user.balance < bet) {
        return displayAlert('Insufficient balance', 'error');
    }

    try {
        if (!await updateUserBalance(user.balance - bet)) return;

        const { data: createdGameData, error: createError } = await supabase
            .from('chess_games')
            .insert([{
                code: gameCode,
                white_phone: phone,
                white_username: user.username,
                bet: bet,
                fen: game.fen(),
                turn: 'white',
                status: 'waiting'
            }])
            .select()
            .single();

        if (createError) throw createError;

        gameId = createdGameData.id;
        color = 'white';
        updateTurnDisplay('white');
        renderBoard();
        listenToGame();
        displayAlert(`Game created! Code: ${gameCode}. You are White.`, 'success');
    } catch (error) {
        console.error('Error creating game:', error);
        await updateUserBalance(user.balance + bet);
        displayAlert('Failed to create game. Your bet has been refunded.', 'error');
    }
};

joinBtn.onclick = async () => {
    gameCode = gameCodeInput.value.trim();
    const bet = parseInt(betAmountInput.value);

    if (!gameCode) {
        return displayAlert('Please enter a game code', 'error');
    }

    if (isNaN(bet) || bet <= 0) {
        return displayAlert('Please enter a valid bet amount', 'error');
    }

    try {
        const { data: existingGames, error: fetchError } = await supabase
            .from('chess_games')
            .select('*')
            .eq('code', gameCode)
            .limit(1);

        if (fetchError) throw fetchError;

        const gameData = existingGames?.[0];
        if (!gameData) {
            return displayAlert('Game not found', 'error');
        }

        if (gameData.black_phone) {
            return displayAlert('Game is already full', 'error');
        }

        if (gameData.bet !== bet) {
            return displayAlert(`Bet must match: ${gameData.bet}`, 'error');
        }

        if (user.balance < bet) {
            return displayAlert('Insufficient balance', 'error');
        }

        if (!await updateUserBalance(user.balance - bet)) return;

        const { data: joinedGameData, error: joinError } = await supabase
            .from('chess_games')
            .update({
                black_phone: phone,
                black_username: user.username,
                status: 'ongoing'
            })
            .eq('id', gameData.id)
            .select()
            .single();

        if (joinError) throw joinError;

        gameId = gameData.id;
        color = 'black';
        game.load(gameData.fen);
        updateTurnDisplay(gameData.turn);
        renderBoard();
        listenToGame();
        displayAlert(`Joined game! Code: ${gameCode}. You are Black.`, 'success');
    } catch (error) {
        console.error('Error joining game:', error);
        await updateUserBalance(user.balance + bet);
        displayAlert('Failed to join game. Your bet has been refunded.', 'error');
    }
};

function updateTurnDisplay(turn) {
    const turnColor = turn === 'w' ? 'White' : 'Black';
    statusEl.textContent = `Turn: ${turnColor}`;
    statusEl.className = turn === 'w' ? 'white-turn' : 'black-turn';

    if (game.isCheck()) {
        statusEl.textContent += ' (Check!)';
    }
}
function checkGameStatus() {
    console.log("Checking game status:", { isGameOver: game.isGameOver(), isCheckmate: game.isCheckmate() }); // <--- ADD THIS
    if (game.isGameOver()) {
        let outcome = '';
        if (game.isCheckmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            outcome = `Checkmate! ${winner} wins!`;
        } else if (game.isDraw()) {
            if (game.isStalemate()) {
                outcome = 'Draw by stalemate';
            } else if (game.isThreefoldRepetition()) {
                outcome = 'Draw by threefold repetition';
            } else if (game.isInsufficientMaterial()) {
                outcome = 'Draw by insufficient material';
            } else {
                outcome = 'Game ended in a draw';
            }
        }
        handleGameOver(outcome);
    }
}
function animateBalanceChange(amount) {
    const animationElement = document.createElement('div');
    animationElement.classList.add('balance-animation');
    animationElement.textContent = `+${amount}`; // Show the amount won

    // Position the animation near the balance display
    const balanceRect = balanceEl.getBoundingClientRect();
    animationElement.style.position = 'fixed';
    animationElement.style.left = `${balanceRect.left + balanceRect.width / 2 - animationElement.offsetWidth / 2}px`;
    animationElement.style.top = `${balanceRect.top - animationElement.offsetHeight - 5}px`; // Above the balance

    document.body.appendChild(animationElement);

    // Trigger CSS animation
    animationElement.classList.add('animate');

    // Remove the animation element after a delay
    setTimeout(() => {
        animationElement.remove();
        balanceEl.textContent = `Balance: ${user.balance}`; // Update displayed balance
    }, 1500); // Adjust the duration as needed
}
async function handleGameOver(outcome) {
    gameOverMessage.textContent = outcome;
    gameOverModal.style.display = 'block';

    if (outcome.includes('wins')) {
        const winnerColor = outcome.includes('White') ? 'white' : 'black';
        const isWinner = (winnerColor === 'white' && color === 'white') ||
                           (winnerColor === 'black' && color === 'black');

        if (isWinner) {
            const { data: gameData } = await supabase
                .from('chess_games')
                .select('bet')
                .eq('id', gameId)
                .single();

            if (gameData) {
                const winnings = gameData.bet * 2; // Winner gets their bet back + opponent's
                const newBalance = user.balance + winnings;
                await updateUserBalance(newBalance); // Update in Supabase
                animateBalanceChange(winnings); // Trigger animation
            }
        }
    }
}

async function listenToGame() {
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
            if (payload.new.fen === game.fen()) return;

            const newFen = payload.new.fen;
            const newTurn = payload.new.turn;
            const newStatus = payload.new.status;

            if (newFen) {
                game.load(newFen);
                selectedSquare = null;
                possibleMoves = [];
                renderBoard();
                checkGameStatus(); // <--- ENSURE THIS IS CALLED HERE
            }

            if (newStatus && newStatus !== 'ongoing') {
                handleGameOver(newStatus === 'checkmate' ?
                    `${color === 'white' ? 'Black' : 'White'} wins by checkmate!` :
                    'Game ended in a draw');
            }
        })
        .subscribe();
}

// Initialize the game
(async function init() {
    await loadUserDetails();
    renderBoard();
})();