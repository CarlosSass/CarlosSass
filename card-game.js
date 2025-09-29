import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Supabase setup
const supabase = createClient(
  'https://evberyanshxxalxtwnnc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw'
);

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
document.addEventListener('DOMContentLoaded', initGame);

async function initGame() {
  setupEventListeners();
  await loadUserDetails();
  await loadGame();
}

function setupEventListeners() {
  // Back button
  backBtn.addEventListener('click', () => {
    if (gameChannel) gameChannel.unsubscribe();
    window.location.href = 'home.html';
  });
}

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
    userAvatarEl.style.backgroundColor = generateAvatarColor(data.username);
  } catch (error) {
    console.error('Error loading user:', error);
    displayMessage(gameStatusEl, 'Failed to load user data', 'error');
  }
}

function generateAvatarColor(username) {
  const colors = ['#ff6b6b', '#51cf66', '#fcc419', '#228be6', '#be4bdb'];
  const hash = username ? username.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0) : 0;
  return colors[hash % colors.length];
}

function displayMessage(element, message, type = 'info') {
  element.textContent = message;
  element.className = `status-message ${type}`;
  
  if (type === 'error') {
    console.error(message);
  }
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
    if (!users) throw new Error('User not logged in');

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
  if (!users) return;

  const isMyTurn = users.phone === currentPlayer;
  
  // Update status message
  if (isMyTurn) {
    displayMessage(gameStatusEl, 'Your turn - play a card!', 'success');
  } else {
    displayMessage(gameStatusEl, 'Waiting for opponent...', 'info');
  }
  
  // Render player's hand
  renderPlayerHand(isMyTurn);
  
  // Update opponent info
  opponentHandEl.textContent = `Opponent has ${opponentHandCount} cards`;
  
  // Update play area
  renderPlayArea();
}

function renderPlayerHand(isInteractive) {
  playerHandEl.innerHTML = '';
  
  playerHand.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${isInteractive ? 'playable' : ''}`;
    cardEl.dataset.index = index;
    cardEl.innerHTML = `
      <div class="card-value">${card.value}</div>
      <div class="card-suit ${card.suit}"></div>
    `;
    
    if (isInteractive) {
      cardEl.addEventListener('click', () => playCard(index));
    }
    
    playerHandEl.appendChild(cardEl);
  });
}

function renderPlayArea() {
  playAreaEl.innerHTML = '';
  
  if (gameData.discard_pile) {
    const discardPile = JSON.parse(gameData.discard_pile);
    const users = JSON.parse(localStorage.getItem('user'));
    
    // Show the last played cards
    const lastPlay = discardPile[discardPile.length - 1];
    if (lastPlay) {
      const cardEl = document.createElement('div');
      cardEl.className = `played-card ${lastPlay.player === users.phone ? 'player-card' : 'opponent-card'}`;
      cardEl.innerHTML = `
        <div class="card-value">${lastPlay.card.value}</div>
        <div class="card-suit ${lastPlay.card.suit}"></div>
      `;
      playAreaEl.appendChild(cardEl);
    }
  }
}

async function playCard(cardIndex) {
  try {
    const users = JSON.parse(localStorage.getItem('user'));
    if (!users) throw new Error('User not logged in');
    
    const card = playerHand[cardIndex];
    if (!card) throw new Error('Invalid card selected');
    
    // Remove card from hand
    playerHand.splice(cardIndex, 1);
    
    // Prepare update data
    const isCreator = users.phone === gameData.creator_phone;
    const updateData = {
      current_player: isCreator ? gameData.opponent_phone : gameData.creator_phone,
      updated_at: new Date().toISOString()
    };
    
    // Update the correct hand
    if (isCreator) {
      updateData.creator_hand = JSON.stringify(playerHand);
    } else {
      updateData.opponent_hand = JSON.stringify(playerHand);
    }
    
    // Update discard pile
    const discardPile = gameData.discard_pile ? JSON.parse(gameData.discard_pile) : [];
    discardPile.push({
      card,
      player: users.phone
    });
    updateData.discard_pile = JSON.stringify(discardPile);
    
    // Send update to Supabase
    const { error } = await supabase
      .from('card_games')
      .update(updateData)
      .eq('code', gameData.code);
      
    if (error) throw error;
    
  } catch (error) {
    console.error('Error playing card:', error);
    displayMessage(gameStatusEl, error.message || 'Failed to play card', 'error');
  }
}

function setupRealtimeUpdates(gameCode) {
  if (gameChannel) {
    gameChannel.unsubscribe();
  }
  
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
        
        // Check for game over
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
  
  displayMessage(
    gameStatusEl, 
    isWinner ? 'You won the game!' : 'You lost the game', 
    isWinner ? 'success' : 'error'
  );
  
  // Disable all cards
  document.querySelectorAll('.card').forEach(card => {
    card.classList.remove('playable');
  });
  
  // Unsubscribe from updates
  if (gameChannel) gameChannel.unsubscribe();
}
