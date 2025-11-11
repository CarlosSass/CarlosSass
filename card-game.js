
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
const passTurnBtn = document.getElementById('pass-turn-btn');

// --- Game Constants ---
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SPECIAL_CARDS = {
    '8': 'change_suit',  // Keeps original ability
    'J': 'change_suit',  // Keeps original ability
    '5': 'skip_turn',
    '7': 'play_multiple',  // Changed from 'play_same_suit' to allow any suit with 7
    '2': 'draw_two',
    'A': 'spade_ace_only'  // Changed to only work with Ace of Spades
};

// --- CSS for Dialogs ---
const style = document.createElement('style');
style.textContent = `
/* Card Selection Modal */
.card-selection-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.selection-content {
    background-color: #2c3e50;
    padding: 20px;
    border-radius: 10px;
    width: 90%;
    max-width: 500px;
    color: white;
}

.card-selection-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 20px 0;
    justify-content: center;
}

.card-option {
    width: 60px;
    height: 90px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 5px;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s, box-shadow 0.2s;
}

.card-option.selected {
    transform: translateY(-10px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.card-option.hearts, .card-option.diamonds {
    background-color: white;
    color: red;
}

.card-option.clubs, .card-option.spades {
    background-color: white;
    color: black;
}

.selection-actions {
    display: flex;
    justify-content: space-between;
    gap: 10px;
}

.selection-actions button {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
}

.selection-actions button:first-child {
    background-color: #27ae60;
    color: white;
}

.selection-actions button:last-child {
    background-color: #e74c3c;
    color: white;
}

/* Suit Selector Modal */
.suit-selector-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.suit-selector {
    background-color: #2c3e50;
    padding: 20px;
    border-radius: 10px;
    width: 90%;
    max-width: 400px;
    color: white;
    text-align: center;
}

.suit-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
    justify-content: center;
}

.suit-option {
    padding: 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    min-width: 80px;
    color: white;
}

.suit-option.hearts {
    background-color: #e74c3c;
}

.suit-option.diamonds {
    background-color: #3498db;
}

.suit-option.clubs {
    background-color: #2ecc71;
}

.suit-option.spades {
    background-color: #9b59b6;
}

/* Game Result Modal */
.game-result-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.result-content {
    background-color: #2c3e50;
    padding: 30px;
    border-radius: 10px;
    width: 90%;
    max-width: 400px;
    color: white;
    text-align: center;
}

.result-content h2 {
    color: #f1c40f;
    margin-bottom: 20px;
}

#result-close-btn {
    background-color: #3498db;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    margin-top: 20px;
    font-weight: bold;
}
`;
document.head.appendChild(style);


// Modify the canPlayCard function to implement the new rules
function canPlayCard(card) {
    // If no last card played, any card can be played
    if (!gameState.lastCard) return true;
    
    // If there's a pending draw action, only 2s can be played
    if (gameState.pendingAction === 'draw_two') {
        return card.value === '2' && 
               (card.suit === gameState.currentSuit || 
                card.value === gameState.lastCard.value);
    }
    
    // If must play specific suit, only that suit can be played
    if (gameState.mustPlaySuit && gameState.currentSuitToMatch) {
        return card.suit === gameState.currentSuitToMatch;
    }
    
    // Handle 2 cards - can only be played on same suit or another 2
    if (card.value === '2') {
        return card.suit === gameState.currentSuit || 
               gameState.lastCard.value === '2';
    }
    
    // Handle 7 card - can be played with any 8 or J regardless of suit
    if (card.value === '7') {
        // Can play on same suit or value as last card
        if (card.suit === gameState.currentSuit || card.value === gameState.lastCard.value) {
            return true;
        }
        
        // Additionally, can be played with any 8 or J in hand
        const hasEightOrJack = gameState.playerHand.some(c => 
            (c.value === '8' || c.value === 'J') && c !== card
        );
        return hasEightOrJack;
    }
    
    // Handle 8 and J - can be played with any 7 regardless of suit
    if (card.value === '8' || card.value === 'J') {
        // Can play on same suit or value as last card
        if (card.suit === gameState.currentSuit || card.value === gameState.lastCard.value) {
            return true;
        }
        
        // Additionally, can be played with any 7 in hand
        const hasSeven = gameState.playerHand.some(c => 
            c.value === '7' && c !== card
        );
        return hasSeven;
    }
    
    // Handle Ace - only Ace of Spades is special
    if (card.value === 'A') {
        // Only special if it's Ace of Spades
        if (card.suit === 'spades') {
            return true;
        }
        // Normal Ace can only be played on same suit or value
        return card.suit === gameState.currentSuit || 
               card.value === gameState.lastCard.value;
    }
    
    // Normal play rules - must match suit or value
    return card.suit === gameState.currentSuit || 
           card.value === gameState.lastCard.value;
}


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
    mustPlaySuit: false,
    currentSuitToMatch: '',
    hasDrawnThisTurn: false,
    discardPile: []
};

// --- Initialize Game ---
document.addEventListener('DOMContentLoaded', async () => {
    // Verify required DOM elements
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
        drawCardBtn,
        passTurnBtn
    };

    // Check for missing elements
    const missingElements = Object.entries(requiredElements)
        .filter(([name, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements.join(', '));
        if (gameStatusEl) gameStatusEl.textContent = 'Game setup error - missing elements';
    }

    // Get game code from URL
    const params = new URLSearchParams(window.location.search);
    gameState.gameCode = params.get('code');
    
    if (!gameState.gameCode) {
        console.error('No game code provided in URL');
        window.location.href = '/';
        return;
    }
    
    if (gameCodeDisplay) gameCodeDisplay.textContent = gameState.gameCode;
    
    try {
        await loadGameData();
        setupEventListeners();
        setupRealtimeUpdates();
    } catch (error) {
        console.error('Game initialization failed:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Game initialization failed';
    }
    
    if (backBtn) backBtn.addEventListener('click', () => window.location.href = 'home.html');
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
        gameState.mustPlaySuit = gameData.must_play_suit || false;
        gameState.currentSuitToMatch = gameData.current_suit_to_match || '';
        gameState.hasDrawnThisTurn = gameData.has_drawn_this_turn || false;
        gameState.discardPile = gameData.discard_pile ? safeParseJSON(gameData.discard_pile) : [];
        
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
        if (gameStatusEl) gameStatusEl.textContent = 'Error loading game';
        setTimeout(() => window.location.href = '/', 3000);
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

// Update the processCardPlay function to handle the new Ace behavior
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
        current_suit: lastPlayedCard.suit,
        updated_at: new Date().toISOString(),
        must_play_suit: false,
        current_suit_to_match: '',
        has_drawn_this_turn: false
    };
    
    // Add played cards to discard pile (except last card)
    const cardsToDiscard = cardsToPlay.slice(0, -1);
    if (cardsToDiscard.length > 0) {
        updateData.discard_pile = JSON.stringify([
            ...gameState.discardPile,
            ...cardsToDiscard
        ]);
    }
    
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
                // Handle draw two stacking
                let drawCount = 2;
                if (gameState.pendingAction === 'draw_two') {
                    // If already in a draw two sequence, add to the count
                    drawCount = (gameState.pendingActionData || 2) + 2;
                } else {
                    // Start new draw two sequence
                    drawCount = 2;
                }
                
                gameState.pendingAction = 'draw_two';
                updateData.pending_action = 'draw_two';
                updateData.pending_action_data = drawCount;
                updateData.current_player = opponentPhone;
                break;
                
            case 'spade_ace_only':
                // Only trigger if it's Ace of Spades
                if (lastPlayedCard.suit === 'spades' && lastPlayedCard.value === 'A') {
                    gameState.pendingAction = 'draw_two';
                    updateData.pending_action = 'draw_two';
                    updateData.pending_action_data = 5; // Make opponent draw 5
                    updateData.current_player = opponentPhone;
                } else {
                    // Normal Ace behavior - just pass turn
                    updateData.current_player = opponentPhone;
                }
                break;
                
            case 'play_multiple':
                // For 7 cards - check if playing with 8 or J
                const playingWithSpecial = cardsToPlay.some(card => 
                    card.value === '8' || card.value === 'J'
                );
                
                if (playingWithSpecial) {
                    // If playing 7 with 8 or J, treat it like a change suit
                    gameState.pendingAction = 'change_suit';
                    updateData.pending_action = 'change_suit';
                    updateData.current_player = users.phone;
                    showSuitSelector();
                } else {
                    // Normal 7 behavior - pass turn
                    updateData.current_player = opponentPhone;
                }
                break;
        }
    } else {
        updateData.current_player = opponentPhone;
    }
    
    // Rest of the function remains the same...
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
    
    updateGameUI();
}

function hasCardsOfSuit(suit) {
    return gameState.playerHand.some(card => card.suit === suit);
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
            await showSevenCardDialog(cardIndex);
            return;
        }
        
        // For other cards, proceed normally
        await processCardPlay([card]);
        
    } catch (error) {
        console.error('Error playing card:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error playing card';
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

        // Determine how many cards to draw
        let drawCount = 1;
        if (gameState.pendingAction === 'draw_two') {
            drawCount = gameState.pendingActionData || 2;
            // Clear the pending action after drawing
            gameState.pendingAction = null;
            gameState.pendingActionData = null;
        }

        const isCreator = gameState.playerRole === 'creator';
        
        // Get current game state
        const { data: gameData, error: fetchError } = await supabase
            .from('card_games')
            .select('deck, discard_pile, last_card')
            .eq('code', gameState.gameCode)
            .single();
            
        if (fetchError) throw fetchError;
        
        let deck = safeParseJSON(gameData.deck) || [];
        const cardsToAdd = [];
        
        // Draw the required number of cards
        for (let i = 0; i < drawCount; i++) {
            // If deck is empty, reshuffle discard pile (except last card)
            if (deck.length === 0) {
                let discardPile = safeParseJSON(gameData.discard_pile) || [];
                const lastCard = safeParseJSON(gameData.last_card);
                
                // Remove last card from discard pile (so it stays in play)
                if (lastCard) {
                    discardPile = discardPile.filter(card => 
                        !(card.suit === lastCard.suit && card.value === lastCard.value));
                }
                
                // Reshuffle the remaining cards
                deck = shuffleArray(discardPile);
                
                // Update deck and clear discard pile (except last card)
                const { error: updateDeckError } = await supabase
                    .from('card_games')
                    .update({
                        deck: JSON.stringify(deck),
                        discard_pile: lastCard ? JSON.stringify([lastCard]) : JSON.stringify([]),
                        updated_at: new Date().toISOString()
                    })
                    .eq('code', gameState.gameCode);
                    
                if (updateDeckError) throw updateDeckError;
            }
            
            // Draw card if available
            if (deck.length > 0) {
                cardsToAdd.push(deck.pop());
            }
        }
        
        // Add drawn cards to hand
        gameState.playerHand = [...gameState.playerHand, ...cardsToAdd];
        
        // Update database
        const updateData = {
            deck: JSON.stringify(deck),
            updated_at: new Date().toISOString(),
            has_drawn_this_turn: true,
            pending_action: null,
            pending_action_data: null
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
        
        gameState.hasDrawnThisTurn = true;
        gameState.pendingAction = null;
        gameState.pendingActionData = null;
        updateGameUI();
        
    } catch (error) {
        console.error('Error drawing card:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error drawing card';
    }
}



// Update the showSevenCardDialog function to handle the new 7 card behavior
async function showSevenCardDialog(initialCardIndex) {
    const initialCard = gameState.playerHand[initialCardIndex];
    
    // Find all 8s and Js in hand (regardless of suit) that can be played with this 7
    const specialCards = gameState.playerHand.filter(
        (card, index) => (card.value === '8' || card.value === 'J') && index !== initialCardIndex
    );
    
    // If no special cards to play with, treat as normal card
    if (specialCards.length === 0) {
        await processCardPlay([initialCard]);
        return;
    }
    
    // Create selection modal
    const modal = document.createElement('div');
    modal.className = 'card-selection-modal';
    modal.innerHTML = `
        <div class="selection-content">
            <h3>Select cards to play with ${initialCard.value} of ${initialCard.suit}</h3>
            <div class="card-selection-options">
                ${specialCards.map((card, i) => `
                    <div class="card-option ${card.suit}" data-index="${gameState.playerHand.findIndex(c => 
                        c.suit === card.suit && c.value === card.value)}">
                        <div class="card-value">${card.value}</div>
                        <div class="card-suit"></div>
                    </div>
                `).join('')}
            </div>
            <div class="selection-actions">
                <button id="play-selected-cards">Play Selected</button>
                <button id="play-single-seven">Play Just This 7</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Track selected cards
    const selectedIndices = new Set([initialCardIndex]);
    
    // Add selection handlers
    modal.querySelectorAll('.card-option').forEach(option => {
        option.addEventListener('click', () => {
            const index = parseInt(option.dataset.index);
            if (selectedIndices.has(index)) {
                option.classList.remove('selected');
                selectedIndices.delete(index);
            } else {
                option.classList.add('selected');
                selectedIndices.add(index);
            }
        });
    });
    
    // Add action handlers
    return new Promise((resolve) => {
        modal.querySelector('#play-selected-cards').addEventListener('click', async () => {
            const cardsToPlay = Array.from(selectedIndices).map(i => gameState.playerHand[i]);
            modal.remove();
            await processCardPlay(cardsToPlay);
            resolve();
        });
        
        modal.querySelector('#play-single-seven').addEventListener('click', async () => {
            modal.remove();
            await processCardPlay([initialCard]);
            resolve();
        });
    });
}
function updateGameUI() {
    const users = JSON.parse(localStorage.getItem('user')) || {};
    const isMyTurn = users.phone === gameState.currentPlayer;
    
    // Update player info
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
    
    // Update game state display
    if (currentSuitDisplay) {
        currentSuitDisplay.textContent = gameState.currentSuit 
            ? `${gameState.currentSuit.toUpperCase()}` 
            : 'Not set';
        currentSuitDisplay.className = `suit-${gameState.currentSuit}`;
    }
    
    if (opponentHandCountEl) {
        opponentHandCountEl.textContent = `${gameState.opponentHandCount} cards`;
    }
    
    // Show/hide action buttons based on game state
    if (drawCardBtn) {
        drawCardBtn.style.display = isMyTurn && !gameState.hasDrawnThisTurn ? 'block' : 'none';
    }
    
    if (passTurnBtn) {
        // Only show pass button if player has drawn this turn
        passTurnBtn.style.display = isMyTurn && gameState.hasDrawnThisTurn ? 'block' : 'none';
        
        // Exception: Also show if forced to pass due to suit mismatch

        if (isMyTurn && gameState.mustPlaySuit && !hasCardsOfSuit(gameState.currentSuitToMatch)) {
           // passTurnBtn.style.display = 'block';
        }
    }
    
    // Render game elements
    renderDiscardPile();
    renderPlayerHand();
    
    // Update game status
    if (gameStatusEl) {
        if (gameState.status === 'waiting') {
            gameStatusEl.textContent = 'Waiting for opponent...';
        } else {
            let statusText = isMyTurn ? 'Your turn!' : 'Opponent\'s turn';
            
            if (isMyTurn && gameState.pendingAction === 'draw_two') {
                const drawCount = gameState.pendingActionData || 2;
                statusText = `You must draw ${drawCount} cards or play a 2`;
            }
            
            gameStatusEl.textContent = statusText;
            gameStatusEl.className = isMyTurn ? 'status-your-turn' : 'status-opponent-turn';
        }
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
            updated_at: new Date().toISOString(),
            must_play_suit: false,
            current_suit_to_match: '',
            has_drawn_this_turn: false
        };
        
        const { error } = await supabase
            .from('card_games')
            .update(updateData)
            .eq('code', gameState.gameCode);
            
        if (error) throw error;
        
        gameState.mustPlaySuit = false;
        gameState.currentSuitToMatch = '';
        gameState.hasDrawnThisTurn = false;
        updateGameUI();
        
    } catch (error) {
        console.error('Error passing turn:', error);
        if (gameStatusEl) gameStatusEl.textContent = 'Error passing turn';
    }
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
                        updated_at: new Date().toISOString(),
                        must_play_suit: true,
                        current_suit_to_match: selectedSuit,
                        has_drawn_this_turn: false
                    })
                    .eq('code', gameState.gameCode);
                    
                if (error) throw error;
                
                modal.remove();
                
            } catch (error) {
                console.error('Error selecting suit:', error);
                modal.remove();
            }
        });
    });
}

function setupEventListeners() {
    if (drawCardBtn) drawCardBtn.addEventListener('click', drawCard);
    if (passTurnBtn) passTurnBtn.addEventListener('click', passTurn);
}

function generateAvatarColor(username) {
    if (!username) return '#6c757d';
    const colors = ['#ff6b6b', '#51cf66', '#fcc419', '#228be6', '#be4bdb'];
    const hash = username.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
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
                    gameState.hasDrawnThisTurn = payload.new.has_drawn_this_turn || false;
                    
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
                    gameState.mustPlaySuit = payload.new.must_play_suit || false;
                    gameState.currentSuitToMatch = payload.new.current_suit_to_match || '';
                    gameState.discardPile = payload.new.discard_pile ? safeParseJSON(payload.new.discard_pile) : [];
                    
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

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}
