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
const drawCardBtn = document.getElementById('draw-card-btn');
const skipTurnBtn = document.getElementById('skip-turn-btn');
const passTurnBtn = document.getElementById('pass-turn-btn');

// --- Game Constants ---
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SPECIAL_CARDS = {
    '8': 'change_suit',
    'J': 'change_suit',
    '5': 'skip_turn',
    '7': 'play_same_suit',
    '2': 'draw_two',
    'A': 'spade_ace'
};

// --- Game State ---
let gameState = {
    gameCode: '',
    playerRole: '',
    status: 'waiting',
    currentPlayer: '',
    currentSuit: '',
    lastCard: null,
    playerHand: [],
    opponentHandCount: 0,
    creator: {},
    opponent: {},
    pendingAction: null,
    pendingActionData: null,
    betAmount: 0,
    mustPlayHearts: false,
    hasDrawnCard: false
};

// --- Initialize Game ---
document.addEventListener('DOMContentLoaded', async () => {
    // Verify all required DOM elements exist
    const requiredElements = {
        backBtn,
        gameCodeDisplay,
        currentSuitDisplay,
        playerHandEl,
        opponentHandCountEl,
        discardPileEl,
        gameStatusEl,
        playerNameEl,
        opponentNameEl,
        playerAvatarEl,
        opponentAvatarEl,
        drawCardBtn
    };

    // Check for missing elements
    const missingElements = Object.entries(requiredElements)
        .filter(([name, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements.join(', '));
        
        if (gameStatusEl) {
            gameStatusEl.textContent = 'Game setup error - missing elements';
        }
    }

    // Get game code from URL
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');
    
    if (!gameState.gameCode) {
        console.error('No game code provided in URL');
        window.location.href = '/';
        return;
    }
    
    if (gameCodeDisplay) {
        gameCodeDisplay.textContent = gameState.gameCode;
    }
    
    try {
        await loadGameData();
        setupEventListeners();
        setupRealtimeUpdates();
    } catch (error) {
        console.error('Game initialization failed:', error);
        if (gameStatusEl) {
            gameStatusEl.textContent = 'Game initialization failed';
        }
    }
    
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'home.html';
        });
    }
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
        
        const users = JSON.parse(localStorage.getItem('user')) || {};
        gameState.playerRole = gameData.creator_phone === users.phone ? 'creator' : 'opponent';
        
        // Update game state
        gameState.status = gameData.status;
        gameState.currentPlayer = gameData.current_player;
        gameState.currentSuit = gameData.current_suit;
        gameState.lastCard = gameData.last_card ? safeParseJSON(gameData.last_card) : null;
        gameState.betAmount = gameData.bet;
        gameState.mustPlayHearts = gameData.current_suit === 'hearts';
        gameState.hasDrawnCard = false;
        
        // Set player hands
        if (gameState.playerRole === 'creator') {
            gameState.playerHand = safeParseJSON(gameData.creator_hand) || [];
            gameState.opponentHandCount = safeParseJSON(gameData.opponent_hand)?.length || 0;
        } else {
            gameState.playerHand = safeParseJSON(gameData.opponent_hand) || [];
            gameState.opponentHandCount = safeParseJSON(gameData.creator_hand)?.length || 0;
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
        
        updateGameUI();
        
    } catch (error) {
        console.error('Error loading game:', error);
        if (gameStatusEl) {
            gameStatusEl.textContent = 'Error loading game';
        }
        setTimeout(() => window.location.href = '/', 3000);
    }
}

function updateGameUI() {
    const users = JSON.parse(localStorage.getItem('user')) || {};
    const isMyTurn = users.phone === gameState.currentPlayer;
    
    if (playerNameEl) playerNameEl.textContent = users.username || 'You';
    if (opponentNameEl) opponentNameEl.textContent = gameState.opponent.username || 'Waiting...';
    
    if (playerAvatarEl) {
        playerAvatarEl.style.backgroundColor = generateAvatarColor(users.username);
        playerAvatarEl.textContent = users.username ? users.username.charAt(0).toUpperCase() : 'Y';
    }
    
    if (opponentAvatarEl) {
        opponentAvatarEl.style.backgroundColor = generateAvatarColor(gameState.opponent.username);
        opponentAvatarEl.textContent = gameState.opponent.username ? 
            gameState.opponent.username.charAt(0).toUpperCase() : 'O';
    }
    
    if (currentSuitDisplay) {
        currentSuitDisplay.textContent = gameState.currentSuit 
            ? `${gameState.currentSuit.toUpperCase()}` 
            : 'Not set';
        currentSuitDisplay.className = `suit-${gameState.currentSuit}`;
    }
    
    if (opponentHandCountEl) {
        opponentHandCountEl.textContent = `${gameState.opponentHandCount} cards`;
    }
    
    // Show/hide action buttons based on turn and game state
    if (drawCardBtn) {
        drawCardBtn.style.display = isMyTurn ? 'block' : 'none';
    }
    
    if (skipTurnBtn) {
        skipTurnBtn.style.display = 'none'; // Hide by default, shown in specific cases
    }
    
    if (passTurnBtn) {
        passTurnBtn.style.display = gameState.hasDrawnCard && isMyTurn ? 'block' : 'none';
    }
    
    // Show skip button if there's a pending action but can't play
    if (isMyTurn && gameState.pendingAction && !canPlayAnyCard() && skipTurnBtn) {
        skipTurnBtn.style.display = 'block';
    }
    
    renderDiscardPile();
    renderPlayerHand();
    
    if (gameStatusEl) {
        if (gameState.status === 'waiting') {
            gameStatusEl.textContent = 'Waiting for opponent...';
        } else {
            gameStatusEl.textContent = isMyTurn ? 'Your turn!' : 'Opponent\'s turn';
            gameStatusEl.className = isMyTurn ? 'status-your-turn' : 'status-opponent-turn';
            
            if (isMyTurn && gameState.pendingAction) {
                handlePendingAction();
            }
        }
    }
}

function renderPlayerHand() {
    if (!playerHandEl) return;
    
    playerHandEl.innerHTML = '';
    const users = JSON.parse(localStorage.getItem('user')) || {};
    const isMyTurn = gameState.currentPlayer === users.phone;
    
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
    
    // If there's a pending action, handle special cases
    if (gameState.pendingAction === 'draw_two') {
        return card.value === '2';
    }
    
    // Special cards can be played if they match suit or value
    if (card.value === '5' || card.value === '7') {
        return card.suit === gameState.currentSuit || 
               card.value === gameState.lastCard.value;
    }
    
    // Normal play rules - must match suit or value
    return card.suit === gameState.currentSuit || 
           card.value === gameState.lastCard.value;
}

function hasCardsOfSuit(suit) {
    return gameState.playerHand.some(card => card.suit === suit);
}

function hasSpecialCards(values) {
    return gameState.playerHand.some(card => values.includes(card.value));
}

function canPlayAnyCard() {
    return gameState.playerHand.some(card => canPlayCard(card));
}

function renderDiscardPile() {
    if (!discardPileEl) return;
    
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
        const users = JSON.parse(localStorage.getItem('user')) || {};
        if (!users.phone) throw new Error('User not logged in');
        
        if (gameState.currentPlayer !== users.phone) {
            displayMessage(gameStatusEl, "It's not your turn!", 'error');
            return;
        }

        const card = gameState.playerHand[cardIndex];
        if (!card) throw new Error('Invalid card index');
        
        // Handle 7 card - show selection dialog
        if (card.value === '7') {
            await handleSevenCard(cardIndex);
            return;
        }
        
        // For other cards, proceed normally
        await processCardPlay([card]);
        
    } catch (error) {
        console.error('Error playing card:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error playing card';
    }
}

async function handleSevenCard(initialCardIndex) {
    const initialCard = gameState.playerHand[initialCardIndex];
    const sameSuitCards = gameState.playerHand.filter(
        (card, index) => card.suit === initialCard.suit && index !== initialCardIndex
    );
    
    // If no other cards of same suit, treat as normal card
    if (sameSuitCards.length === 0) {
        await processCardPlay([initialCard]);
        return;
    }
    
    // Create selection modal
    const modal = document.createElement('div');
    modal.className = 'selection-modal';
    modal.innerHTML = `
        <div class="selection-content">
            <h3>Select cards to play with ${initialCard.value} of ${initialCard.suit}</h3>
            <div class="card-options">
                ${sameSuitCards.map((card, i) => `
                    <div class="card-option ${card.suit}" data-index="${gameState.playerHand.findIndex(c => 
                        c.suit === card.suit && c.value === card.value)}">
                        <div class="card-value">${card.value}</div>
                        <div class="card-suit"></div>
                    </div>
                `).join('')}
            </div>
            <div class="selection-actions">
                <button id="confirm-selection">Play Selected</button>
                <button id="skip-seven">Play Just This One</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Track selected cards
    const selectedIndices = [initialCardIndex];
    
    // Add selection handlers
    modal.querySelectorAll('.card-option').forEach(option => {
        option.addEventListener('click', () => {
            const index = parseInt(option.dataset.index);
            if (selectedIndices.includes(index)) {
                option.classList.remove('selected');
                selectedIndices.splice(selectedIndices.indexOf(index), 1);
            } else {
                option.classList.add('selected');
                selectedIndices.push(index);
            }
        });
    });
    
    // Add action handlers
    return new Promise((resolve) => {
        modal.querySelector('#confirm-selection').addEventListener('click', async () => {
            const cardsToPlay = selectedIndices.map(i => gameState.playerHand[i]);
            modal.remove();
            await processCardPlay(cardsToPlay);
            resolve();
        });
        
        modal.querySelector('#skip-seven').addEventListener('click', async () => {
            modal.remove();
            await processCardPlay([initialCard]);
            resolve();
        });
    });
}

async function processCardPlay(cardsToPlay) {
    const users = JSON.parse(localStorage.getItem('user')) || {};
    const isCreator = gameState.playerRole === 'creator';
    const opponentPhone = isCreator ? gameState.opponent.phone : gameState.creator.phone;
    
    // Remove cards from hand
    cardsToPlay.forEach(cardToRemove => {
        const index = gameState.playerHand.findIndex(
            c => c.suit === cardToRemove.suit && c.value === cardToRemove.value
        );
        if (index !== -1) {
            gameState.playerHand.splice(index, 1);
        }
    });
    
    // Use the last card played for game state
    const lastPlayedCard = cardsToPlay[cardsToPlay.length - 1];
    
    const updateData = {
        last_card: JSON.stringify(lastPlayedCard),
        current_player: opponentPhone,
        current_suit: lastPlayedCard.suit,
        updated_at: new Date().toISOString(),
        must_play_hearts: lastPlayedCard.suit === 'hearts'
    };
    
    // Handle special cards
    if (lastPlayedCard.value in SPECIAL_CARDS) {
        const action = SPECIAL_CARDS[lastPlayedCard.value];
        
        switch (action) {
            case 'change_suit':
                if (lastPlayedCard.value === '8' || lastPlayedCard.value === 'J') {
                    gameState.pendingAction = 'change_suit';
                    updateData.pending_action = 'change_suit';
                    updateData.current_player = users.phone;
                    showSuitSelector();
                }
                break;
                
            case 'skip_turn':
                updateData.current_player = users.phone;
                break;
                
            case 'draw_two':
                gameState.pendingAction = 'draw_two';
                updateData.pending_action = 'draw_two';
                updateData.pending_action_data = 2 * cardsToPlay.length;
                break;
                
            case 'spade_ace':
                if (lastPlayedCard.suit === 'spades' && lastPlayedCard.value === 'A') {
                    gameState.pendingAction = 'draw_two';
                    updateData.pending_action = 'draw_two';
                    updateData.pending_action_data = 5;
                }
                break;
                
            case 'play_same_suit':
                // 7s are already handled, no special action needed
                break;
        }
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
        
        const winnings = Math.floor(gameState.betAmount * 1.8);
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
        
        showGameResult(true, winnings);
    }
    
    // Update game in database
    const { error } = await supabase
        .from('card_games')
        .update(updateData)
        .eq('code', gameState.gameCode);
        
    if (error) throw error;
    
    gameState.hasDrawnCard = false;
    updateGameUI();
}

async function skipTurn() {
    try {
        const users = JSON.parse(localStorage.getItem('user')) || {};
        if (!users.phone) throw new Error('User not logged in');
        
        if (gameState.currentPlayer !== users.phone) {
            displayMessage(gameStatusEl, "It's not your turn!", 'error');
            return;
        }

        const isCreator = gameState.playerRole === 'creator';
        const opponentPhone = isCreator ? gameState.opponent.phone : gameState.creator.phone;
        
        const updateData = {
            current_player: opponentPhone,
            updated_at: new Date().toISOString(),
            pending_action: null,
            pending_action_data: null
        };
        
        const { error } = await supabase
            .from('card_games')
            .update(updateData)
            .eq('code', gameState.gameCode);
            
        if (error) throw error;
        
        gameState.pendingAction = null;
        gameState.pendingActionData = null;
        gameState.hasDrawnCard = false;
        updateGameUI();
        
    } catch (error) {
        console.error('Error skipping turn:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error skipping turn';
    }
}

async function passTurn() {
    try {
        const users = JSON.parse(localStorage.getItem('user')) || {};
        if (!users.phone) throw new Error('User not logged in');
        
        if (gameState.currentPlayer !== users.phone) {
            displayMessage(gameStatusEl, "It's not your turn!", 'error');
            return;
        }

        const isCreator = gameState.playerRole === 'creator';
        const opponentPhone = isCreator ? gameState.opponent.phone : gameState.creator.phone;
        
        const updateData = {
            current_player: opponentPhone,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('card_games')
            .update(updateData)
            .eq('code', gameState.gameCode);
            
        if (error) throw error;
        
        gameState.hasDrawnCard = false;
        updateGameUI();
        
    } catch (error) {
        console.error('Error passing turn:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error passing turn';
    }
}

async function drawCard() {
    try {
        const users = JSON.parse(localStorage.getItem('user')) || {};
        if (!users.phone) throw new Error('User not logged in');
        
        if (gameState.currentPlayer !== users.phone) {
            displayMessage(gameStatusEl, "It's not your turn!", 'error');
            return;
        }

        const isCreator = gameState.playerRole === 'creator';
        
        // Get current game state
        const { data: gameData, error: fetchError } = await supabase
            .from('card_games')
            .select('deck')
            .eq('code', gameState.gameCode)
            .single();
            
        if (fetchError) throw fetchError;
        
        let deck = safeParseJSON(gameData.deck) || [];
        let drawnCards = [];
        
        // Handle pending draw actions
        if (gameState.pendingAction === 'draw_two') {
            const drawCount = gameState.pendingActionData || 2;
            
            for (let i = 0; i < drawCount && deck.length > 0; i++) {
                drawnCards.push(deck.pop());
            }
            
            gameState.playerHand = [...gameState.playerHand, ...drawnCards];
            
            // Clear pending action
            gameState.pendingAction = null;
            gameState.pendingActionData = null;
            
            const updateData = {
                deck: JSON.stringify(deck),
                pending_action: null,
                pending_action_data: null,
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
                gameState.hasDrawnCard = true;
                
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
            } else if (gameStatusEl) {
                gameStatusEl.textContent = 'No cards left to draw';
            }
        }
        
        updateGameUI();
        
    } catch (error) {
        console.error('Error drawing card:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error drawing card';
    }
}

function setupEventListeners() {
    if (drawCardBtn) {
        drawCardBtn.addEventListener('click', drawCard);
    }
    
    if (skipTurnBtn) {
        skipTurnBtn.addEventListener('click', skipTurn);
    }
    
    if (passTurnBtn) {
        passTurnBtn.addEventListener('click', passTurn);
    }
}

function generateAvatarColor(username) {
    if (!username) return '#6c757d';
    const colors = ['#ff6b6b', '#51cf66', '#fcc419', '#228be6', '#be4bdb'];
    const hash = username.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
}

function showSuitSelector() {
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
    
    // Auto-close after selection
    modal.querySelectorAll('.suit-option').forEach(button => {
        button.addEventListener('click', async () => {
            const selectedSuit = button.dataset.suit;
            modal.remove();
            
            try {
                const users = JSON.parse(localStorage.getItem('user')) || {};
                if (!users.phone) throw new Error('User not logged in');
                
                const isCreator = gameState.playerRole === 'creator';
                const opponentPhone = isCreator ? gameState.opponent.phone : gameState.creator.phone;
                
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
                
            } catch (error) {
                console.error('Error selecting suit:', error);
            }
        });
    });
}

function handlePendingAction() {
    if (!gameStatusEl) return;
    
    if (gameState.pendingAction === 'draw_two') {
        const drawCount = gameState.pendingActionData || 2;
        gameStatusEl.textContent = `You must play a 2 or draw ${drawCount} cards`;
    } else if (gameState.pendingAction === 'change_suit') {
        showSuitSelector();
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
    
    const closeBtn = resultModal.querySelector('#result-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            resultModal.remove();
            window.location.href = 'home.html';
        });
    }
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
                try {
                    gameState.status = payload.new.status;
                    gameState.currentPlayer = payload.new.current_player;
                    gameState.currentSuit = payload.new.current_suit;
                    
                    if (payload.new.last_card) {
                        try {
                            gameState.lastCard = typeof payload.new.last_card === 'string' ? 
                                JSON.parse(payload.new.last_card) : 
                                payload.new.last_card;
                        } catch (e) {
                            console.error('Error parsing last_card:', e);
                            gameState.lastCard = null;
                        }
                    } else {
                        gameState.lastCard = null;
                    }
                    
                    gameState.pendingAction = payload.new.pending_action;
                    gameState.pendingActionData = payload.new.pending_action_data;
                    gameState.mustPlayHearts = payload.new.must_play_hearts || false;
                    gameState.hasDrawnCard = false;
                    
                    const users = JSON.parse(localStorage.getItem('user')) || {};
                    const isCreator = gameState.playerRole === 'creator';
                    
                    if (isCreator) {
                        gameState.playerHand = safeParseJSON(payload.new.creator_hand) || [];
                        gameState.opponentHandCount = safeParseJSON(payload.new.opponent_hand)?.length || 0;
                    } else {
                        gameState.playerHand = safeParseJSON(payload.new.opponent_hand) || [];
                        gameState.opponentHandCount = safeParseJSON(payload.new.creator_hand)?.length || 0;
                    }
                    
                    if (payload.new.opponent_phone && !gameState.opponent.phone) {
                        gameState.opponent = {
                            username: payload.new.opponent_username,
                            phone: payload.new.opponent_phone
                        };
                        
                        if (gameState.status === 'waiting') {
                            gameState.status = 'ongoing';
                        }
                    }
                    
                    if (payload.new.status === 'finished') {
                        const isWinner = payload.new.winner === users.phone;
                        const amount = Math.floor(gameState.betAmount * 1.8);
                        showGameResult(isWinner, amount);
                    }
                    
                    updateGameUI();
                } catch (error) {
                    console.error('Error processing realtime update:', error);
                }
            }
        )
        .subscribe();
        
    return channel;
}

function safeParseJSON(json) {
    try {
        return typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        console.error('Error parsing JSON:', e);
        return null;
    }
}

function displayMessage(element, message, type = 'info') {
    if (!element) return;
    
    element.textContent = message;
    element.className = `status-message ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status-message';
        }, 3000);
    }
}
