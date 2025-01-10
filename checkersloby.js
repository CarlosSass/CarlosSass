import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- Supabase Setup ---
const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- DOM Elements ---
const usernameEl = document.getElementById('username');
const userAvatarEl = document.getElementById('user-avatar');
const balanceAmountEl = document.getElementById('balance-amount');
const createBetButtonsContainer = document.getElementById('create-bet-buttons');
const createGameStatusEl = document.getElementById('create-game-status');
const availableGamesListEl = document.getElementById('available-games-list');
const gamesCountEl = document.getElementById('games-count');
const refreshGamesBtn = document.getElementById('refresh-games-btn');
const createGameBtn = document.getElementById('create-game-btn');
const joinPrivateBtn = document.getElementById('join-private-btn');
const privateGameCodeInput = document.getElementById('private-game-code');
const joinPrivateStatus = document.getElementById('join-private-status');

// --- Game Configuration ---
const betOptions = [10, 25, 50, 100, 250];
const BASE_URL = window.location.origin;
let user = {};
let selectedBet = null;
let isPrivateGame = false;
let supabaseChannel = null;

// --- Utility Functions ---
const displayMessage = (element, message, type = 'info') => {
    if (!element) return;
    
    element.textContent = message;
    element.className = `status-message ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status-message';
        }, 3000);
    }
};

const formatBalance = (amount) => {
    return amount?.toLocaleString() + ' ETB' || '0 ETB';
};

const generateAvatarColor = (username) => {
    if (!username) return '#6c757d';
    const colors = [
        '#ff6b6b', '#51cf66', '#fcc419', '#228be6', 
        '#be4bdb', '#20c997', '#fd7e14', '#868e96'
    ];
    const hash = username.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
};

// --- User Management ---
async function loadUserDetails() {
    const phone = localStorage.getItem('phone');
    if (!phone) {
        console.error('No user session found');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('username, balance')
            .eq('phone', phone)
            .single();

        if (error) throw error;

        user = data || {};
        updateUserUI();
    } catch (error) {
        console.error('Error loading user details:', error);
        displayMessage(createGameStatusEl, 'Failed to load user data', 'error');
    }
}

function updateUserUI() {
    if (usernameEl) usernameEl.textContent = user.username || 'Guest';
    if (balanceAmountEl) balanceAmountEl.textContent = formatBalance(user.balance);
    if (userAvatarEl) {
        const initials = user.username ? user.username.charAt(0).toUpperCase() : 'U';
        userAvatarEl.textContent = initials;
        userAvatarEl.style.backgroundColor = generateAvatarColor(user.username);
    }
}

async function updateUserBalance(newBalance) {
    try {
        const phone = localStorage.getItem('phone');
        const { error } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('phone', phone);

        if (error) throw error;

        user.balance = newBalance;
        updateUserUI();
        return true;
    } catch (error) {
        console.error('Error updating balance:', error);
        return false;
    }
}

// --- Game Creation ---
function setupBetButtons() {
    createBetButtonsContainer.innerHTML = '';
    
    betOptions.forEach(bet => {
        const button = document.createElement('button');
        button.textContent = `${bet} ETB`;
        button.classList.add('bet-button');
        
        if (user.balance < bet) {
            button.disabled = true;
            button.classList.add('disabled');
        }
        
        button.addEventListener('click', () => {
            document.querySelectorAll('.bet-button').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            selectedBet = bet;
        });
        
        createBetButtonsContainer.appendChild(button);
    });

    document.getElementById('private-game-toggle')?.addEventListener('change', (e) => {
        isPrivateGame = e.target.checked;
    });

    createGameBtn?.addEventListener('click', () => {
        if (!selectedBet) {
            displayMessage(createGameStatusEl, 'Please select a bet amount', 'error');
            return;
        }
        createGame(selectedBet);
    });
}

async function createGame(bet) {
    if (!validateGameCreation(bet)) return;

    displayMessage(createGameStatusEl, 'Creating game...', 'info');

    try {
        const gameCode = generateGameCode();
        const initialCheckersState = 'start'; // Initial checkers state
        const phone = localStorage.getItem('phone');

        const { data: createdGameData, error } = await supabase
            .from('chess_games') // Changed from chess_games to checkers_games
            .insert([{
                code: gameCode,
                white_phone: phone,
                white_username: user.username,
                bet: bet,
                state: initialCheckersState, // Changed from fen to state
                turn: 'white',
                status: 'waiting',
                is_private: isPrivateGame,
                game_type: 'checkers' // Added game type
            }])
            .select()
            .single();

        if (error) throw error;

        const newBalance = user.balance - bet;
        //await updateUserBalance(newBalance);

        window.location.href = `${BASE_URL}/checkers?code=${createdGameData.code}&color=white`; // Changed to checkers page
    } catch (error) {
        console.error('Error creating game:', error);
        displayMessage(createGameStatusEl, 'Failed to create game', 'error');
    }
}

function validateGameCreation(bet) {
    if (!bet || isNaN(bet)) {
        displayMessage(createGameStatusEl, 'Invalid bet amount', 'error');
        return false;
    }

    if (user.balance < bet) {
        displayMessage(createGameStatusEl, 'Insufficient balance', 'error');
        return false;
    }

    return true;
}

function generateGameCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- Game Listing ---
async function fetchAvailableGames() {
    try {
        const { data, error } = await supabase
            .from('chess_games') // Changed from chess_games to checkers_games
            .select(`
                code, 
                white_username, 
                bet,
                created_at,
                is_private
            `)
            .eq('status', 'waiting')
            .eq('is_private', false)
            .eq('game_type', 'checkers') // Only show checkers games
            .order('created_at', { ascending: true });

        if (error) throw error;

        displayAvailableGames(data || []);
        updateGamesCount(data?.length || 0);
    } catch (error) {
        console.error("Error fetching available games:", error);
        displayMessage(createGameStatusEl, 'Failed to load games', 'error');
    }
}

function displayAvailableGames(games) {
    if (!availableGamesListEl) return;

    availableGamesListEl.innerHTML = '';

    if (!games.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'no-games';
        emptyItem.textContent = 'No checkers games available yet. Create one!';
        availableGamesListEl.appendChild(emptyItem);
        return;
    }

    games.forEach(game => {
        const gameItem = document.createElement('li');
        gameItem.className = 'game-item';
        
        gameItem.innerHTML = `
            <div class="game-info">
                <div class="game-creator">
                    <div class="creator-avatar" style="background-color: ${generateAvatarColor(game.white_username)}">
                        ${game.white_username?.charAt(0) || 'C'}
                    </div>
                    <span class="creator-name">${game.white_username || 'Anonymous'}</span>
                </div>
                <div class="game-details">
                    <div class="game-detail">
                        <svg class="detail-icon" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" fill="currentColor"/>
                        </svg>
                        <span>${game.bet} ETB</span>
                    </div>
                    <div class="game-detail">
                        <svg class="detail-icon" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" fill="currentColor"/>
                        </svg>
                        <span>Checkers</span>
                    </div>
                </div>
            </div>
            <button class="join-btn" data-game-code="${game.code}" data-bet="${game.bet}">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
                </svg>
                Join
            </button>
        `;

        availableGamesListEl.appendChild(gameItem);
    });

    document.querySelectorAll('.join-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const gameCode = button.dataset.gameCode;
            const gameBet = parseInt(button.dataset.bet);
            await joinGame(gameCode, gameBet);
        });
    });
}

function updateGamesCount(count) {
    if (gamesCountEl) {
        gamesCountEl.textContent = count;
        gamesCountEl.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// --- Game Joining ---
async function joinGame(gameCode, gameBet) {
    if (!validateJoinGame(gameBet)) return;

    displayMessage(createGameStatusEl, 'Joining game...', 'info');

    try {
        const phone = localStorage.getItem('phone');
        const { data: gameData, error: fetchError } = await supabase
            .from('chess_games') // Changed from chess_games to checkers_games
            .select('white_phone, black_phone, bet, is_private')
            .eq('code', gameCode)
            .single();

        if (fetchError) throw fetchError;
        if (!gameData) throw new Error('Game not found');
        if (gameData.black_phone) throw new Error('Game is already full');
        if (gameData.bet !== gameBet) throw new Error('Bet amount mismatch');
        if (gameData.white_phone === phone) throw new Error('Cannot join your own game');

        const newBalance = user.balance - gameBet;
        /*if (!await updateUserBalance(newBalance)) {
            throw new Error('Failed to update balance');
        }*/

        const { error: joinError } = await supabase
            .from('chess_games') // Changed from chess_games to checkers_games
            .update({
                black_phone: phone,
                black_username: user.username,
                status: 'ongoing'
            })
            .eq('code', gameCode);

        if (joinError) throw joinError;

        window.location.href = `${BASE_URL}/checkers?code=${gameCode}&color=black`; // Changed to checkers page
    } catch (error) {
        console.error('Error joining game:', error);
        displayMessage(createGameStatusEl, error.message || 'Failed to join game', 'error');
    }
}

function validateJoinGame(gameBet) {
    if (user.balance < gameBet) {
        displayMessage(createGameStatusEl, 'Insufficient balance', 'error');
        return false;
    }
    return true;
}

// --- Private Game Joining ---
async function handleJoinPrivateGame() {
    const gameCode = privateGameCodeInput.value.trim();
    
    if (!gameCode) {
        displayMessage(joinPrivateStatus, 'Please enter a game code', 'error');
        return;
    }

    try {
        displayMessage(joinPrivateStatus, 'Checking game...', 'info');
        
        const { data: gameData, error: fetchError } = await supabase
            .from('chess_games') // Changed from chess_games to checkers_games
            .select('white_phone, black_phone, bet, is_private, status, game_type')
            .eq('code', gameCode)
            .single();

        if (fetchError) throw fetchError;
        if (!gameData) throw new Error('Game not found');
        if (!gameData.is_private) throw new Error('This is not a private game');
        if (gameData.status !== 'waiting') throw new Error('Game is not available');
        if (gameData.game_type !== 'checkers') throw new Error('This is not a checkers game');
        
        await joinGame(gameCode, gameData.bet);
    } catch (error) {
        console.error('Error joining private game:', error);
        displayMessage(joinPrivateStatus, error.message || 'Failed to join private game', 'error');
    }
}

// --- Realtime Updates ---
function setupRealtimeUpdates() {
    if (supabaseChannel) {
        supabaseChannel.unsubscribe();
    }

    supabaseChannel = supabase
        .channel('chess_games') // Changed channel name
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'checkers_games' // Changed table name
            },
            () => {
                fetchAvailableGames();
            }
        )
        .subscribe();
}

// --- Event Listeners ---
function setupEventListeners() {
    refreshGamesBtn?.addEventListener('click', fetchAvailableGames);
    joinPrivateBtn?.addEventListener('click', handleJoinPrivateGame);
    privateGameCodeInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleJoinPrivateGame();
        }
    });
}

// --- Initialize App ---
async function init() {
    setupEventListeners();
    await loadUserDetails();
    setupBetButtons();
    await fetchAvailableGames();
    setupRealtimeUpdates();
}

// Start the application
init();

// Back button functionality
document.getElementById('back-btn')?.addEventListener('click', () => {
    window.location.href = 'home.html';
});
