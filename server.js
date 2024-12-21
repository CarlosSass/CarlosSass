const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');
const bodyParser = require('body-parser');

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const app = express();

// Configuration
const config = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://evberyanshxxalxtwnnc.supabase.co',
  supabaseKey: process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw',
  port: process.env.PORT || 3000,
  corsOrigin: process.env.CORS_ORIGIN || 'https://chessgame-git-main-kb-solutions-projects.vercel.app'
};

// Enhanced CORS configuration
const allowedOrigins = [
  config.corsOrigin,
  'https://chessgame-git-main-kb-solutions-projects.vercel.app',
  'https://chess-game-production-9494.up.railway.app'
];

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.get('/ready', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chess_games')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    res.status(200).json({ database: 'connected' });
  } catch (err) {
    res.status(500).json({ database: 'disconnected' });
  }
});

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// Create HTTP server with error handling
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Server running on port ${config.port}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

// Initialize Socket.IO with enhanced CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

// Add CORS headers for Socket.IO
io.engine.on("headers", (headers) => {
  headers["Access-Control-Allow-Origin"] = allowedOrigins.join(", ");
  headers["Access-Control-Allow-Credentials"] = "true";
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Chess server is running 🚀");
});

// Game state management
const gameTimers = {};
const activeGames = new Map();
const gameRooms = new Map();

// Add this to your configuration section
const ABANDON_TIMEOUT = 60 * 1000; // 1 minute in milliseconds
const playerConnections = new Map(); // gameCode -> { white: socketId, black: socketId }

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
    // Generate device fingerprint
    const fingerprint = generateFingerprint(socket.handshake.headers);
    socket.fingerprint = fingerprint;
    
    socket.on('joinGame', async (gameCode) => {
        try {
          socket.join(gameCode);
          socket.gameCode = gameCode;
      
          if (!gameRooms.has(gameCode)) {
            gameRooms.set(gameCode, { white: null, black: null });
          }
          const room = gameRooms.get(gameCode);
      
          if (!room.white) {
            room.white = socket.id;
            // Notify white player
            socket.emit('notification', {
              type: 'role-assignment',
              role: 'white',
              message: 'You are WHITE. Waiting for BLACK player...'
            });
          } 
          else if (!room.black) {
            room.black = socket.id;
            
            // Notify both players
            io.to(gameCode).emit('notification', {
              type: 'game-start',
              message: 'Game started! WHITE moves first.',
              timeControl: 600 // or your default time
            });
          
    
                
            // Notify white player specifically
            io.to(room.white).emit('notification', {
              type: 'opponent-connected',
              message: 'BLACK has joined. Make your move!'
            });
            
            // Start game logic
            const game = await getOrCreateGame(gameCode);
            if (game.status === 'ongoing' && !gameTimers[gameCode]) {
              startGameTimer(gameCode, game.time_control || 600);
            }
            
          } else {
            throw new Error('Room is full');
          }
      
          const game = await getOrCreateGame(gameCode);
          activeGames.set(gameCode, game);
          socket.emit('gameState', game);
      
        } catch (error) {
          socket.emit('notification', {
            type: 'error',
            message: error.message
          });
        }
        if (!playerConnections.has(gameCode)) {
            playerConnections.set(gameCode, { white: null, black: null });
          }
          const connections = playerConnections.get(gameCode);
          
          if (role === 'white') {
            connections.white = socket.id;
          } else {
            connections.black = socket.id;
          }
    
      });
  // Handle move events
  socket.on('move', async (moveData) => {
    try {
      const { gameCode, from, to, player, promotion } = moveData;
      
      // Basic validation
      if (!gameCode || !from || !to || !player) {
        throw new Error('Invalid move data');
      }
      
      // Anti-cheat checks
      const cheatCheck = await checkForCheating(socket, gameCode, moveData);
      if (cheatCheck.isCheating) {
        console.warn(`Cheating detected from ${player} in game ${gameCode}: ${cheatCheck.reason}`);
        
        // Handle cheating - you might want to end the game or take other action
        handleCheatingViolation(gameCode, player, cheatCheck.reason);
        return;
      }
      
      // Process the move if no cheating detected
      const result = await processMove(gameCode, from, to, player, promotion);
      
      // Update behavior tracking
      updatePlayerBehavior(socket.id, moveData, result.move);
      
      io.to(gameCode).emit('gameUpdate', result);
      checkGameEndConditions(gameCode, result.gameState);
      
    } catch (error) {
      console.error('Move error:', error);
      socket.emit('moveError', error.message);
    }
  });

  socket.on('gameOver', async ({ winner, reason }) => {
    try {
      await endGame(socket.gameCode, winner, reason);
      
      // Notify players
      const message = winner 
        ? `${winner} wins! ${reason}. ${game.bet ? `$${game.bet} transferred` : ''}`
        : `Game drawn. ${reason}`;
      
      io.to(socket.gameCode).emit('gameOver', { winner, reason: message });
      
    } catch (error) {
      console.error('Game over error:', error);
      socket.emit('error', 'Failed to process game result');
    }
  });
  // Handle disconnections
// Inside your socket.io 'disconnect' handler
const disconnectTimers = {};

// Clear disconnect timer if player reconnects





socket.on('acceptDraw', async ({ gameCode, player }) => {
  try {
    const game = activeGames.get(gameCode);
    if (!game) throw new Error('Game not found');
    
    // Verify there's an active draw offer from the opponent
    if (!game.draw_offer || game.draw_offer === player) {
      throw new Error('No valid draw offer to accept');
    }

    const room = gameRooms.get(gameCode);
    if (!room) throw new Error('Game room not found');

    // Refund each player only their own bet
    let refundTransactions = [];
    
    if (game.bet && game.bet > 0) {
      // Refund current player (the one accepting the draw)
      const currentPlayerPhone = player === 'white' ? game.white_phone : game.black_phone;
      const currentPlayerSocket = player === 'white' ? room.white : room.black;
      
      if (currentPlayerPhone) {
        const newBalance = await updatePlayerBalance(
          currentPlayerPhone,
          game.bet,
          'refund',
          gameCode,
          `Draw refund for game ${gameCode}`
        );
        
        refundTransactions.push({
          player,
          phone: currentPlayerPhone,
          amount: game.bet,
          newBalance
        });

        // Notify current player
        if (currentPlayerSocket) {
          io.to(currentPlayerSocket).emit('balanceUpdate', {
            amount: game.bet,
            newBalance,
            message: `$${game.bet} refunded for draw`
          });
        }
      }

      // Refund opponent (the one who offered the draw)
      const opponent = player === 'white' ? 'black' : 'white';
      const opponentPhone = opponent === 'white' ? game.white_phone : game.black_phone;
      const opponentSocket = opponent === 'white' ? room.white : room.black;
      
      if (opponentPhone) {
        const newBalance = await updatePlayerBalance(
          opponentPhone,
          game.bet,
          'refund',
          gameCode,
          `Draw refund for game ${gameCode}`
        );
        
        refundTransactions.push({
          player: opponent,
          phone: opponentPhone,
          amount: game.bet,
          newBalance
        });

        // Notify opponent
        if (opponentSocket) {
          io.to(opponentSocket).emit('balanceUpdate', {
            amount: game.bet,
            newBalance,
            message: `$${game.bet} refunded for draw`
          });
        }
      }
    }

    // End the game as a draw
    const endedGame = await endGame(gameCode, null, 'agreement');
    
    // Notify both players
    io.to(gameCode).emit('gameOver', {
      winner: null,
      reason: 'Draw by agreement',
      refunds: refundTransactions
    });

  } catch (error) {
    console.error('Accept draw error:', error);
    socket.emit('error', error.message);
  }
});
// Updated resignation handler

// Updated resignation handler with immediate payout display
socket.on('resign', async ({ gameCode, player }) => {
  try {
    // Validate input
    if (!gameCode || !player) throw new Error('Missing game code or player');

    const game = activeGames.get(gameCode);
    if (!game) throw new Error('Game not found');
    if (game.status !== 'ongoing') throw new Error('Game not in progress');

    const room = gameRooms.get(gameCode);
    if (!room) throw new Error('Room not found');

    // Stop the game timer immediately
    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }

    // Determine winner and loser
    const winner = player === 'white' ? 'black' : 'white';
    const winnerSocket = winner === 'white' ? room.white : room.black;
    const loserSocket = player === 'white' ? room.white : room.black;

    // Process game end and payments
    const endedGame = await endGame(gameCode, winner, 'resignation');

    // Prepare detailed result data
    const resultData = {
      winner,
      reason: 'resignation',
      betAmount: game.bet,
      winningAmount: endedGame.winningAmount,
      winnerNewBalance: endedGame.winnerNewBalance,
      loserNewBalance: endedGame.loserNewBalance,
      endedAt: new Date().toISOString()
    };

    // Notify winner immediately with payout details
    if (winnerSocket && io.sockets.sockets.has(winnerSocket)) {
      io.to(winnerSocket).emit('gameWon', {
        type: 'resignation',
        message: 'Opponent resigned!',
        amount: endedGame.winningAmount,
        bet: game.bet,
        newBalance: endedGame.winnerNewBalance,
        animation: 'moneyIncrease'
      });
    }

    // Notify loser immediately
    if (loserSocket && io.sockets.sockets.has(loserSocket)) {
      io.to(loserSocket).emit('gameLost', {
        type: 'resignation',
        message: 'You resigned the game',
        amount: -game.bet,
        newBalance: endedGame.loserNewBalance,
        animation: 'moneyDecrease'
      });
    }

    // Clean up game state
    cleanupGameResources(gameCode);

  } catch (error) {
    console.error('Resignation failed:', error);
    socket.emit('error', {
      type: 'resignation_error',
      message: error.message
    });
  }
});

// Updated disconnect handler with immediate payout
socket.on('disconnect', async () => {
    if (!socket.gameCode) return;
  
    const room = gameRooms.get(socket.gameCode);
    if (!room) return;
  
    // Determine disconnected player
    let disconnectedRole = null;
    if (room.white === socket.id) {
      disconnectedRole = 'white';
      room.white = null;
    } else if (room.black === socket.id) {
      disconnectedRole = 'black';
      room.black = null;
    }
  
    if (!disconnectedRole) return;
  
    console.log(`Player ${disconnectedRole} disconnected from game ${socket.gameCode}`);
    const game = activeGames.get(socket.gameCode);
    if (game?.status !== 'ongoing') return;
  
    // Check if the game is completely abandoned (both players disconnected)
    const isGameAbandoned = !room.white && !room.black;
    if (isGameAbandoned) {
      console.log(`Game ${socket.gameCode} abandoned - both players disconnected`);
      // Stop timer immediately for abandoned games
      if (gameTimers[socket.gameCode]) {
        console.log(`Stopping timer for abandoned game ${socket.gameCode}`);
        clearInterval(gameTimers[socket.gameCode].interval);
        delete gameTimers[socket.gameCode];
      }
      
      // Mark game as abandoned in database
      await supabase
        .from('chess_games')
        .update({
          status: 'finished',
          result: 'abandoned',
          updated_at: new Date().toISOString(),
          ended_at: new Date().toISOString()
        })
        .eq('code', socket.gameCode);
        
      // Clean up resources
      cleanupGameResources(socket.gameCode);
      return;
    }
    playerBehavior.delete(socket.id);
    // Set abandonment timer (increased to 2 minutes for reconnection)
    const RECONNECT_TIMEOUT = 120000; // 2 minutes
    const timerKey = `${socket.gameCode}_${disconnectedRole}`;
    
    disconnectTimers[timerKey] = setTimeout(async () => {
      // Only proceed if player hasn't reconnected
      const currentConnections = playerConnections.get(socket.gameCode);
      if ((disconnectedRole === 'white' && !currentConnections?.white) || 
          (disconnectedRole === 'black' && !currentConnections?.black)) {
        // Original disconnect logic
        const currentRoom = gameRooms.get(socket.gameCode);
        const currentGame = activeGames.get(socket.gameCode);
        
        if (currentGame?.status === 'ongoing') {
          console.log(`Player ${disconnectedRole} didn't reconnect - ending game`);
          const winner = disconnectedRole === 'white' ? 'black' : 'white';
          const winnerSocket = winner === 'white' ? currentRoom?.white : currentRoom?.black;
          
          if (winnerSocket) {
            io.to(winnerSocket).emit('gameWon', {
              type: 'disconnection',
              message: 'Opponent disconnected!',
              amount: currentGame.bet * 1.8,
              bet: currentGame.bet
            });
  
            await endGame(socket.gameCode, winner, 'disconnection');
          }
        }
      }
      delete disconnectTimers[timerKey];
    }, RECONNECT_TIMEOUT);
  });
  
  // Add reconnection handler
  socket.on('reconnect', async () => {
    if (!socket.gameCode) return;
  
    const room = gameRooms.get(socket.gameCode);
    if (!room) return;
  
    // Check if this was a previously connected player
    const connections = playerConnections.get(socket.gameCode);
    if (!connections) return;
  
    let reconnectedRole = null;
    if (connections.white === socket.id) {
      reconnectedRole = 'white';
      room.white = socket.id;
    } else if (connections.black === socket.id) {
      reconnectedRole = 'black';
      room.black = socket.id;
    }
  
    if (reconnectedRole) {
      // Cancel disconnect timer
      const timerKey = `${socket.gameCode}_${reconnectedRole}`;
      if (disconnectTimers[timerKey]) {
        clearTimeout(disconnectTimers[timerKey]);
        delete disconnectTimers[timerKey];
      }
  
      // Notify players
      io.to(socket.gameCode).emit('playerReconnected', {
        player: reconnectedRole,
        message: `${reconnectedRole} has reconnected!`
      });
  
      // Send full game state
      const game = activeGames.get(socket.gameCode);
      if (game) {
        socket.emit('gameState', game);
      }
    }
  });
  });
// Timer cleanup function
function cleanupGameResources(gameCode) {
    // Clear timer if exists
    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }
    
    // Remove from active games
    activeGames.delete(gameCode);
    
    // Clean up room
    gameRooms.delete(gameCode);
  }
// Game Management Functions (same as before)
async function getOrCreateGame(gameCode) {
  let game = activeGames.get(gameCode);
  if (game) return game;

  // Check database for existing game
  const { data: existingGame, error } = await supabase
    .from('chess_games')
    .select('*')
    .eq('code', gameCode)
    .single();

  if (!error && existingGame) {
    activeGames.set(gameCode, existingGame);
    return existingGame;
  }

  // Create new game
  const newGame = {
    code: gameCode,
    status: 'waiting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: createdGame, error: createError } = await supabase
    .from('chess_games')
    .insert(newGame)
    .select()
    .single();

  if (createError) throw createError;

  activeGames.set(gameCode, createdGame);
  return createdGame;
}

async function processMove(gameCode, from, to, player, promotion ) {
  try {

    const game = activeGames.get(gameCode);
    if (!game) throw new Error('Game not found');

    const chess = new Chess(game.fen);

    // Enhanced move validation
    const move = chess.move({ 
        from, 
        to, 
        promotion: isPromotion ? promotion : undefined
      });
  

    if (!move) {
      // Track failed move attempts
      const socketId = player === 'white' ? gameRooms.get(gameCode)?.white : gameRooms.get(gameCode)?.black;
      if (socketId) {
        const behavior = playerBehavior.get(socketId) || {};
        behavior.impossibleMoves = (behavior.impossibleMoves || 0) + 1;
        
        if (behavior.impossibleMoves >= ANTI_CHEAT_CONFIG.IMPOSSIBLE_MOVE_PENALTY) {
          await handleCheatingViolation(gameCode, player, 'invalid_moves');
        }
      }
      
      throw new Error('Invalid move');
    }










    // Handle bet deduction on first move (if applicable)
    if ((player === 'white' || player === 'black') && (!game.moves || game.moves.length === (player === 'black' ? 1 : 0))) {
      try {
        const phone = player === 'white' ? game.white_phone : game.black_phone;
        if (phone && game.bet) {
          // Updated to include transaction tracking
          const newBalance = await updatePlayerBalance(
            phone,
            -game.bet,
            'bet',
            gameCode,
            `Game bet for match ${gameCode}`
          );
          
          const room = gameRooms.get(gameCode);
          const socketId = player === 'white' ? room?.white : room?.black;
          
          if (socketId) {
            io.to(socketId).emit('balanceUpdate', {
              amount: -game.bet,
              newBalance: newBalance,
              message: `$${game.bet} deducted for game bet`,
              transaction: {
                type: 'bet',
                gameId: gameCode,
                timestamp: new Date().toISOString()
              }
            });
          }
        }
      } catch (error) {
        console.error('Failed to deduct bet:', error);
        throw new Error('Failed to process bet. Please try again.');
      }
    }

    // Validate turn
    if ((chess.turn() === 'w' && player !== 'white') ||
        (chess.turn() === 'b' && player !== 'black')) {
        throw new Error("It's not your turn");
    }

    // Validate promotion piece if this is a promotion move
    const movingPiece = chess.get(from);
    const isPromotion = movingPiece?.type === 'p' && 
                       ((player === 'white' && to[1] === '8') || 
                        (player === 'black' && to[1] === '1'));

    const validPromotions = ['q', 'r', 'b', 'n'];
    if (isPromotion && (!promotion || !validPromotions.includes(promotion))) {
      throw new Error('Invalid promotion piece. Choose q (queen), r (rook), b (bishop), or n (knight)');
    }

    // Execute move

    if (!move) throw new Error('Invalid move');

    // Update move history
    const moves = Array.isArray(game.moves) ? game.moves : [];
    moves.push({ 
      from, 
      to, 
      player,
      promotion: isPromotion ? promotion : null,
      timestamp: new Date().toISOString() 
    });

    // Timer logic
    if (moves.length === 1 && !gameTimers[gameCode]) {
      startGameTimer(gameCode, game.time_control || 600);
    } else if (gameTimers[gameCode]) {
      gameTimers[gameCode].currentTurn = chess.turn() === 'w' ? 'white' : 'black';
      gameTimers[gameCode].lastUpdate = Date.now();
    }

    // Update game state
    const updatedState = {
      fen: chess.fen(),
      turn: chess.turn() === 'w' ? 'white' : 'black',
      moves,
      white_time: gameTimers[gameCode]?.whiteTime || game.white_time,
      black_time: gameTimers[gameCode]?.blackTime || game.black_time,
      updated_at: new Date().toISOString(),
      draw_offer: null
    };

    // Save to database
    const { data: updatedGame, error } = await supabase
      .from('chess_games')
      .update(updatedState)
      .eq('code', gameCode)
      .select()
      .single();

    if (error) throw error;

    activeGames.set(gameCode, updatedGame);

    // Prepare response with transaction info if bet was deducted
    const response = {
      success: true,
      gameState: updatedGame,
      move,
      whiteTime: gameTimers[gameCode]?.whiteTime,
      blackTime: gameTimers[gameCode]?.blackTime
    };

    // Add bet information if this was the first move
    if ((player === 'white' && moves.length === 1) || (player === 'black' && moves.length === 2)) {
      response.betDeducted = {
        player,
        amount: game.bet,
        transactionType: 'bet'
      };
    }

    return response;

  } catch (error) {
    console.error('Move processing error:', error);
    throw error;
  }
}
async function updatePlayerBalance(phone, amount, transactionType, gameCode = null, description = '') {
  try {
    // Get current balance
    const { data: user, error } = await supabase
      .from('users')
      .select('balance')
      .eq('phone', phone)
      .single();

    if (error) throw error;
    if (!user) throw new Error('User not found');

    const balanceBefore = user.balance || 0;
    const newBalance = Math.max(0, balanceBefore + amount);

    // Update balance
    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('phone', phone);

    if (updateError) throw updateError;

    // Record transaction
    await recordTransaction({
      player_phone: phone,
      transaction_type: transactionType,
      amount: amount,
      balance_before: balanceBefore,
      balance_after: newBalance,
      game_id: gameCode,
      description: description || `${transactionType} ${amount >= 0 ? '+' : ''}${amount}`
    });

    return newBalance;
  } catch (error) {
    console.error('Balance update error:', error);
    throw error;
  }
}
function startGameTimer(gameCode, initialTime = 100) {
    // Clear existing timer to prevent duplicate timers
    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }
  
    // Add mutex locking mechanism
    const timerLock = {
      locked: false,
      queue: [],
      
      acquire: function(callback) {
        if (this.locked) {
          this.queue.push(callback);
        } else {
          this.locked = true;
          callback();
        }
      },
      
      release: function() {
        if (this.queue.length > 0) {
          const nextCallback = this.queue.shift();
          nextCallback();
        } else {
          this.locked = false;
        }
      }
    };
  
    gameTimers[gameCode] = {
      whiteTime: initialTime,
      blackTime: initialTime,
      lastUpdate: Date.now(),
      currentTurn: 'black', // Start with white as first player
      isEnding: false,
      timerLock: timerLock,
      interval: setInterval(async () => {
        // Use mutex to prevent concurrent timer updates
        timerLock.acquire(async () => {
          try {
            // Skip if game is already ending
            if (gameTimers[gameCode]?.isEnding) {
              timerLock.release();
              return;
            }
  
            const now = Date.now();
            const elapsed = Math.floor((now - gameTimers[gameCode].lastUpdate) / 1000);
            gameTimers[gameCode].lastUpdate = now;
  
            // Validate game exists before proceeding
            const game = activeGames.get(gameCode);
            if (!game || game.status !== 'ongoing') {
              clearInterval(gameTimers[gameCode].interval);
              delete gameTimers[gameCode];
              timerLock.release();
              return;
            }
  
            // Update current player's time
            if (gameTimers[gameCode].currentTurn === 'white') {
              gameTimers[gameCode].whiteTime = Math.max(0, gameTimers[gameCode].whiteTime - elapsed);
              
              if (gameTimers[gameCode].whiteTime <= 0) {
                // Immediately set flag to prevent race conditions
                gameTimers[gameCode].isEnding = true;
                
                // Process timeout in protected section
                await handleTimeout(gameCode, 'black');
                timerLock.release();
                return;
              }
            } else {
              gameTimers[gameCode].blackTime = Math.max(0, gameTimers[gameCode].blackTime - elapsed);
              
              if (gameTimers[gameCode].blackTime <= 0) {
                // Immediately set flag to prevent race conditions
                gameTimers[gameCode].isEnding = true;
                
                // Process timeout in protected section
                await handleTimeout(gameCode, 'white');
                timerLock.release();
                return;
              }
            }
  
            // Send timer updates to clients
            io.to(gameCode).emit('timerUpdate', {
              whiteTime: gameTimers[gameCode].whiteTime,
              blackTime: gameTimers[gameCode].blackTime,
              currentTurn: gameTimers[gameCode].currentTurn
            });
            
            timerLock.release();
          } catch (error) {
            console.error('Timer error:', error);
            if (gameTimers[gameCode]) {
              clearInterval(gameTimers[gameCode].interval);
              delete gameTimers[gameCode];
            }
            timerLock.release();
          }
        });
      }, 1000)
    };
  
    // Send initial timer state
    io.to(gameCode).emit('timerUpdate', {
      whiteTime: gameTimers[gameCode].whiteTime,
      blackTime: gameTimers[gameCode].blackTime,
      currentTurn: gameTimers[gameCode].currentTurn
    });
  }
  
  // Extract timeout handling to separate function
  async function handleTimeout(gameCode, winner) {
    try {
      // Immediately clear interval
      if (gameTimers[gameCode]) {
        clearInterval(gameTimers[gameCode].interval);
      }
      
      // End game with timeout reason
      const endedGame = await endGame(gameCode, winner, 'timeout');
      
      // Get room to notify players
      const room = gameRooms.get(gameCode);
      const game = activeGames.get(gameCode);
      const loser = winner === 'white' ? 'black' : 'white';
      
      // Notify winner if connected
      if (room?.[winner] && io.sockets.sockets.has(room[winner])) {
        io.to(room[winner]).emit('gameOver', {
          winner,
          reason: 'Opponent ran out of time',
          ...(game.bet && {
            amount: endedGame.winningAmount,
            newBalance: endedGame.winnerNewBalance
          })
        });
      }
      
      // Notify loser if connected
      if (room?.[loser] && io.sockets.sockets.has(room[loser])) {
        io.to(room[loser]).emit('gameOver', {
          winner,
          reason: 'You ran out of time',
          ...(game.bet && {
            amount: -game.bet,
            newBalance: endedGame.loserNewBalance
          })
        });
      }
  
      // Clean up resources
      cleanupGameResources(gameCode);
      
    } catch (error) {
      console.error('Timeout handling error:', error);
      cleanupGameResources(gameCode);
    }
  }
  // Enhance the endGame function to handle resignations
  async function endGame(gameCode, winner, result) {
    // Immediately stop the timer when game ends
    if (gameTimers[gameCode]) {
      console.log(`Game ${gameCode} ended - stopping timer`);
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }
  
    const game = activeGames.get(gameCode);
    if (game && game.status === 'finished') {
      return game;
    }
    
    try {
      // 1. Get game data
      const { data: game, error: gameError } = await supabase
        .from('chess_games')
        .select('*')
        .eq('code', gameCode)
        .single();
  
      if (gameError) throw gameError;
  
      // 2. Prepare game result data
      const updateData = {
        status: 'finished',
        winner,
        result: result.slice(0, 50),
        updated_at: new Date().toISOString(),
        ended_at: new Date().toISOString()
      };
  
      // 3. Initialize transaction variables
      let winnerTransaction = null;
      let loserTransaction = null;
      let commissionTransaction = null;
      const room = gameRooms.get(gameCode);
  
      // 4. Process financial transactions if there was a bet
      if (game.bet && game.bet > 0 && winner) {
        const totalPrizePool = game.bet * 2;
        const commissionAmount = Math.round(totalPrizePool * 0.1 * 100) / 100; // 10% commission
        const winnerPayout = totalPrizePool - commissionAmount;
  
        // Get winner's current balance
        const winnerPhone = winner === 'white' ? game.white_phone : game.black_phone;
        const winnerSocket = winner === 'white' ? room?.white : room?.black;
  
        if (winnerPhone) {
          const winnerNewBalance = await updatePlayerBalance(
            winnerPhone,
            winnerPayout,
            'win',
            gameCode,
            `Won game by ${result}`
          );
  
          winnerTransaction = {
            player: winnerPhone,
            amount: winnerPayout,
            newBalance: winnerNewBalance
          };
  
          // Notify winner if still connected
          if (winnerSocket && io.sockets.sockets.has(winnerSocket)) {
            io.to(winnerSocket).emit('balanceUpdate', {
              amount: winnerPayout,
              newBalance: winnerNewBalance,
              message: `$${winnerPayout} awarded for winning`
            });
          }
        }
  
        // Get loser's current balance (for record keeping)
        const loser = winner === 'white' ? 'black' : 'white';
        const loserPhone = loser === 'white' ? game.white_phone : game.black_phone;
        const loserSocket = loser === 'white' ? room?.white : room?.black;
  
        if (loserPhone) {
          // Record the loss (no balance change, just for history)
          const { data: loserData } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', loserPhone)
            .single();
  
          const loserBalance = loserData?.balance || 0;
  
          await recordTransaction({
            player_phone: loserPhone,
            transaction_type: 'loss',
            amount: -game.bet,
            balance_before: loserBalance,
            balance_after: loserBalance,
            game_id: gameCode,
            description: `Lost game by ${result}`,
            status: 'completed'
          });
  
          loserTransaction = {
            player: loserPhone,
            amount: -game.bet,
            newBalance: loserBalance
          };
  
          // Notify loser if still connected
          if (loserSocket && io.sockets.sockets.has(loserSocket)) {
            io.to(loserSocket).emit('balanceUpdate', {
              amount: -game.bet,
              newBalance: loserBalance,
              message: `$${game.bet} lost`
            });
          }
        }
  
        // Update house balance with commission
        const newHouseBalance = await updateHouseBalance(commissionAmount);
        commissionTransaction = {
          amount: commissionAmount,
          newBalance: newHouseBalance
        };
      }
  
      // 5. Update game status in database
      const { error: updateError } = await supabase
        .from('chess_games')
        .update(updateData)
        .eq('code', gameCode);
  
      if (updateError) throw updateError;
  
     cleanupGameResources(gameCode);
      
      return {
        ...game,
        ...updateData,
        transactions: {
          winner: winnerTransaction,
          loser: loserTransaction,
          commission: commissionTransaction
        },
        financials: {
          betAmount: game.bet || 0,
          prizePool: game.bet ? game.bet * 2 : 0,
          commission: game.bet ? Math.round(game.bet * 0.1 * 100) / 100 : 0,
          winningAmount: game.bet ? Math.round(game.bet * 1.8 * 100) / 100 : 0,
          winnerNewBalance: winnerTransaction?.newBalance,
          loserNewBalance: loserTransaction?.newBalance
        }
      };
  
    } catch (error) {
      console.error('Error ending game:', error);
      cleanupGameResources(gameCode);
      throw error;
    }
  }
  function cleanupGameResources(gameCode) {
    console.log(`Cleaning up resources for game: ${gameCode}`);
    
    // Use a try/catch to ensure complete cleanup even if some parts fail
    try {
      // Clear timer if exists
      if (gameTimers[gameCode]) {
        console.log(`Stopping timer for game: ${gameCode}`);
        clearInterval(gameTimers[gameCode].interval);
        delete gameTimers[gameCode];
      }
      
      // Remove disconnect timers
      Object.keys(disconnectTimers).forEach(key => {
        if (key.startsWith(`${gameCode}_`)) {
          clearTimeout(disconnectTimers[key]);
          delete disconnectTimers[key];
        }
      });
      
      // Remove from active games
      activeGames.delete(gameCode);
      
      // Clean up room
      gameRooms.delete(gameCode);
      
      // Clean up player connections
      playerConnections.delete(gameCode);
      
      console.log(`Resources for game ${gameCode} cleaned up successfully`);
    } catch (error) {
      console.error(`Error during cleanup for game ${gameCode}:`, error);
      // Force cleanup anyway
      delete gameTimers[gameCode];
      activeGames.delete(gameCode);
      gameRooms.delete(gameCode);
      playerConnections.delete(gameCode);
    }
  }

function checkGameEndConditions(gameCode, gameState) {
    const chess = new Chess(gameState.fen);
    
    if (chess.isGameOver()) {
      let result, winner;
      
      if (chess.isCheckmate()) {
        winner = chess.turn() === 'w' ? 'black' : 'white';
        result = 'checkmate';
      } else if (chess.isDraw()) {
        winner = null;
        result = 'draw';
      } else if (chess.isStalemate()) {
        winner = null;
        result = 'stalemate';
      } else if (chess.isThreefoldRepetition()) {
        winner = null;
        result = 'repetition';
      } else if (chess.isInsufficientMaterial()) {
        winner = null;
        result = 'insufficient material';
      }
  
      if (result) {
        console.log(`Game ${gameCode} over by ${result} - stopping timer`);
        // Immediately stop timer
        if (gameTimers[gameCode]) {
          clearInterval(gameTimers[gameCode].interval);
          delete gameTimers[gameCode];
        }
        
        endGame(gameCode, winner, result);
        io.to(gameCode).emit('gameOver', { winner, reason: result });
      }
    }
  }
  




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

// REST API Endpoints
app.get('/api/game-by-code/:code', async (req, res) => {
  try {
    const { data: game, error } = await supabase
      .from('chess_games')
      .select('*')
      .eq('code', req.params.code)
      .single();

    if (error || !game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(game);
  } catch (error) {
    console.error('Game fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/move', async (req, res) => {
  try {
    const { gameCode, from, to, player } = req.body;
    
    if (!gameCode || !from || !to || !player) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await processMove(gameCode, from, to, player);
    
    if (io.sockets.adapter.rooms.get(gameCode)) {
      io.to(gameCode).emit('gameUpdate', result);
    }

    checkGameEndConditions(gameCode, result.gameState);

    res.json(result);
  } catch (error) {
    console.error('Move error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/offer-draw', async (req, res) => {
  try {
    const { gameCode, player } = req.body;
    
    const { data: game, error } = await supabase
      .from('chess_games')
      .update({ 
        draw_offer: player,
        updated_at: new Date().toISOString()
      })
      .eq('code', gameCode)
      .select()
      .single();

    if (error) throw error;
    
    if (io.sockets.adapter.rooms.get(gameCode)) {
      io.to(gameCode).emit('drawOffer', { player });
    }

    activeGames.set(gameCode, game);
    res.json({ success: true, game });

  } catch (error) {
    console.error('Draw offer error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/resign', async (req, res) => {
  try {
    const { gameCode, player } = req.body;
    const winner = player === 'white' ? 'black' : 'white';
    
    await endGame(gameCode, winner, 'resignation');
    
    if (io.sockets.adapter.rooms.get(gameCode)) {
      io.to(gameCode).emit('gameOver', { winner, reason: 'resignation' });
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Resign error:', error);
    res.status(400).json({ error: error.message });
  }
});
app.get('/api/transactions/:phone', async (req, res) => {
  try {
    const transactions = await getPlayerTransactions(req.params.phone);
    res.json(transactions);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
app.post('/api/start-timer', async (req, res) => {
  try {
    const { gameCode, timeControl } = req.body;
    startGameTimer(gameCode, timeControl);
    res.json({ success: true });
  } catch (error) {
    console.error('Timer start error:', error);
    res.status(400).json({ error: error.message });
  }
});
// Add this to your server initialization
const abandonedGameChecker = setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes
    
    const { data: abandonedGames } = await supabase
      .from('chess_games')
      .select('code, status, created_at')
      .or('status.eq.ongoing,status.eq.waiting')
      .lt('updated_at', cutoff);

    for (const game of abandonedGames) {
      await supabase
        .from('chess_games')
        .update({
          status: 'finished',
          result: 'abandoned',
          updated_at: new Date().toISOString()
        })
        .eq('code', game.code);

      // Clean up in-memory state if exists
      if (activeGames.has(game.code)) {
        if (gameTimers[game.code]) {
          clearInterval(gameTimers[game.code].interval);
          delete gameTimers[game.code];
        }
        activeGames.delete(game.code);
        gameRooms.delete(game.code);
      }

      console.log(`Marked abandoned game ${game.code}`);
    }
  } catch (error) {
    console.error('Abandoned game checker error:', error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Clean up on server shutdown
process.on('SIGTERM', () => {
  clearInterval(abandonedGameChecker);
});
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

async function getPlayerTransactions(phone) {
  try {
    const { data, error } = await supabase
      .from('player_transactions')
      .select('*')
      .eq('player_phone', phone)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}
// Get user balance
app.get('/api/balance', async (req, res) => {
  try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: 'Phone number required' });

      const { data: user, error } = await supabase
          .from('users')
          .select('balance')
          .eq('phone', phone)
          .single();

      if (error || !user) throw error || new Error('User not found');
      
      res.json({ balance: user.balance || 0 });
  } catch (error) {
      console.error('Balance fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Process deposit
app.post('/api/deposit', async (req, res) => {
  try {
      const { phone, amount, method } = req.body;
      if (!phone || !amount || amount <= 0) {
          return res.status(400).json({ error: 'Invalid deposit request' });
      }

      // In a real app, you would process payment here
      // For demo, we'll just update the balance
      
      const newBalance = await updatePlayerBalance(
          phone,
          amount,
          'deposit',
          null,
          `Deposit via ${method}`
      );

      res.json({ success: true, newBalance });
  } catch (error) {
      console.error('Deposit error:', error);
      res.status(500).json({ error: 'Deposit failed' });
  }
});

// Process withdrawal
app.post('/api/withdraw', async (req, res) => {
  try {
      const { phone, amount, method } = req.body;
      if (!phone || !amount || amount <= 0) {
          return res.status(400).json({ error: 'Invalid withdrawal request' });
      }

      // Check balance first
      const { data: user, error: userError } = await supabase
          .from('users')
          .select('balance')
          .eq('phone', phone)
          .single();

      if (userError || !user) throw userError || new Error('User not found');
      if (user.balance < amount) {
          return res.status(400).json({ error: 'Insufficient balance' });
      }

      // In a real app, you would process withdrawal here
      // For demo, we'll just update the balance
      
      const newBalance = await updatePlayerBalance(
          phone,
          -amount,
          'withdrawal',
          null,
          `Withdrawal via ${method}`
      );

      res.json({ 
          success: true, 
          newBalance,
          message: 'Withdrawal request received. Processing may take 1-3 business days.'
      });
  } catch (error) {
      console.error('Withdrawal error:', error);
      res.status(500).json({ error: 'Withdrawal failed' });
  }
});
app.post('/api/accept-draw', async (req, res) => {
  try {
    const { gameCode, player } = req.body;
    
    const game = activeGames.get(gameCode);
    if (!game) throw new Error('Game not found');
    
    if (!game.draw_offer || game.draw_offer === player) {
      throw new Error('No valid draw offer to accept');
    }

    const room = gameRooms.get(gameCode);
    if (!room) throw new Error('Game room not found');

    // Refund each player only their own bet
    let refundTransactions = [];
    
    if (game.bet && game.bet > 0) {
      // Refund current player
      const currentPlayerPhone = player === 'white' ? game.white_phone : game.black_phone;
      if (currentPlayerPhone) {
        const newBalance = await updatePlayerBalance(
          currentPlayerPhone,
          game.bet,
          'refund',
          gameCode,
          `Draw refund for game ${gameCode}`
        );
        refundTransactions.push({
          player,
          amount: game.bet,
          newBalance
        });
      }

      // Refund opponent
      const opponent = player === 'white' ? 'black' : 'white';
      const opponentPhone = opponent === 'white' ? game.white_phone : game.black_phone;
      if (opponentPhone) {
        const newBalance = await updatePlayerBalance(
          opponentPhone,
          game.bet,
          'refund',
          gameCode,
          `Draw refund for game ${gameCode}`
        );
        refundTransactions.push({
          player: opponent,
          amount: game.bet,
          newBalance
        });
      }
    }

    const endedGame = await endGame(gameCode, null, 'agreement');
    
    if (io.sockets.adapter.rooms.get(gameCode)) {
      io.to(gameCode).emit('gameOver', {
        winner: null,
        reason: 'Draw by agreement',
        refunds: refundTransactions
      });
    }

    res.json({ 
      success: true,
      game: endedGame,
      refunds: refundTransactions
    });

  } catch (error) {
    console.error('Accept draw error:', error);
    res.status(400).json({ error: error.message });
  }
});










// Add these at the top with other requires
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// Anti-Cheat Configuration
const ANTI_CHEAT_CONFIG = {
  MOVE_TIME_THRESHOLD: 2000, // 2 seconds (human moves usually take longer)
  IMPOSSIBLE_MOVE_PENALTY: 3, // After 3 impossible moves, flag as cheater
  ENGINE_MOVE_PATTERN_WINDOW: 5, // Check last 5 moves for engine patterns
  MOVE_RATE_LIMIT: 15, // Max moves per minute
  FINGERPRINT_HEADERS: ['user-agent', 'accept-language', 'connection', 'sec-ch-ua'],
  MIN_HUMAN_MOVE_TIME: 300 // Minimum expected human move time (ms)
};

// Add rate limiting middleware
const moveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: ANTI_CHEAT_CONFIG.MOVE_RATE_LIMIT,
  message: 'Too many moves too quickly - possible bot detected',
  skip: (req) => {
    // Skip rate limiting for certain conditions if needed
    return false;
  }
});

app.use('/api/move', moveLimiter);

// Add to your existing configuration
const CHEAT_DETECTION_DB = 'cheat_detection';
const PLAYER_PROFILES_DB = 'player_profiles';

// Add these maps to track player behavior
const playerBehavior = new Map(); // socketId -> { moveTimes: [], movePatterns: [] }
const deviceFingerprints = new Map(); // gameCode -> { white: fingerprint, black: fingerprint }
const cheatFlags = new Map(); // gameCode -> { white: {count: number, lastWarning: timestamp}, black: {...} }

// Enhanced socket connection handler with fingerprinting


// Anti-Cheat Helper Functions

function generateFingerprint(headers) {
  const fingerprintData = ANTI_CHEAT_CONFIG.FINGERPRINT_HEADERS
    .map(header => headers[header])
    .join('|');
  
  return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}

async function checkForCheating(socket, gameCode, moveData) {
  const behavior = playerBehavior.get(socket.id) || {};
  const { player } = moveData;
  
  // 1. Check for multiple devices
  const fingerprints = deviceFingerprints.get(gameCode);
  if (fingerprints && fingerprints[player] !== socket.fingerprint) {
    return { isCheating: true, reason: 'device_switch' };
  }
  
  // 2. Check move timing (too fast for human)
  if (behavior.lastMoveTime) {
    const moveTime = Date.now() - behavior.lastMoveTime;
    if (moveTime < ANTI_CHEAT_CONFIG.MIN_HUMAN_MOVE_TIME) {
      behavior.impossibleMoves += 1;
      if (behavior.impossibleMoves >= ANTI_CHEAT_CONFIG.IMPOSSIBLE_MOVE_PENALTY) {
        return { isCheating: true, reason: 'move_timing' };
      }
    }
  }
  
  // 3. Check for engine-like move patterns
  if (behavior.movePatterns.length >= ANTI_CHEAT_CONFIG.ENGINE_MOVE_PATTERN_WINDOW) {
    const engineLikelihood = detectEnginePatterns(behavior.movePatterns);
    if (engineLikelihood > 0.8) { // Threshold for engine-like moves
      return { isCheating: true, reason: 'engine_patterns' };
    }
  }
  
  // 4. Check for impossible moves (validation happens in processMove)
  
  return { isCheating: false };
}

function updatePlayerBehavior(socketId, moveData, chessMove) {
  if (!playerBehavior.has(socketId)) {
    playerBehavior.set(socketId, {
      moveTimes: [],
      movePatterns: [],
      lastMoveTime: Date.now(),
      impossibleMoves: 0
    });
  }
  
  const behavior = playerBehavior.get(socketId);
  
  // Update move timing
  const now = Date.now();
  if (behavior.lastMoveTime) {
    const moveTime = now - behavior.lastMoveTime;
    behavior.moveTimes.push(moveTime);
    
    // Keep only last 10 move times
    if (behavior.moveTimes.length > 10) {
      behavior.moveTimes.shift();
    }
  }
  behavior.lastMoveTime = now;
  
  // Update move patterns
  behavior.movePatterns.push({
    from: moveData.from,
    to: moveData.to,
    piece: chessMove.piece,
    san: chessMove.san
  });
  
  if (behavior.movePatterns.length > ANTI_CHEAT_CONFIG.ENGINE_MOVE_PATTERN_WINDOW) {
    behavior.movePatterns.shift();
  }
}

function detectEnginePatterns(movePatterns) {
  // Simple engine detection - real implementation would be more sophisticated
  let engineScore = 0;
  
  // 1. Check for always playing best move (would need a chess engine to compare)
  // 2. Check for consistent move times (humans vary more)
  // 3. Check for typical engine move patterns
  
  // This is a simplified version - real implementation would use:
  // - Move scoring against stockfish
  // - Statistical analysis of move times
  // - Pattern recognition
  
  // For now, we'll just look for always capturing when possible (naive)
  const captureMoves = movePatterns.filter(m => m.san.includes('x')).length;
  const captureRatio = captureMoves / movePatterns.length;
  
  if (captureRatio > 0.8) { // Unusually high capture ratio
    engineScore += 0.3;
  }
  
  // Check move time consistency (engines are more consistent)
  const moveTimes = movePatterns.map((_, i) => {
    if (i > 0) return movePatterns[i].timestamp - movePatterns[i-1].timestamp;
    return 0;
  }).filter(t => t > 0);
  
  if (moveTimes.length > 2) {
    const avg = moveTimes.reduce((a,b) => a + b, 0) / moveTimes.length;
    const variance = moveTimes.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / moveTimes.length;
    
    if (variance < 10000) { // Very consistent move times
      engineScore += 0.2;
    }
  }
  
  return engineScore;
}

async function handleCheatingViolation(gameCode, player, reason) {
  // Record the cheating attempt
  const { error } = await supabase
    .from(CHEAT_DETECTION_DB)
    .insert({
      game_code: gameCode,
      player,
      reason,
      detected_at: new Date().toISOString()
    });
  
  if (error) console.error('Failed to record cheating:', error);
  
  // Update player profile with strike
  await supabase
    .from(PLAYER_PROFILES_DB)
    .upsert({
      player_id: player,
      last_cheat_detected: new Date().toISOString(),
      cheat_count: supabase.rpc('increment'),
      updated_at: new Date().toISOString()
    }, { onConflict: 'player_id' });
  
  // Notify players
  const room = gameRooms.get(gameCode);
  if (room) {
    const cheaterSocket = player === 'white' ? room.white : room.black;
    const opponentSocket = player === 'white' ? room.black : room.white;
    
    if (cheaterSocket) {
      io.to(cheaterSocket).emit('cheatWarning', {
        type: reason,
        message: 'Cheating detected! Further violations may result in penalties.'
      });
    }
    
    if (opponentSocket) {
      io.to(opponentSocket).emit('cheatAlert', {
        opponent: player,
        reason,
        message: 'Opponent suspected of cheating. Game will be monitored.'
      });
    }
  }
  
  // After multiple violations, you might want to automatically forfeit the game
  if (!cheatFlags.has(gameCode)) {
    cheatFlags.set(gameCode, { white: { count: 0 }, black: { count: 0 } });
  }
  
  const flags = cheatFlags.get(gameCode);
  flags[player].count += 1;
  flags[player].lastWarning = Date.now();
  
  if (flags[player].count >= 3) {
    // Auto-forfeit after 3 violations
    await endGame(gameCode, player === 'white' ? 'black' : 'white', 'cheating');
    
    if (room) {
      io.to(gameCode).emit('gameOver', {
        winner: player === 'white' ? 'black' : 'white',
        reason: 'Cheating detected'
      });
    }
  }
}



// Add these tables to your Supabase database:

/*
Table: cheat_detection
Columns:
- id (uuid, primary key)
- game_code (text)
- player (text)
- reason (text)
- detected_at (timestamp)
- action_taken (text)

Table: player_profiles
Columns:
- player_id (text, primary key)
- games_played (int)
- cheat_count (int)
- last_cheat_detected (timestamp)
- trust_score (float)
- created_at (timestamp)
- updated_at (timestamp)
*/
