
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// --- Supabase Setup ---
const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- DOM Elements ---
const backBtn = document.getElementById('back-btn');
const gameCodeDisplay = document.getElementById('game-code-display');
const copyCodeBtn = document.getElementById('copy-code-btn');
const gameBetAmount = document.getElementById('game-bet-amount');
const creatorAvatar = document.getElementById('creator-avatar');
const creatorUsername = document.getElementById('creator-username');
const creatorStatus = document.getElementById('creator-status');
const opponentAvatar = document.getElementById('opponent-avatar');
const opponentUsername = document.getElementById('opponent-username');
const opponentStatus = document.getElementById('opponent-status');
const gameStatusMessage = document.getElementById('game-status-message');
const guessInput = document.getElementById('guess-input');
const submitGuessBtn = document.getElementById('submit-guess-btn');
const guessHistoryTable = document.querySelector('#guess-history-table tbody');
const historyEmptyState = document.getElementById('history-empty-state');
const leaveGameBtn = document.getElementById('leave-game-btn');
const gameResultModal = document.getElementById('game-result-modal');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const resultAmount = document.getElementById('result-amount');
const resultCloseBtn = document.getElementById('result-close-btn');

// --- Game State ---
let gameState = {
    gameCode: '',
    betAmount: 0,
    secretNumber: '',
    playerRole: '', // 'creator' or 'opponent'
    gameStatus: 'waiting', // 'waiting', 'ongoing', 'finished', 'cancelled'
    creator: {},
    opponent: {},
    guesses: [],
    betDeducted: false,
    didwelose: true

};










// --- Updated handleGameWin function with transaction recording ---


// --- New function to record transactions ---
async function recordTransaction(transactionData) {
    try {
        // 1. First handle the user balance update
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', transactionData.player_phone)
            .single();

        if (userError) throw userError;

        const balance_before = userData?.balance || 0;
        const balance_after = balance_before + transactionData.amount;

        // 2. Attempt to create transaction record without game_id reference
        const { error } = await supabase
            .from('player_transactions')
            .insert({
                player_phone: transactionData.player_phone,
                transaction_type: transactionData.transaction_type,
                amount: transactionData.amount,
                balance_before,
                balance_after,
                description: transactionData.description,
                status: transactionData.status,
                created_at: new Date().toISOString()
                // Explicitly omitting game_id to avoid foreign key constraint
            });

        if (error) throw error;

        // 3. Update user balance
        

        console.log('Transaction recorded successfully (without game_id):', transactionData);

    } catch (error) {
        console.error('Failed to record transaction:', error);
        
        // Fallback: Store transaction data in local storage if Supabase fails
        try {
            const failedTransactions = JSON.parse(localStorage.getItem('failedTransactions') || []);
            failedTransactions.push({
                ...transactionData,
                balance_before: balance_before,
                balance_after: balance_after,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('failedTransactions', JSON.stringify(failedTransactions));
            console.warn('Transaction stored locally for later recovery');
        } catch (localStorageError) {
            console.error('Failed to store transaction locally:', localStorageError);
        }
        
        throw error;
    }
}
// --- Update showFinalResult to reflect transaction changes ---


async function handleGameWin(winningPlayer) {
    if (gameState.gameStatus === 'finished') return;
    
    gameState.gameStatus = 'finished';
    














    try {
        // Calculate amounts with 10% house cut
        const totalPrizePool = gameState.betAmount * 2; // Both players' bets
        const winnerPrize = Math.floor(totalPrizePool * 0.9); // 90% to winner
        const houseCut = totalPrizePool - winnerPrize; // 10% to house


        // Update database with winner
        const { error } = await supabase
            .from('guess_number_games')
            .update({ 
                status: 'finished',
                winner: winningPlayer.phone,
                result: 'number_guessed',
                //house_cut: houseCut // Store house cut
            })
            .eq('code', gameState.gameCode);
        
        if (error) throw error;

        // Award prize to winner (90% of total pool)
        const { data: winnerData } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', winningPlayer.phone)
            .single();

        if (winnerData) {
            const newBalance = winnerData.balance + winnerPrize;
            await supabase
                .from('users')
                .update({ balance: newBalance })
                .eq('phone', winningPlayer.phone);
            
            showNotification(`You won ${ gameState.betAmount *1.8} ETB!`, 'success');
        }
        await recordTransaction({
            player_phone: winningPlayer.phone,
            transaction_type: 'win',
            amount: winnerPrize,
            game_id: gameState.gameCode,
            description: `Won guessing game (${gameState.secretNumber}) `,
            status: 'completed'
        });
        // Add house cut to house account (assuming a house account exists)
        updateHouseBalance(houseCut);

        // Show result
        showFinalResult({
            winner: winningPlayer.phone,
            result: 'number_guessed',
            secret_number: gameState.secretNumber,
            prize_amount: winnerPrize,
            house_cut: houseCut
        });
    } catch (error) {
        console.error('Error handling game win:', error);
    }
}

// --- Game Logic Functions ---
function evaluateGuess(guess, secret) {
    let correctPosition = 0;
    let correctNumber = 0;

    const secretDigits = secret.split('');
    const guessDigits = guess.split('');

    // First pass for correct positions
    for (let i = 0; i < 4; i++) {
        if (guessDigits[i] === secretDigits[i]) {
            correctPosition++;
            correctNumber++;

            guessDigits[i] = '_';
            secretDigits[i] = '-';
        }
    }

    // Second pass for correct numbers not in correct positions
    for (let i = 0; i < 4; i++) {
        if (guessDigits[i] !== '_') {
            const secretIndex = secretDigits.indexOf(guessDigits[i]);
            
            if (secretIndex !== -1) {
                correctNumber++;
                secretDigits[secretIndex] = '-';
            }
        }
    }

    return { correctNumbers: correctNumber, correctPositions: correctPosition };
}

// --- Game Flow Functions ---
async function submitGuess() {
    const guess = guessInput.value.trim();

    // Validate input
    if (!/^\d{4}$/.test(guess)) {
        displayMessage(gameStatusMessage, 'Please enter a valid 4-digit number', 'error');
        return;
    }

    if (new Set(guess.split('')).size !== 4) {
        displayMessage(gameStatusMessage, 'All digits must be unique', 'error');
        return;
    }

    if (gameState.gameStatus !== 'ongoing') {
        displayMessage(gameStatusMessage, 'Game is not currently accepting guesses.', 'info');
        return;
    }

    const phone = localStorage.getItem('phone');
    const currentPlayer = (gameState.creator.phone === phone) ? gameState.creator : gameState.opponent;

    if (!currentPlayer || !currentPlayer.phone) {
        console.error("Current player not found in game state.");
        displayMessage(gameStatusMessage, "Error identifying player.", 'error');
        return;
    }

    try {
        let secretNumber = gameState.secretNumber;
        if (gameState.playerRole === 'opponent' || !secretNumber) {
            const { data: gameData } = await supabase
                .from('guess_number_games')
                .select('secret_number')
                .eq('code', gameState.gameCode)
                .single();
            
            if (!gameData || !gameData.secret_number) {
                console.error("Secret number not found in database.");
                displayMessage(gameStatusMessage, "Error fetching secret number.", 'error');
                return;
            }
            secretNumber = gameData.secret_number;
            if (gameState.playerRole === 'creator') {
                gameState.secretNumber = secretNumber;
            }
        }

        const { correctNumbers, correctPositions } = evaluateGuess(guess, secretNumber);

        gameState.guesses.push({
            player: {
                phone: currentPlayer.phone,
                username: currentPlayer.username
            },
            guess,
            correctNumbers,
            correctPositions,
            timestamp: new Date().toISOString()
        });
        
        if (correctPositions === 4) {
            await handleGameWin(currentPlayer);
        } else {
            displayMessage(gameStatusMessage, 
                `Correct numbers: ${correctNumbers}, Correct positions: ${correctPositions}`, 
                'info');
        }

        const { error: updateError } = await supabase
            .from('guess_number_games')
            .update({
                guesses: gameState.guesses,
                status: gameState.gameStatus
            })
            .eq('code', gameState.gameCode);

        if (updateError) throw updateError;

        guessInput.value = '';
        renderGuessHistory();
        /*displayMessage(gameStatusMessage,
            `Guess Submitted: ${guess}. Result: Numbers: ${correctNumbers}, Positions: ${correctPositions}`,
            correctPositions === 4 ? 'success' : (correctPositions > 0 || correctNumbers > 0 ? 'warning' : 'danger')
        );
*/
    } catch (error) {
        console.error('Error processing guess:', error);
        displayMessage(gameStatusMessage, 'Error processing your guess', 'error');
    }
}

// --- UI Functions ---
function updateGameUI() {
    updatePlayerUI(creatorAvatar, creatorUsername, creatorStatus, gameState.creator, 'Creator');
    updatePlayerUI(opponentAvatar, opponentUsername, opponentStatus, gameState.opponent, 'Waiting...');

    gameBetAmount.textContent = formatBalance(gameState.betAmount);

    switch (gameState.gameStatus) {
        case 'waiting':
            displayMessage(gameStatusMessage, gameState.playerRole === 'creator' ?
                'Waiting for opponent...' : 'Connecting to game...', 'info');
            disableGuessInput();
            break;
        case 'ongoing':
            displayMessage(gameStatusMessage, 'Game in progress - make your guess!', 'success');
            enableGuessInput();
            break;
        case 'finished':
            displayMessage(gameStatusMessage, 'Game finished.', 'info');
            disableGuessInput();
            break;
        case 'cancelled':
            displayMessage(gameStatusMessage, 'Game cancelled by creator.', 'error');
            disableGuessInput();
            break;
        default:
            displayMessage(gameStatusMessage, 'Unknown game status.', 'info');
            disableGuessInput();
    }

    renderGuessHistory();
}

function renderGuessHistory() {
    guessHistoryTable.innerHTML = '';

    const phone = localStorage.getItem('phone');
    const currentPlayerGuesses = gameState.guesses.filter(guess => guess.player.phone === phone);

    if (currentPlayerGuesses.length === 0) {
        historyEmptyState.style.display = 'flex';
        return;
    }

    historyEmptyState.style.display = 'none';
    
    currentPlayerGuesses.forEach(guess => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${guess.guess}</td>
            <td>${guess.correctNumbers}</td>
            <td>${guess.correctPositions}</td>
        `;
        guessHistoryTable.appendChild(row);
    });
}

// --- Utility Functions ---
function generateAvatarColor(username) {
    if (!username) return '#6c757d';
    const colors = [
        '#ff6b6b', '#51cf66', '#fcc419', '#228be6',
        '#be4bdb', '#20c997', '#fd7e14', '#868e96'
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        const char = username.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return colors[Math.abs(hash) % colors.length];
}

function formatBalance(amount) {
    const numericAmount = typeof amount === 'number' ? amount : 0;
    return numericAmount.toLocaleString() + ' ETB' || '0 ETB';
}

function displayMessage(element, message, type = 'info') {
    if (!element) return;

    element.textContent = message;
    element.classList.remove('status-message', 'success', 'error', 'warning', 'info');
    element.classList.add('status-message', type);

    if (type === 'success') {
        setTimeout(() => {
            element.textContent = '';
            element.classList.remove('status-message', 'success');
            element.classList.add('status-message', 'info');
        }, 3000);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'game-notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
}


function updatePlayerUI(avatarEl, nameEl, statusEl, player, defaultName) {
    if (player && player.phone) {
        nameEl.textContent = player.username || defaultName;
        avatarEl.textContent = player.username ? player.username.charAt(0).toUpperCase() : defaultName.charAt(0);
        avatarEl.style.backgroundColor = generateAvatarColor(player.username || defaultName);
        statusEl.textContent = player.phone === localStorage.getItem('phone') ? 'You' : 'Connected';
    } else {
        nameEl.textContent = defaultName;
        avatarEl.textContent = defaultName.charAt(0);
        avatarEl.style.backgroundColor = '#6c757d';
        statusEl.textContent = 'Waiting';
    }
}

function enableGuessInput() {
    guessInput.disabled = false;
    submitGuessBtn.disabled = false;
}

function disableGuessInput() {
    guessInput.disabled = true;
    submitGuessBtn.disabled = true;
}

function copyGameCode() {
    navigator.clipboard.writeText(gameState.gameCode).then(() => {
        const originalSvg = copyCodeBtn.innerHTML;
        copyCodeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/></svg>';
        setTimeout(() => {
            copyCodeBtn.innerHTML = originalSvg;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy game code:', err);
        showNotification('Failed to copy game code', 'error');
    });
}

// --- Game Management Functions ---
async function loadGameData() {
    try {
        const { data: gameData, error } = await supabase
            .from('guess_number_games')
            .select('*')
            .eq('code', gameState.gameCode)
            .single();

        if (error) throw error;
        if (!gameData) {
            displayMessage(gameStatusMessage, 'Game not found or already ended.', 'error');
            disableGuessInput();
            setTimeout(() => window.location.href = '/', 3000);
            return;
        }

        Object.assign(gameState, {
            betAmount: gameData.bet,
            gameStatus: gameData.status,
            creator: {
                username: gameData.creator_username,
                phone: gameData.creator_phone
            },
            opponent: {
                username: gameData.opponent_username,
                phone: gameData.opponent_phone
            },
            guesses: gameData.guesses || [],
            secretNumber: gameData.secret_number
        });

        const phone = localStorage.getItem('phone');
        gameState.playerRole = gameData.creator_phone === phone ? 'creator' : 'opponent';

        if (gameState.opponent.phone && gameState.gameStatus === 'waiting') {
            gameState.gameStatus = 'ongoing';
            await updateGameInDatabase();
        }

        if (!gameState.betDeducted && gameState.gameStatus !== 'waiting' && (gameState.opponent.phone || gameState.playerRole === 'creator')) {
            await deductBetAmount();
        }

        if (gameState.gameStatus === 'finished') {
            showFinalResult(gameData);
        } else if (gameState.gameStatus === 'cancelled') {
            handleGameCancellation(gameData);
        }

        updateGameUI();

    } catch (error) {
        console.error('Game load error:', error);
        displayMessage(gameStatusMessage, `Failed to load game: ${error.message}`, 'error');
        disableGuessInput();
        setTimeout(() => window.location.href = '/', 3000);
    }
}

async function deductBetAmount() {
    if (gameState.betDeducted) return;

    try {
        const phone = localStorage.getItem('phone');
        const { data: gameData } = await supabase
            .from('guess_number_games')
            .select('bet')
            .eq('code', gameState.gameCode)
            .single();

        if (!gameData) {
            console.warn("Game data not found for bet deduction.");
            return;
        }

        gameState.betAmount = gameData.bet;

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', phone)
            .single();

        if (userError) throw userError;

        if (userData && userData.balance >= gameState.betAmount) {
            const newBalance = userData.balance - gameState.betAmount;
            const { error: updateError } = await supabase
                .from('users')
                .update({ balance: newBalance })
                .eq('phone', phone);

            if (updateError) throw updateError;

            gameState.betDeducted = true;
            showNotification(`Bet of ${gameState.betAmount} ETB deducted`, 'info');
        } else {
            displayMessage(gameStatusMessage, 'Insufficient balance to join game. Redirecting...', 'error');
            disableGuessInput();
            setTimeout(() => window.location.href = '/', 3000);
        }
    } catch (error) {
        console.error('Error deducting bet amount:', error);
        displayMessage(gameStatusMessage, 'Error deducting bet. Please try again.', 'error');
    }
}

async function updateGameInDatabase() {
    try {
        await supabase
            .from('guess_number_games')
            .update({
                guesses: gameState.guesses,
                status: gameState.gameStatus
            })
            .eq('code', gameState.gameCode);
    } catch (error) {
        console.error('Error updating game:', error);
    }
}

// --- Result Handling ---
async function showFinalResult(gameData) {
    const phone = localStorage.getItem('phone');
    const isWinner = gameData.winner === phone;

    gameResultModal.classList.add('active');
    disableGuessInput();

    resultTitle.textContent = isWinner ? 'You Won!' : 'You Lost!';
    
    if (gameData.result === 'number_guessed') {
        resultMessage.textContent = isWinner
        
            ? `You guessed the number correctly (${gameData.secret_number}) and won ${formatBalance(gameState.betAmount *1.8)}!`
            : `The opponent guessed the number! The secret number was ${gameData.secret_number}.`;
        
        resultAmount.textContent = isWinner 
            ? `+${formatBalance(gameState.betAmount *1.8)}` 
            : `-${formatBalance(gameState.betAmount)}`;
        
        resultAmount.className = isWinner ? 'result-amount win' : 'result-amount lose';
if(!isWinner){
    if(gameState.didwelose){
        await recordTransaction({
            player_phone: phone,
            transaction_type: 'loss',
            amount: - gameState.betAmount,
            game_id: gameState.gameCode,
            description: `Lost guessing game (${gameState.secretNumber}) `,
            status: 'completed'
        });
        gameState.didwelose=false;
    }
 
}



    } else if (gameData.result === 'no_guesses') {
        resultTitle.textContent = 'Game Ended';
        resultMessage.textContent = `The game ended without a correct guess. The secret number was ${gameData.secret_number}.`;
        resultAmount.textContent = `-${formatBalance(gameState.betAmount)}`;
        resultAmount.className = 'result-amount lose';
    }
}

function handleGameCancellation(gameData) {
    gameState.gameStatus = 'cancelled';
    displayMessage(gameStatusMessage, 'Game cancelled by creator', 'error');
    disableGuessInput();

    resultTitle.textContent = 'Game Cancelled';
    resultMessage.textContent = 'The game was cancelled by the creator.';
    resultAmount.textContent = 'Refund processed';
    resultAmount.className = 'result-amount';
    gameResultModal.classList.add('active');

    setTimeout(() => {
        window.location.href = '/';
    }, 5000);
}

// --- Realtime Updates ---
function setupRealtimeUpdates() {
    const channel = supabase
        .channel(`game:${gameState.gameCode}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'guess_number_games',
                filter: `code=eq.${gameState.gameCode}`
            },
            (payload) => {
                console.log('Realtime payload received:', payload);
                if (payload.new.status === 'cancelled') {
                    handleGameCancellation();
                    return;
                }
                // Update game state
                gameState.attempts = payload.new.attempts_left;
                gameState.gameStatus = payload.new.status;
                gameState.guesses = payload.new.guesses || [];

                // Handle opponent joining
                if (payload.new.opponent_phone && !gameState.opponent.phone) {
                    gameState.opponent = {
                        username: payload.new.opponent_username,
                        phone: payload.new.opponent_phone
                    };

                    // Start game if not already started
                    if (gameState.gameStatus === 'waiting') {
                        gameState.gameStatus = 'ongoing';
                        updateGameInDatabase();
                    }
                    deductBetAmount();
                    showNotification('Opponent has joined!', 'success');
                }

                // Update UI
                updateGameUI();

                // Handle game completion
                if (payload.new.status === 'finished') {
                    showFinalResult(payload.new);
                }
            }
        )
        .subscribe((status, err) => {
            console.log('Subscription status:', status);
            if (err) console.error('Subscription error:', err);
        });

    return channel;
}

// --- Game Exit Handling ---
// --- Updated Game Exit Handling ---
// --- Updated Game Exit Handling ---
async function leaveGame() {
    const phone = localStorage.getItem('phone');
    const isCreator = gameState.playerRole === 'creator';
    const opponentJoined = !!gameState.opponent.phone;
    
    if (confirm('Are you sure you want to leave this game?')) {
        try {
            if (isCreator) {
                if (!opponentJoined) {
                    // Creator leaves before opponent joins - mark as cancelled
                    console.log(`Creator leaving - no opponent - cancelling game ${gameState.gameCode}`);
                    await supabase
                        .from('guess_number_games')
                        .update({
                            status: 'cancelled',
                            result: 'creator_left_early'
                        })
                        .eq('code', gameState.gameCode);
                    
                    showNotification('Game cancelled', 'info');
                } else {
                    // Creator leaves after opponent joined - mark as creator left
                    console.log(`Creator leaving - opponent present - marking as abandoned`);
                    await supabase
                        .from('guess_number_games')
                        .update({
                            creator_left: true,
                            status: 'ongoing' // Keep game ongoing for opponent
                        })
                        .eq('code', gameState.gameCode);
                    
                    showNotification('You left the game - opponent can still play', 'info');
                    if(gameState.didwelose){
                        await recordTransaction({
                            player_phone: phone,
                            transaction_type: 'loss',
                            amount: - gameState.betAmount,
                            game_id: gameState.gameCode,
                            description: `You abounded the game of GNO `,
                            status: 'completed'
                        });
                        gameState.didwelose=false;
                    }
                }
            } else {
                // Opponent leaves - mark as opponent left
                console.log(`Opponent leaving - marking as abandoned`);
                await supabase
                    .from('guess_number_games')
                    .update({
                        opponent_left: true,
                        status: 'ongoing' // Keep game ongoing for creator
                    })
                    .eq('code', gameState.gameCode);
                
                showNotification('You left the game - creator can still play', 'info');
            }
        } catch (error) {
            console.error('Error leaving game:', error);
            showNotification('Error leaving game', 'error');
        } finally {
            window.history.back();
        }
    }
}

// Update beforeunload handler
window.addEventListener('beforeunload', async (e) => {
    if (gameState.playerRole === 'creator' && !gameState.opponent.phone) {
        try {
            await supabase
                .from('guess_number_games')
                .update({
                    status: 'cancelled',
                    result: 'creator_left_early'
                })
                .eq('code', gameState.gameCode);
        } catch (error) {
            console.error('Error cancelling game on page unload:', error);
        }
    }
});
// --- Event Listeners ---
function setupEventListeners() {
    copyCodeBtn.addEventListener('click', copyGameCode);
    submitGuessBtn.addEventListener('click', submitGuess);
    guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitGuess();
    });
    leaveGameBtn.addEventListener('click', () => leaveGame());
    resultCloseBtn.addEventListener('click', () => {
        gameResultModal.classList.remove('active');
        window.location.href = '/';
    });
    backBtn.addEventListener('click', async () => {
        await leaveGame(gameState.playerRole === 'creator');
    });
}

// --- Initialize Game ---
async function initializeGame() {
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');

    if (!gameState.gameCode) {
        displayMessage(gameStatusMessage, 'No game code provided', 'error');
        disableGuessInput();
        return;
    }

    gameCodeDisplay.textContent = gameState.gameCode;
    setupEventListeners();

    await loadGameData();
    setupRealtimeUpdates();
}

document.addEventListener('DOMContentLoaded', initializeGame);

async function updateHouseBalance(amount) {
    try {
      // Get current house balance
      const { data: house, error } = await supabase
        .from('house_balance')
        .select('balance')
        .eq('id', 1) // Assuming you have a row with id=1 for house balance
        .single();
  
      if (error) throw error;
  
      // Calculate new balance
      const newBalance = (house?.balance || 0) + amount;
  
      // Update house balance
      const { error: updateError } = await supabase
        .from('house_balance')
        .update({ balance: newBalance })
        .eq('id', 1);
  
      if (updateError) throw updateError;
  
      return newBalance;
    } catch (error) {
      console.error('House balance update error:', error);
      throw error;
    }
  }