// Supabase Setup
const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// DOM Elements
const gameStatusEl = document.getElementById('game-status');
const playerHandEl = document.getElementById('player-hand');
const opponentHandEl = document.getElementById('opponent-hand');
const playAreaEl = document.getElementById('play-area');
const gameCodeEl = document.getElementById('game-code');
const userAvatarEl = document.getElementById('user-avatar');
const usernameEl = document.getElementById('username');
const backBtn = document.getElementById('back-btn');

// Game state
let gameData = {};
let playerHand = [];
let opponentHandCount = 0;
let currentPlayer = null;
let gameChannel = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Back button
    backBtn.addEventListener('click', () => {
        window.location.href = 'home.html';
    });

    // Load user and game
    loadUserDetails();
    loadGame();
});

async function loadUserDetails() {
    try {
        const users = JSON.parse(localStorage.getItem('user'));
        if (!users) return;

        const { data, error } = await supabase
            .from('users')
            .select('username, balance')
            .eq('phone', users.phone)
            .single();

        if (error) throw error;
        
        // Update UI
        usernameEl.textContent = data.username || 'Guest';
        userAvatarEl.textContent = data.username ? data.username.charAt(0).toUpperCase() : 'U';
        userAvatarEl.style.backgroundColor = getRandomColor();
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

function getRandomColor() {
    const colors = ['#ff6b6b', '#51cf66', '#fcc419', '#228be6', '#be4bdb'];
    return colors[Math.floor(Math.random() * colors.length)];
}

async function loadGame() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameCode = urlParams.get('code');
    
    if (!gameCode) {
        window.location.href = '/';
        return;
    }
    
    gameCodeEl.textContent = gameCode;
    
    try {
        const users = JSON.parse(localStorage.getItem('user'));
        const { data, error } = await supabase
            .from('card_games')
            .select('*')
            .eq('code', gameCode)
            .single();
            
        if (error) throw error;
        if (!data) throw new Error('Game not found');
        
        gameData = data;
        updateGameUI();
    } catch (error) {
        console.error('Error loading game:', error);
        gameStatusEl.textContent = 'Error loading game';
        gameStatusEl.style.backgroundColor = '#f44336';
    }
}

function updateGameUI() {
    const users = JSON.parse(localStorage.getItem('user'));
    if (!users) return;

    const isCreator = users.phone === gameData.creator_phone;
    const isMyTurn = users.phone === gameData.current_player;
    
    // Update status
    gameStatusEl.textContent = isMyTurn ? 'Your turn!' : 'Waiting for opponent...';
    gameStatusEl.style.backgroundColor = isMyTurn ? '#4caf50' : '#2196f3';
    
    // Update hands
    if (isCreator) {
        playerHand = JSON.parse(gameData.creator_hand || '[]');
        opponentHandCount = JSON.parse(gameData.opponent_hand || '[]').length;
    } else {
        playerHand = JSON.parse(gameData.opponent_hand || '[]');
        opponentHandCount = JSON.parse(gameData.creator_hand || '[]').length;
    }
    
    // Render player hand
    playerHandEl.innerHTML = '';
    playerHand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        if (isMyTurn) cardEl.classList.add('playable');
        
        cardEl.innerHTML = `
            <div class="card-value">${card.value}</div>
            <div class="card-suit ${card.suit}"></div>
        `;
        
        if (isMyTurn) {
            cardEl.addEventListener('click', () => playCard(index));
        }
        
        playerHandEl.appendChild(cardEl);
    });
    
    // Update opponent info
    opponentHandEl.textContent = `${opponentHandCount} cards`;
}

async function playCard(cardIndex) {
    console.log('Playing card', cardIndex);
    // Implement your card playing logic here
    gameStatusEl.textContent = 'Card played!';
}
