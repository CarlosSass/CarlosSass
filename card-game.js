import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// --- Supabase Setup ---
const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- DOM Elements ---
const backBtn = document.getElementById('back-btn');
const gameCodeDisplay = document.getElementById('game-code-display');
const currentSuitDisplay = document.getElementById('current-suit');
const playerHandEl = document.getElementById('player-hand');
const opponentHandCountEl = document.getElementById('opponent-hand-count');
const discardPileEl = document.getElementById('discard-pile');
const gameStatusEl = document.getElementById('game-status');
const playerNameEl = document.getElementById('player-name');
const opponentNameEl = document.getElementById('opponent-name');
const playerAvatarEl = document.getElementById('player-avatar');
const opponentAvatarEl = document.getElementById('opponent-avatar');

// --- Game Constants ---
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SPECIAL_CARDS = {
    '8': 'change_suit',
    'J': 'change_suit',
    '5': 'skip_turn',
    '7': 'skip_turn',
    '2': 'draw_two',
    'A': 'spade_ace' // Special rule for A of spades
};

// --- Game State ---
let gameState = {
    gameCode: '',
    playerRole: '', // 'creator' or 'opponent'
    status: 'waiting', // 'waiting', 'ongoing', 'finished'
    currentPlayer: '',
    currentSuit: '',
    lastCard: null,
    playerHand: [],
    opponentHandCount: 0,
    creator: {},
    opponent: {},
    pendingAction: null, // 'draw_two', 'change_suit', etc.
    pendingActionData: null,
    betAmount: 0
};

// --- Initialize Game ---
document.addEventListener('DOMContentLoaded', async () => {
    // Get game code from URL
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');
    
    if (!gameState.gameCode) {
        window.location.href = '/';
        return;
    }
    
    //gameCodeDisplay.textContent = gameState.gameCode;
    
    // Load game data
    await loadGameData();
    setupEventListeners();
    setupRealtimeUpdates();
    
    // Back button handler
    backBtn.addEventListener('click', () => {
        window.location.href = 'home.html';
    });
});

// --- Game Functions ---
async function loadGameData() {
    try {
        const { data: gameData, error } = await supabase
            .from('card_games')
            .select('*')
            .eq('code', gameState.gameCode)
            .single();
            
        if (error) throw error;
        if (!gameData) throw new Error('Game not found');
        
        // Get current user
        const users = JSON.parse(localStorage.getItem('user'));
        gameState.playerRole = gameData.creator_phone === users.phone ? 'creator' : 'opponent';
        
        // Update game state
        gameState.status = gameData.status;
        gameState.currentPlayer = gameData.current_player;
        gameState.currentSuit = gameData.current_suit;
        gameState.lastCard = gameData.last_card ? JSON.parse(gameData.last_card) : null;
        gameState.betAmount = gameData.bet;
        
        // Set player hands
        if (gameState.playerRole === 'creator') {
            gameState.playerHand = JSON.parse(gameData.creator_hand || '[]');
            gameState.opponentHandCount = JSON.parse(gameData.opponent_hand || '[]').length;
        } else {
            gameState.playerHand = JSON.parse(gameData.opponent_hand || '[]');
            gameState.opponentHandCount = JSON.parse(gameData.creator_hand || '[]').length;
        }
        
        // Set player info
        gameState.creator = {
            username: gameData.creator_username,
            phone: gameData.creator_phone
        };
        
        if (gameData.opponent_phone) {
            gameState.opponent = {
                username: gameData.opponent_username,
                phone: gameData.opponent_phone
            };
        }
        
        // Check for pending actions
        if (gameData.pending_action) {
            gameState.pendingAction = gameData.pending_action;
            gameState.pendingActionData = gameData.pending_action_data;
        }
        
        // Update UI
        updateGameUI();
        
    } catch (error) {
        console.error('Error loading game:', error);
        gameStatusEl.textContent = 'Error loading game';
        setTimeout(() => window.location.href = '/', 3000);
    }
}

function updateGameUI() {
    // Update player info
    const users = JSON.parse(localStorage.getItem('user'));
    playerNameEl.textContent = users.username || 'You';
    opponentNameEl.textContent = gameState.opponent.username || 'Waiting...';
    
    // Generate avatar colors
    playerAvatarEl.style.backgroundColor = generateAvatarColor(users.username);
    opponentAvatarEl.style.backgroundColor = generateAvatarColor(gameState.opponent.username);
    
    // Update current suit display
    currentSuitDisplay.textContent = gameState.currentSuit 
        ? `${gameState.currentSuit.toUpperCase()}` 
        : 'Not set';
    currentSuitDisplay.className = `suit-${gameState.currentSuit}`;
    
    // Update opponent hand count
    opponentHandCountEl.textContent = `${gameState.opponentHandCount} cards`;
    
    // Update discard pile
    renderDiscardPile();
    
    // Update player hand
    renderPlayerHand();
    
    // Update game status
    if (gameState.status === 'waiting') {
        gameStatusEl.textContent = 'Waiting for opponent...';
    } else {
        const isMyTurn = users.phone === gameState.currentPlayer;
        gameStatusEl.textContent = isMyTurn ? 'Your turn!' : 'Opponent\'s turn';
        gameStatusEl.className = isMyTurn ? 'status-your-turn' : 'status-opponent-turn';
        
        // Handle pending actions
        if (isMyTurn && gameState.pendingAction) {
            handlePendingAction();
        }
    }
}

function renderPlayerHand() {
    playerHandEl.innerHTML = '';
    
    const isMyTurn = gameState.currentPlayer === JSON.parse(localStorage.getItem('user')).phone;
    
    gameState.playerHand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.suit} ${isMyTurn && canPlayCard(card) ? 'playable' : ''}`;
        cardEl.innerHTML = `
            <div class="card-value">${card.value}</div>
            <div class="card-suit"></div>
        `;
        
        if (isMyTurn && canPlayCard(card)) {
            cardEl.addEventListener('click', () => playCard(index));
        }
        
        playerHandEl.appendChild(cardEl);
    });
}

function canPlayCard(card) {
    // If no last card played, any card can be played
    if (!gameState.lastCard) return true;
    
    // If there's a pending action, only specific cards can be played
    if (gameState.pendingAction === 'draw_two') {
        return card.value === '2';
    }
    
    if (gameState.pendingAction === 'change_suit') {
        return true; // Can play any card when changing suit
    }
    
    // Normal play rules
    return card.suit === gameState.currentSuit || 
           card.value === gameState.lastCard.value ||
           (card.value in SPECIAL_CARDS);
}

function renderDiscardPile() {
    discardPileEl.innerHTML = '';
    
    if (gameState.lastCard) {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${gameState.lastCard.suit}`;
        cardEl.innerHTML = `
            <div class="card-value">${gameState.lastCard.value}</div>
            <div class="card-suit"></div>
        `;
        discardPileEl.appendChild(cardEl);
    }
}

async function playCard(cardIndex) {
    try {
        const users = JSON.parse(localStorage.getItem('user'));
        const card = gameState.playerHand[cardIndex];
        
        // Remove card from hand
        gameState.playerHand.splice(cardIndex, 1);
        
        // Update game state
        const isCreator = gameState.playerRole === 'creator';
        const opponentPhone = isCreator ? gameState.opponent.phone : gameState.creator.phone;
        
        const updateData = {
            last_card: JSON.stringify(card),
            current_player: opponentPhone, // Default to opponent's turn
            updated_at: new Date().toISOString()
        };
        
        // Handle special cards
        if (card.value in SPECIAL_CARDS) {
            const action = SPECIAL_CARDS[card.value];
            
            switch (action) {
                case 'change_suit':
                    // For 8 or J, player gets to choose new suit
                    if (card.value === '8' || card.value === 'J') {
                        gameState.pendingAction = 'change_suit';
                        updateData.pending_action = 'change_suit';
                        updateData.current_player = users.phone; // Stay on current player
                        showSuitSelector();
                    }
                    break;
                    
                case 'skip_turn':
                    // For 5 or 7, current player gets another turn
                    updateData.current_player = users.phone;
                    break;
                    
                case 'draw_two':
                    // For 2, next player must draw 2 unless they have a 2
                    gameState.pendingAction = 'draw_two';
                    updateData.pending_action = 'draw_two';
                    updateData.pending_action_data = 2; // Number of cards to draw
                    break;
                    
                case 'spade_ace':
                    // For A of spades, next player must draw 5 unless they have 2 of spades
                    if (card.suit === 'spades' && card.value === 'A') {
                        gameState.pendingAction = 'draw_two';
                        updateData.pending_action = 'draw_two';
                        updateData.pending_action_data = 5; // Special case for A of spades
                    }
                    break;
            }
        } else {
            // Normal card - update current suit
            gameState.currentSuit = card.suit;
            updateData.current_suit = card.suit;
        }
        
        // Update hands in database
        if (isCreator) {
            updateData.creator_hand = JSON.stringify(gameState.playerHand);
        } else {
            updateData.opponent_hand = JSON.stringify(gameState.playerHand);
        }
        
        // Check for win condition
        if (gameState.playerHand.length === 0) {
            updateData.status = 'finished';
            updateData.winner = users.phone;
            gameState.status = 'finished';
            
            // Calculate winnings (bet * 1.8)
            const winnings = Math.floor(gameState.betAmount * 1.8);
            
            // Update user balance
            const { data: userData } = await supabase
                .from('users')
                .select('balance')
                .eq('phone', users.phone)
                .single();
                
            if (userData) {
                const newBalance = userData.balance + winnings;
                await supabase
                    .from('users')
                    .update({ balance: newBalance })
                    .eq('phone', users.phone);
            }
            
            // Show win message
            showGameResult(true, winnings);
        }
        
        // Update game in database
        const { error } = await supabase
            .from('card_games')
            .update(updateData)
            .eq('code', gameState.gameCode);
            
        if (error) throw error;
        
    } catch (error) {
        console.error('Error playing card:', error);
        gameStatusEl.textContent = 'Error playing card';
    }
}

function showSuitSelector() {
    // Create suit selection modal
    const modal = document.createElement('div');
    modal.className = 'suit-selector-modal';
    modal.innerHTML = `
        <div class="suit-selector">
            <h3>Choose a suit:</h3>
            <div class="suit-options">
                ${SUITS.map(suit => `
                    <button class="suit-option ${suit}" data-suit="${suit}">
                        ${suit.toUpperCase()}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelectorAll('.suit-option').forEach(button => {
        button.addEventListener('click', async () => {
            const selectedSuit = button.dataset.suit;
            
            try {
                const users = JSON.parse(localStorage.getItem('user'));
                const isCreator = gameState.playerRole === 'creator';
                const opponentPhone = isCreator ? gameState.opponent.phone : gameState.creator.phone;
                
                // Update game state
                const { error } = await supabase
                    .from('card_games')
                    .update({
                        current_suit: selectedSuit,
                        current_player: opponentPhone,
                        pending_action: null,
                        pending_action_data: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('code', gameState.gameCode);
                    
                if (error) throw error;
                
                // Remove modal
                modal.remove();
                
            } catch (error) {
                console.error('Error selecting suit:', error);
                modal.remove();
            }
        });
    });
}

function handlePendingAction() {
    if (gameState.pendingAction === 'draw_two') {
        const drawCount = gameState.pendingActionData || 2;
        gameStatusEl.textContent = `You must play a 2 or draw ${drawCount} cards`;
    } else if (gameState.pendingAction === 'change_suit') {
        showSuitSelector();
    }
}

async function drawCard() {
    try {
        const users = JSON.parse(localStorage.getItem('user'));
        const isCreator = gameState.playerRole === 'creator';
        
        // Get current game state to see if there are cards left in deck
        const { data: gameData, error: fetchError } = await supabase
            .from('card_games')
            .select('deck')
            .eq('code', gameState.gameCode)
            .single();
            
        if (fetchError) throw fetchError;
        
        let deck = JSON.parse(gameData.deck || '[]');
        let drawnCards = [];
        
        // Handle pending draw actions
        if (gameState.pendingAction === 'draw_two') {
            const drawCount = gameState.pendingActionData || 2;
            
            // Draw the required number of cards or remaining cards
            for (let i = 0; i < drawCount && deck.length > 0; i++) {
                drawnCards.push(deck.pop());
            }
            
            // Add to player's hand
            gameState.playerHand = [...gameState.playerHand, ...drawnCards];
            
            // Clear pending action
            gameState.pendingAction = null;
            gameState.pendingActionData = null;
            
            // Update database
            const updateData = {
                deck: JSON.stringify(deck),
                pending_action: null,
                pending_action_data: null,
                current_player: isCreator ? gameState.opponent.phone : gameState.creator.phone,
                updated_at: new Date().toISOString()
            };
            
            if (isCreator) {
                updateData.creator_hand = JSON.stringify(gameState.playerHand);
            } else {
                updateData.opponent_hand = JSON.stringify(gameState.playerHand);
            }
            
            const { error } = await supabase
                .from('card_games')
                .update(updateData)
                .eq('code', gameState.gameCode);
                
            if (error) throw error;
            
        } else {
            // Normal draw (draw 1 card)
            if (deck.length > 0) {
                drawnCards.push(deck.pop());
                gameState.playerHand = [...gameState.playerHand, ...drawnCards];
                
                // Update database
                const updateData = {
                    deck: JSON.stringify(deck),
                    updated_at: new Date().toISOString()
                };
                
                if (isCreator) {
                    updateData.creator_hand = JSON.stringify(gameState.playerHand);
                } else {
                    updateData.opponent_hand = JSON.stringify(gameState.playerHand);
                }
                
                const { error } = await supabase
                    .from('card_games')
                    .update(updateData)
                    .eq('code', gameState.gameCode);
                    
                if (error) throw error;
            } else {
                gameStatusEl.textContent = 'No cards left to draw';
            }
        }
        
        // Update UI
        updateGameUI();
        
    } catch (error) {
        console.error('Error drawing card:', error);
        gameStatusEl.textContent = 'Error drawing card';
    }
}

function showGameResult(isWinner, amount) {
    const resultModal = document.createElement('div');
    resultModal.className = 'game-result-modal';
    resultModal.innerHTML = `
        <div class="result-content">
            <h2>${isWinner ? 'You Won!' : 'You Lost'}</h2>
            <p>${isWinner ? `You won ${amount} ETB!` : 'Better luck next time'}</p>
            <button id="result-close-btn">Close</button>
        </div>
    `;
    
    document.body.appendChild(resultModal);
    
    // Close button handler
    resultModal.querySelector('#result-close-btn').addEventListener('click', () => {
        resultModal.remove();
        window.location.href = 'home.html';
    });
}

function setupRealtimeUpdates() {
    const channel = supabase
        .channel(`card_game_${gameState.gameCode}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'card_games',
                filter: `code=eq.${gameState.gameCode}`
            },
            (payload) => {
                // Update game state
                gameState.status = payload.new.status;
                gameState.currentPlayer = payload.new.current_player;
                gameState.currentSuit = payload.new.current_suit;
                gameState.lastCard = payload.new.last_card ? JSON.parse(payload.new.last_card) : null;
                gameState.pendingAction = payload.new.pending_action;
                gameState.pendingActionData = payload.new.pending_action_data;
                
                // Update hands
                const users = JSON.parse(localStorage.getItem('user'));
                const isCreator = gameState.playerRole === 'creator';
                
                if (isCreator) {
                    gameState.playerHand = JSON.parse(payload.new.creator_hand || '[]');
                    gameState.opponentHandCount = JSON.parse(payload.new.opponent_hand || '[]').length;
                } else {
                    gameState.playerHand = JSON.parse(payload.new.opponent_hand || '[]');
                    gameState.opponentHandCount = JSON.parse(payload.new.creator_hand || '[]').length;
                }
                
                // Update opponent info if they just joined
                if (payload.new.opponent_phone && !gameState.opponent.phone) {
                    gameState.opponent = {
                        username: payload.new.opponent_username,
                        phone: payload.new.opponent_phone
                    };
                    
                    if (gameState.status === 'waiting') {
                        gameState.status = 'ongoing';
                    }
                }
                
                // Check for game over
                if (payload.new.status === 'finished') {
                    const isWinner = payload.new.winner === users.phone;
                    const amount = Math.floor(gameState.betAmount * 1.8);
                    showGameResult(isWinner, amount);
                }
                
                // Update UI
                updateGameUI();
            }
        )
        .subscribe();
        
    return channel;
}

function setupEventListeners() {
    // Draw card button
    const drawCardBtn = document.getElementById('draw-card-btn');
    if (drawCardBtn) {
        drawCardBtn.addEventListener('click', drawCard);
    }
}

function generateAvatarColor(username) {
    if (!username) return '#6c757d';
    const colors = ['#ff6b6b', '#51cf66', '#fcc419', '#228be6', '#be4bdb'];
    const hash = username.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
}
