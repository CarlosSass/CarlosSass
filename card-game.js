// card-game.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Supabase setup (same as above)

// Game elements
const gameStatusEl = document.getElementById('game-status');
const playerHandEl = document.getElementById('player-hand');
const opponentHandEl = document.getElementById('opponent-hand');
const playAreaEl = document.getElementById('play-area');
const playCardBtn = document.getElementById('play-card-btn');
const gameCodeEl = document.getElementById('game-code');

// Initialize Supabase
const supabase = createClient(
  'https://evberyanshxxalxtwnnc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw'
);

// Utility function for displaying messages
function displayMessage(element, message, type = 'info') {
  element.textContent = message;
  element.className = `status-message ${type}`;
}

// Rest of your existing code...
let gameData = {};
let playerHand = [];
let opponentHandCount = 0;
let currentPlayer = null;
let gameChannel = null;

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
        currentPlayer = gameData.current_player;
        
        // Determine if current user is creator or opponent
        const isCreator = users.phone === gameData.creator_phone;
        
        if (isCreator) {
            playerHand = JSON.parse(gameData.creator_hand || '[]');
            opponentHandCount = JSON.parse(gameData.opponent_hand || '[]').length;
        } else {
            playerHand = JSON.parse(gameData.opponent_hand || '[]');
            opponentHandCount = JSON.parse(gameData.creator_hand || '[]').length;
        }
        
        updateGameUI();
        setupRealtimeUpdates(gameCode);
    } catch (error) {
        console.error('Error loading game:', error);
        displayMessage(gameStatusEl, error.message || 'Failed to load game', 'error');
    }
}

function updateGameUI() {
    const users = JSON.parse(localStorage.getItem('user'));
    const isMyTurn = users.phone === currentPlayer;
    
    // Update status message
    if (isMyTurn) {
        gameStatusEl.textContent = 'Your turn - play a card!';
        gameStatusEl.className = 'status-message success';
    } else {
        gameStatusEl.textContent = 'Waiting for opponent...';
        gameStatusEl.className = 'status-message info';
    }
    
    // Render player's hand
    playerHandEl.innerHTML = '';
    playerHand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${isMyTurn ? 'playable' : ''}`;
        cardEl.dataset.index = index;
        cardEl.innerHTML = `
            <div class="card-value">${card.value}</div>
            <div class="card-suit ${card.suit}"></div>
        `;
        
        if (isMyTurn) {
            cardEl.addEventListener('click', () => playCard(index));
        }
        
        playerHandEl.appendChild(cardEl);
    });
    
    // Show opponent's card count
    opponentHandEl.textContent = `Opponent has ${opponentHandCount} cards`;
    
    // Update play area if cards have been played
    if (gameData.discard_pile) {
        const discardPile = JSON.parse(gameData.discard_pile);
        // Render last played cards
    }
}

async function playCard(cardIndex) {
    try {
        const users = JSON.parse(localStorage.getItem('user'));
        const card = playerHand[cardIndex];
        
        // Remove card from hand
        playerHand.splice(cardIndex, 1);
        
        // Update game state in database
        const isCreator = users.phone === gameData.creator_phone;
        const updateData = {
            current_player: isCreator ? gameData.opponent_phone : gameData.creator_phone,
            updated_at: new Date().toISOString()
        };
        
        if (isCreator) {
            updateData.creator_hand = JSON.stringify(playerHand);
        } else {
            updateData.opponent_hand = JSON.stringify(playerHand);
        }
        
        // Add to discard pile
        const discardPile = gameData.discard_pile ? JSON.parse(gameData.discard_pile) : [];
        discardPile.push({
            card,
            player: users.phone
        });
        updateData.discard_pile = JSON.stringify(discardPile);
        
        const { error } = await supabase
            .from('card_games')
            .update(updateData)
            .eq('code', gameData.code);
            
        if (error) throw error;
        
        // The realtime update will refresh the UI
    } catch (error) {
        console.error('Error playing card:', error);
        displayMessage(gameStatusEl, 'Failed to play card', 'error');
    }
}

function setupRealtimeUpdates(gameCode) {
    gameChannel = supabase
        .channel(`card_game_${gameCode}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'card_games',
                filter: `code=eq.${gameCode}`
            },
            (payload) => {
                gameData = payload.new;
                currentPlayer = gameData.current_player;
                
                const users = JSON.parse(localStorage.getItem('user'));
                const isCreator = users.phone === gameData.creator_phone;
                
                if (isCreator) {
                    playerHand = JSON.parse(gameData.creator_hand || '[]');
                    opponentHandCount = JSON.parse(gameData.opponent_hand || '[]').length;
                } else {
                    playerHand = JSON.parse(gameData.opponent_hand || '[]');
                    opponentHandCount = JSON.parse(gameData.creator_hand || '[]').length;
                }
                
                updateGameUI();
                
                // Check for game over conditions
                if (gameData.status === 'completed') {
                    endGame();
                }
            }
        )
        .subscribe();
}

function endGame() {
    const users = JSON.parse(localStorage.getItem('user'));
    const isWinner = users.phone === gameData.winner;
    
    if (isWinner) {
        displayMessage(gameStatusEl, 'You won the game!', 'success');
    } else {
        displayMessage(gameStatusEl, 'You lost the game', 'error');
    }
    
    // Disable further plays
    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('playable');
    });
}

// Initialize game
loadGame();
