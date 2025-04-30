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
        const phone = localStorage.getItem('phone');

        const { data: createdGameData, error } = await supabase
            .from('guess_number_games')  // Changed table name
            .insert([{
                code: gameCode,
                creator_phone: phone,
                creator_username: user.username,
                bet: bet,
                status: 'waiting',
                is_private: isPrivateGame,
                secret_number: generateSecretNumber(),  // Added for number guessing
                attempts_left: 8,  // Default attempts
                current_round: 1
            }])
            .select()
            .single();

        if (error) throw error;

        const newBalance = user.balance - bet;
        //await updateUserBalance(newBalance);

        window.location.href = `${BASE_URL}/game?code=${createdGameData.code}`;
    } catch (error) {
        console.error('Error creating game:', error);
        displayMessage(createGameStatusEl, 'Failed to create game', 'error');
    }
}

function generateSecretNumber() {
    // Generate a 4-digit number with unique digits
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let number = '';
    
    for (let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * digits.length);
        number += digits.splice(randomIndex, 1)[0];
    }
    
    return number;
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
          .from('guess_number_games')
          .select(`
              code, 
              creator_username, 
              bet,
              created_at,
              is_private
          `)
          .eq('status', 'waiting')
          .eq('is_private', false)
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
      emptyItem.textContent = 'No games available yet. Create one!';
      availableGamesListEl.appendChild(emptyItem);
      return;
  }

  games.forEach(game => {
      const gameItem = document.createElement('li');
      gameItem.className = 'game-item';
      
      gameItem.innerHTML = `
          <div class="game-info">
              <div class="game-creator">
                  <div class="creator-avatar" style="background-color: ${generateAvatarColor(game.creator_username)}">
                      ${game.creator_username?.charAt(0) || 'C'}
                  </div>
                  <span>${game.creator_username || 'Anonymous'}</span>
              </div>
              <div class="game-details">
                  <div class="game-detail">
                      <span class="material-icons" style="font-size: 16px;">attach_money</span>
                      <span>${game.bet} ETB</span>
                  </div>
                  <div class="game-detail game-code">
                      <span class="material-icons" style="font-size: 16px;">code</span>
                      <span>${game.code}</span>
                  </div>
                  <div class="game-detail">
                      <span class="material-icons" style="font-size: 16px;">schedule</span>
                      <span class="time-ago">${formatTimeAgo(game.created_at)}</span>
                  </div>
              </div>
          </div>
          <button class="join-btn" data-game-code="${game.code}" data-bet="${game.bet}">
              <span class="material-icons" style="font-size: 16px;">login</span>
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
            .from('guess_number_games')  // Changed table name
            .select('creator_phone, opponent_phone, bet, is_private, status')
            .eq('code', gameCode)
            .single();

        if (fetchError) throw fetchError;
        if (!gameData) throw new Error('Game not found');
        if (gameData.opponent_phone) throw new Error('Game is already full');
        if (gameData.bet !== gameBet) throw new Error('Bet amount mismatch');
        if (gameData.creator_phone === phone) throw new Error('Cannot join your own game');

        const newBalance = user.balance - gameBet;
        /*if (!await updateUserBalance(newBalance)) {
            throw new Error('Failed to update balance');
        }*/

        const { error: joinError } = await supabase
            .from('guess_number_games')  // Changed table name
            .update({
                opponent_phone: phone,
                opponent_username: user.username,
                status: 'ongoing'
            })
            .eq('code', gameCode);

        if (joinError) throw joinError;

        window.location.href = `${BASE_URL}/game?code=${gameCode}`;
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
            .from('guess_number_games')  // Changed table name
            .select('creator_phone, opponent_phone, bet, is_private, status')
            .eq('code', gameCode)
            .single();

        if (fetchError) throw fetchError;
        if (!gameData) throw new Error('Game not found');
        if (!gameData.is_private) throw new Error('This is not a private game');
        if (gameData.status !== 'waiting') throw new Error('Game is not available');
        
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
        .channel('guess_number_games_changes')  // Changed channel name
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'guess_number_games'  // Changed table name
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
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'home.html';
});
