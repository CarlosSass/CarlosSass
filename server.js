const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Server } = require('socket.io');
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
      .from('checkers_games')
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

// Create HTTP server
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Server running on port ${config.port}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Game state management
const gameTimers = {};
const activeGames = new Map();
const gameRooms = new Map();
const playerConnections = new Map();
const ABANDON_TIMEOUT = 60 * 1000;
const disconnectTimers = {};

// Checkers-specific game logic
function initializeCheckersBoard() {
  return {
    pieces: [
      // Black pieces (bottom)
      { position: "A3", color: "black", isKing: false },
      { position: "C3", color: "black", isKing: false },
      { position: "E3", color: "black", isKing: false },
      { position: "G3", color: "black", isKing: false },
      { position: "B2", color: "black", isKing: false },
      { position: "D2", color: "black", isKing: false },
      { position: "F2", color: "black", isKing: false },
      { position: "H2", color: "black", isKing: false },
      { position: "A1", color: "black", isKing: false },
      { position: "C1", color: "black", isKing: false },
      { position: "E1", color: "black", isKing: false },
      { position: "G1", color: "black", isKing: false },
      // Red pieces (top)
      { position: "B8", color: "red", isKing: false },
      { position: "D8", color: "red", isKing: false },
      { position: "F8", color: "red", isKing: false },
      { position: "H8", color: "red", isKing: false },
      { position: "A7", color: "red", isKing: false },
      { position: "C7", color: "red", isKing: false },
      { position: "E7", color: "red", isKing: false },
      { position: "G7", color: "red", isKing: false },
      { position: "B6", color: "red", isKing: false },
      { position: "D6", color: "red", isKing: false },
      { position: "F6", color: "red", isKing: false },
      { position: "H6", color: "red", isKing: false }
    ],
    turn: "red",
    capturedPieces: [],
    lastMove: null,
    lastCapture: null,
    mustCapture: false,
    legalMoves: []
  };
}

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('joinGame', async (gameCode, gameType) => {
    try {
      if (gameType !== 'checkers') {
        throw new Error('Invalid game type');
      }

      socket.join(gameCode);
      socket.gameCode = gameCode;

      if (!gameRooms.has(gameCode)) {
        gameRooms.set(gameCode, { red: null, black: null });
      }
      const room = gameRooms.get(gameCode);

      if (!room.red) {
        room.red = socket.id;
        socket.emit('notification', {
          type: 'role-assignment',
          role: 'red',
          message: 'You are RED. Waiting for BLACK player...'
        });
      } else if (!room.black) {
        room.black = socket.id;
        
        io.to(gameCode).emit('notification', {
          type: 'game-start',
          message: 'Game started! RED moves first.',
          timeControl: 600
        });

        io.to(room.red).emit('notification', {
          type: 'opponent-connected',
          message: 'BLACK has joined. Make your move!'
        });
        
        const game = await getOrCreateGame(gameCode);
        if (game.status === 'ongoing' && !gameTimers[gameCode]) {
          startGameTimer(gameCode, game.time_control || 600);
        }
      } else {
        throw new Error('Room is full');
      }

      if (!playerConnections.has(gameCode)) {
        playerConnections.set(gameCode, { red: null, black: null });
      }
      const connections = playerConnections.get(gameCode);
      
      if (!room.red) {
        connections.red = socket.id;
      } else {
        connections.black = socket.id;
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
  });

  socket.on('move', async (moveData) => {
    try {
      const { gameCode, from, to, player } = moveData;
      if (!gameCode || !from || !to || !player) {
        throw new Error('Invalid move data');
      }

      const room = gameRooms.get(gameCode);
      if (!room?.red || !room?.black) {
        throw new Error('Wait for the other player to join!');
      }

      const result = await processCheckersMove(gameCode, from, to, player);
      io.to(gameCode).emit('gameUpdate', result);
      checkCheckersGameEndConditions(gameCode, result.gameState);

    } catch (error) {
      console.error('Move error:', error);
      socket.emit('moveError', error.message);
    }
  });

  socket.on('gameOver', async ({ winner, reason }) => {
    try {
      await endGame(socket.gameCode, winner, reason);
      const message = winner 
        ? `${winner} wins! ${reason}`
        : `Game drawn. ${reason}`;
      
      io.to(socket.gameCode).emit('gameOver', { winner, reason: message });
    } catch (error) {
      console.error('Game over error:', error);
      socket.emit('error', 'Failed to process game result');
    }
  });

  socket.on('disconnect', async () => {
    if (!socket.gameCode) return;
    
    const room = gameRooms.get(socket.gameCode);
    if (!room) return;
    
    let disconnectedRole = null;
    if (room.red === socket.id) {
      disconnectedRole = 'red';
      room.red = null;
    } else if (room.black === socket.id) {
      disconnectedRole = 'black';
      room.black = null;
    }
    
    if (!disconnectedRole) return;
    
    console.log(`Player ${disconnectedRole} disconnected from game ${socket.gameCode}`);
    const game = activeGames.get(socket.gameCode);
    if (game?.status !== 'ongoing') return;
    
    const isGameAbandoned = !room.red && !room.black;
    if (isGameAbandoned) {
      console.log(`Game ${socket.gameCode} abandoned - both players disconnected`);
      if (gameTimers[socket.gameCode]) {
        clearInterval(gameTimers[socket.gameCode].interval);
        delete gameTimers[socket.gameCode];
      }
      
      await supabase
        .from('checkers_games')
        .update({
          status: 'finished',
          result: 'abandoned',
          updated_at: new Date().toISOString(),
          ended_at: new Date().toISOString()
        })
        .eq('code', socket.gameCode);
        
      cleanupGameResources(socket.gameCode);
      return;
    }
    
    const RECONNECT_TIMEOUT = 120000;
    const timerKey = `${socket.gameCode}_${disconnectedRole}`;
    
    disconnectTimers[timerKey] = setTimeout(async () => {
      const currentConnections = playerConnections.get(socket.gameCode);
      if ((disconnectedRole === 'red' && !currentConnections?.red) || 
          (disconnectedRole === 'black' && !currentConnections?.black)) {
        const currentRoom = gameRooms.get(socket.gameCode);
        const currentGame = activeGames.get(socket.gameCode);
        
        if (currentGame?.status === 'ongoing') {
          console.log(`Player ${disconnectedRole} didn't reconnect - ending game`);
          const winner = disconnectedRole === 'red' ? 'black' : 'red';
          const winnerSocket = winner === 'red' ? currentRoom?.red : currentRoom?.black;
          
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
  
  socket.on('reconnect', async () => {
    if (!socket.gameCode) return;
  
    const room = gameRooms.get(socket.gameCode);
    if (!room) return;
  
    const connections = playerConnections.get(socket.gameCode);
    if (!connections) return;
  
    let reconnectedRole = null;
    if (connections.red === socket.id) {
      reconnectedRole = 'red';
      room.red = socket.id;
    } else if (connections.black === socket.id) {
      reconnectedRole = 'black';
      room.black = socket.id;
    }
  
    if (reconnectedRole) {
      const timerKey = `${socket.gameCode}_${reconnectedRole}`;
      if (disconnectTimers[timerKey]) {
        clearTimeout(disconnectTimers[timerKey]);
        delete disconnectTimers[timerKey];
      }
  
      io.to(socket.gameCode).emit('playerReconnected', {
        player: reconnectedRole,
        message: `${reconnectedRole} has reconnected!`
      });
  
      const game = activeGames.get(socket.gameCode);
      if (game) {
        socket.emit('gameState', game);
      }
    }
  });
});

// Checkers Game Management Functions
async function getOrCreateGame(gameCode) {
  let game = activeGames.get(gameCode);
  if (game) return game;

  const { data: existingGame, error } = await supabase
    .from('checkers_games')
    .select('*')
    .eq('code', gameCode)
    .single();

  if (!error && existingGame) {
    activeGames.set(gameCode, existingGame);
    return existingGame;
  }

  const newGame = {
    code: gameCode,
    board_state: initializeCheckersBoard(),
    status: 'waiting',
    turn: 'red',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: createdGame, error: createError } = await supabase
    .from('checkers_games')
    .insert(newGame)
    .select()
    .single();

  if (createError) throw createError;

  activeGames.set(gameCode, createdGame);
  return createdGame;
}

async function processCheckersMove(gameCode, from, to, player) {
  try {
    const game = activeGames.get(gameCode);
    if (!game) throw new Error('Game not found');

    // Validate turn
    if (game.turn !== player) {
      throw new Error("It's not your turn");
    }

    // Get current board state
    const boardState = game.board_state || initializeCheckersBoard();
    const pieces = [...boardState.pieces];
    const capturedPieces = [...boardState.capturedPieces];
    let mustCapture = boardState.mustCapture || false;

    // Find the moving piece
    const pieceIndex = pieces.findIndex(p => p.position === from);
    if (pieceIndex === -1) {
      throw new Error('No piece at starting position');
    }

    const piece = pieces[pieceIndex];
    if (piece.color !== player) {
      throw new Error("You can only move your own pieces");
    }

    // Validate move (simplified - in a real app you'd have full move validation)
    const dx = Math.abs(to.charCodeAt(0) - from.charCodeAt(0));
    const dy = parseInt(to[1]) - parseInt(from[1]);
    const direction = piece.color === 'red' ? -1 : 1;

    // Check if this is a capture move
    const isCapture = dx === 2 && Math.abs(dy) === 2;
    if (isCapture) {
      // Find the captured piece (middle square)
      const midCol = String.fromCharCode(
        (from.charCodeAt(0) + to.charCodeAt(0)) / 2
      );
      const midRow = (parseInt(from[1]) + parseInt(to[1])) / 2;
      const capturedPos = `${midCol}${midRow}`;
      
      const capturedIndex = pieces.findIndex(p => p.position === capturedPos);
      if (capturedIndex === -1) {
        throw new Error('Invalid capture - no piece to capture');
      }
      
      // Remove captured piece
      capturedPieces.push(pieces[capturedIndex]);
      pieces.splice(capturedIndex, 1);
    }

    // Move the piece
    pieces[pieceIndex].position = to;

    // Check for promotion to king
    if (!piece.isKing) {
      if ((piece.color === 'red' && to[1] === '1') || 
          (piece.color === 'black' && to[1] === '8')) {
        pieces[pieceIndex].isKing = true;
      }
    }

    // Update game state
    const newBoardState = {
      ...boardState,
      pieces,
      capturedPieces,
      turn: boardState.turn === 'red' ? 'black' : 'red',
      lastMove: { from, to },
      lastCapture: isCapture ? { from, to, captured: capturedPieces.slice(-1)[0] } : null
    };

    // Check for additional captures
    const additionalCaptures = findAdditionalCaptures(to, pieces, piece.color);
    if (isCapture && additionalCaptures.length > 0) {
      newBoardState.mustCapture = true;
      newBoardState.legalMoves = additionalCaptures;
    } else {
      newBoardState.mustCapture = false;
      newBoardState.legalMoves = [];
    }

    // Update game in database
    const updatedState = {
      board_state: newBoardState,
      turn: newBoardState.turn,
      updated_at: new Date().toISOString()
    };

    const { data: updatedGame, error } = await supabase
      .from('checkers_games')
      .update(updatedState)
      .eq('code', gameCode)
      .select()
      .single();

    if (error) throw error;

    activeGames.set(gameCode, updatedGame);

    return {
      success: true,
      gameState: updatedGame,
      move: { from, to, captures: isCapture ? capturedPieces.slice(-1) : [] }
    };

  } catch (error) {
    console.error('Move processing error:', error);
    throw error;
  }
}

function findAdditionalCaptures(position, pieces, color) {
  // Simplified - in a real app you'd implement full capture detection
  return [];
}

function checkCheckersGameEndConditions(gameCode, gameData) {
  const boardState = gameData.board_state;
  
  // Check if one player has no pieces left
  const redPieces = boardState.pieces.filter(p => p.color === 'red').length;
  const blackPieces = boardState.pieces.filter(p => p.color === 'black').length;
  
  if (redPieces === 0) {
    endGame(gameCode, 'black', 'capture all pieces');
    io.to(gameCode).emit('gameOver', { winner: 'black', reason: 'captured all pieces' });
    return;
  }
  
  if (blackPieces === 0) {
    endGame(gameCode, 'red', 'capture all pieces');
    io.to(gameCode).emit('gameOver', { winner: 'red', reason: 'captured all pieces' });
    return;
  }
  
  // Check for stalemate (no legal moves)
  const currentPlayer = gameData.turn;
  const hasLegalMoves = checkHasLegalMoves(currentPlayer, boardState);
  
  if (!hasLegalMoves) {
    endGame(gameCode, null, 'no legal moves');
    io.to(gameCode).emit('gameOver', { winner: null, reason: 'no legal moves' });
    return;
  }
}

function checkHasLegalMoves(player, boardState) {
  // Simplified - in a real app you'd check all possible moves
  return true;
}

// Timer and game management functions (similar to chess but adapted for checkers)
function startGameTimer(gameCode, initialTime = 600) {
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
    delete gameTimers[gameCode];
  }

  gameTimers[gameCode] = {
    redTime: initialTime,
    blackTime: initialTime,
    lastUpdate: Date.now(),
    currentTurn: 'red',
    interval: setInterval(async () => {
      try {
        const now = Date.now();
        const elapsed = Math.floor((now - gameTimers[gameCode].lastUpdate) / 1000);
        gameTimers[gameCode].lastUpdate = now;

        const game = activeGames.get(gameCode);
        if (!game || game.status !== 'ongoing') {
          clearInterval(gameTimers[gameCode].interval);
          delete gameTimers[gameCode];
          return;
        }

        if (gameTimers[gameCode].currentTurn === 'red') {
          gameTimers[gameCode].redTime = Math.max(0, gameTimers[gameCode].redTime - elapsed);
          
          if (gameTimers[gameCode].redTime <= 0) {
            await handleTimeout(gameCode, 'black');
            return;
          }
        } else {
          gameTimers[gameCode].blackTime = Math.max(0, gameTimers[gameCode].blackTime - elapsed);
          
          if (gameTimers[gameCode].blackTime <= 0) {
            await handleTimeout(gameCode, 'red');
            return;
          }
        }

        io.to(gameCode).emit('timerUpdate', {
          redTime: gameTimers[gameCode].redTime,
          blackTime: gameTimers[gameCode].blackTime,
          currentTurn: gameTimers[gameCode].currentTurn
        });
      } catch (error) {
        console.error('Timer error:', error);
        if (gameTimers[gameCode]) {
          clearInterval(gameTimers[gameCode].interval);
          delete gameTimers[gameCode];
        }
      }
    }, 1000)
  };

  io.to(gameCode).emit('timerUpdate', {
    redTime: gameTimers[gameCode].redTime,
    blackTime: gameTimers[gameCode].blackTime,
    currentTurn: gameTimers[gameCode].currentTurn
  });
}

async function handleTimeout(gameCode, winner) {
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
  }
  
  const endedGame = await endGame(gameCode, winner, 'timeout');
  const room = gameRooms.get(gameCode);
  const loser = winner === 'red' ? 'black' : 'red';
  
  if (room?.[winner]) {
    io.to(room[winner]).emit('gameWon', {
      type: 'timeout',
      message: 'Opponent ran out of time',
      amount: endedGame.winningAmount,
      newBalance: endedGame.winnerNewBalance
    });
  }
  
  if (room?.[loser]) {
    io.to(room[loser]).emit('gameLost', {
      type: 'timeout',
      message: 'You ran out of time',
      amount: -endedGame.bet,
      newBalance: endedGame.loserNewBalance
    });
  }

  cleanupGameResources(gameCode);
}

async function endGame(gameCode, winner, result) {
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
    delete gameTimers[gameCode];
  }

  const game = activeGames.get(gameCode);
  if (game && game.status === 'finished') {
    return game;
  }
  
  try {
    const updateData = {
      status: 'finished',
      winner,
      result: result.slice(0, 50),
      updated_at: new Date().toISOString(),
      ended_at: new Date().toISOString()
    };

    let winnerTransaction = null;
    let loserTransaction = null;
    const room = gameRooms.get(gameCode);

    if (game.bet && game.bet > 0 && winner) {
      const totalPrizePool = game.bet * 2;
      const commissionAmount = Math.round(totalPrizePool * 0.1 * 100) / 100;
      const winnerPayout = totalPrizePool - commissionAmount;

      const winnerPhone = winner === 'red' ? game.red_phone : game.black_phone;
      const winnerSocket = winner === 'red' ? room?.red : room?.black;

      if (winnerPhone) {
        const winnerNewBalance = await updatePlayerBalance(
          winnerPhone,
          winnerPayout,
          'win',
          gameCode,
          `Won checkers game by ${result}`
        );

        winnerTransaction = {
          player: winnerPhone,
          amount: winnerPayout,
          newBalance: winnerNewBalance
        };

        if (winnerSocket) {
          io.to(winnerSocket).emit('balanceUpdate', {
            amount: winnerPayout,
            newBalance: winnerNewBalance,
            message: `$${winnerPayout} awarded for winning`
          });
        }
      }

      const loser = winner === 'red' ? 'black' : 'red';
      const loserPhone = loser === 'red' ? game.red_phone : game.black_phone;
      const loserSocket = loser === 'red' ? room?.red : room?.black;

      if (loserPhone) {
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
          description: `Lost checkers game by ${result}`,
          status: 'completed'
        });

        loserTransaction = {
          player: loserPhone,
          amount: -game.bet,
          newBalance: loserBalance
        };

        if (loserSocket) {
          io.to(loserSocket).emit('balanceUpdate', {
            amount: -game.bet,
            newBalance: loserBalance,
            message: `$${game.bet} lost`
          });
        }
      }

      await updateHouseBalance(commissionAmount);
    }

    const { error: updateError } = await supabase
      .from('checkers_games')
      .update(updateData)
      .eq('code', gameCode);

    if (updateError) throw updateError;

    cleanupGameResources(gameCode);
    
    return {
      ...game,
      ...updateData,
      betAmount: game.bet || 0,
      winningAmount: game.bet ? Math.round(game.bet * 1.8 * 100) / 100 : 0,
      winnerNewBalance: winnerTransaction?.newBalance,
      loserNewBalance: loserTransaction?.newBalance
    };

  } catch (error) {
    console.error('Error ending game:', error);
    cleanupGameResources(gameCode);
    throw error;
  }
}

function cleanupGameResources(gameCode) {
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
    delete gameTimers[gameCode];
  }
  
  Object.keys(disconnectTimers).forEach(key => {
    if (key.startsWith(`${gameCode}_`)) {
      clearTimeout(disconnectTimers[key]);
      delete disconnectTimers[key];
    }
  });
  
  activeGames.delete(gameCode);
  gameRooms.delete(gameCode);
  playerConnections.delete(gameCode);
}

// Utility functions (same as chess server)
async function updatePlayerBalance(phone, amount, transactionType, gameCode = null, description = '') {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('balance')
      .eq('phone', phone)
      .single();

    if (error) throw error;
    if (!user) throw new Error('User not found');

    const balanceBefore = user.balance || 0;
    const newBalance = Math.max(0, balanceBefore + amount);

    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('phone', phone);

    if (updateError) throw updateError;

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

async function recordTransaction(transactionData) {
  try {
    const { error } = await supabase
      .from('player_transactions')
      .insert({
        player_phone: transactionData.player_phone,
        transaction_type: transactionData.transaction_type,
        amount: transactionData.amount,
        balance_before: transactionData.balance_before,
        balance_after: transactionData.balance_after,
        description: transactionData.description,
        status: 'completed',
        created_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (error) {
    console.error('Failed to record transaction:', error);
    throw error;
  }
}

async function updateHouseBalance(amount) {
  try {
    const { data: house, error } = await supabase
      .from('house_balance')
      .select('balance')
      .eq('id', 1)
      .single();

    if (error) throw error;

    const newBalance = (house?.balance || 0) + amount;

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
      .from('checkers_games')
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

    const result = await processCheckersMove(gameCode, from, to, player);
    
    if (io.sockets.adapter.rooms.get(gameCode)) {
      io.to(gameCode).emit('gameUpdate', result);
    }

    checkCheckersGameEndConditions(gameCode, result.gameState);

    res.json(result);
  } catch (error) {
    console.error('Move error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Checkers server is running 🚀");
});

// Abandoned game checker
const abandonedGameChecker = setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: abandonedGames } = await supabase
      .from('checkers_games')
      .select('code, status, created_at')
      .or('status.eq.ongoing,status.eq.waiting')
      .lt('updated_at', cutoff);

    for (const game of abandonedGames) {
      await supabase
        .from('checkers_games')
        .update({
          status: 'finished',
          result: 'abandoned',
          updated_at: new Date().toISOString()
        })
        .eq('code', game.code);

      if (activeGames.has(game.code)) {
        if (gameTimers[game.code]) {
          clearInterval(gameTimers[game.code].interval);
          delete gameTimers[game.code];
        }
        activeGames.delete(game.code);
        gameRooms.delete(game.code);
      }

      console.log(`Marked abandoned checkers game ${game.code}`);
    }
  } catch (error) {
    console.error('Abandoned game checker error:', error);
  }
}, 5 * 60 * 1000);

// Clean up on server shutdown
process.on('SIGTERM', () => {
  clearInterval(abandonedGameChecker);
});
