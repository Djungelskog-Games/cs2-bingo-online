const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

// Default items
const defaultItemsPt = [
    "kill pela smoke (sem ver o inimigo)", "ace", "kill com nade", "3 2k de seguida", "jumpshot",
    "20 inimigos flashados", "kill de faca", "3 kills com 3 armas diferentes", "clutch 1v3 ou mais", "2 no scopes de seguida",
    "kill com molotov", "3k na pistol", "ter 16000$", "kill de zeus", "kill de wallbang (sem ver o inimigo)",
    "2 kills de nova", "10 assists", "2 first bloods seguidos", "6/7", "ninja defuse",
    "4 mvps", "200 utility damage", "volta ao mapa (ct -> bombsite A -> t -> bombsite B)", "2000 de dano"
];

const defaultItemsEn = [
    "kill through smoke (without seeing)", "ace", "HE grenade kill", "three 2ks in a row", "jumpshot kill",
    "flash 20 enemies", "knife kill", "3 kills with 3 different weapons", "1v3 clutch or better", "2 no-scopes in a row",
    "molotov/incendiary kill", "3k in pistol round", "have $16,000", "zeus kill", "wallbang kill (without seeing)",
    "2 nova kills", "10 assists", "2 first bloods in a row", "6/7", "ninja defuse",
    "4 MVPs", "200 utility damage", "lap around the map (ct -> site A -> t -> site B)", "2000 damage"
];

const lobbies = {}; // In-memory storage for lobbies

const PLAYER_COLORS = [
    "#FF5733", "#33C1FF", "#8A2BE2", "#32CD32", "#FF1493", "#FFA500", "#00CED1", "#FFD700"
];

function generateGrid(lang, customChallenges, sabotageEnabled) {
    let sourceList = lang === 'en' ? defaultItemsEn : defaultItemsPt;
    if (customChallenges && Array.isArray(customChallenges) && customChallenges.length > 0) {
        sourceList = customChallenges;
    }
    const freeText = lang === 'en' ? "FREE" : "FREE";
    const sabotageText = lang === 'en' ? "SABOTAGE" : "SABOTAGEM";
    
    // We need 48 items to fill a 7x7 board with 1 free space
    let expandedLines = [];
    while (expandedLines.length < 48) {
        expandedLines = expandedLines.concat(sourceList);
    }
    
    // Shuffle
    const shuffled = expandedLines.slice(0, 48).sort(() => Math.random() - 0.5);
    
    const grid = [];
    let itemIdx = 0;
    for (let i = 0; i < 49; i++) {
        if (i === 24) {
            if (sabotageEnabled) {
                grid.push({ id: i, text: sabotageText, isFree: false, isSabotage: true, claimedBy: null });
            } else {
                grid.push({ id: i, text: freeText, isFree: true, isSabotage: false, claimedBy: null });
            }
        } else {
            grid.push({ id: i, text: shuffled[itemIdx], isFree: false, isSabotage: false, claimedBy: null });
            itemIdx++;
        }
    }
    return grid;
}

function generateLobbyId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    socket.on('createLobby', ({ name, lang, customChallenges, sabotageEnabled }) => {
        const lobbyId = generateLobbyId();
        lobbies[lobbyId] = {
            status: 'playing',
            lang: lang || 'pt',
            creatorId: socket.id,
            customChallenges: customChallenges || null,
            sabotageEnabled: sabotageEnabled || false,
            colorIndex: 0,
            players: {},
            grid: generateGrid(lang || 'pt', customChallenges, sabotageEnabled),
            winner: null
        };
        
        joinLobbyLogic(socket, lobbyId, name);
    });

    socket.on('joinLobby', ({ lobbyId, name }) => {
        const id = lobbyId.toUpperCase();
        if (lobbies[id]) {
            joinLobbyLogic(socket, id, name);
        } else {
            socket.emit('errorMsg', 'Lobby não encontrado / Lobby not found');
        }
    });

    function joinLobbyLogic(socket, lobbyId, name) {
        socket.join(lobbyId);
        
        const lobby = lobbies[lobbyId];
        const usedColors = Object.values(lobby.players).map(p => p.color);
        let color = PLAYER_COLORS.find(c => !usedColors.includes(c));
        
        if (!color) {
            color = PLAYER_COLORS[lobby.colorIndex % PLAYER_COLORS.length];
        }
        lobby.colorIndex++;
        
        lobby.players[socket.id] = { id: socket.id, name: name || 'Player', color: color };
        socket.lobbyId = lobbyId;

        // Emit current state to the user
        socket.emit('gameState', {
            lobbyId,
            lang: lobby.lang,
            creatorId: lobby.creatorId,
            players: lobby.players,
            grid: lobby.grid,
            status: lobby.status,
            winner: lobby.winner
        });

        // Broadcast to others that someone joined
        socket.to(lobbyId).emit('playersUpdate', lobby.players);
    }

    socket.on('toggleSquare', (index) => {
        const lobbyId = socket.lobbyId;
        if (!lobbyId || !lobbies[lobbyId]) return;
        
        const lobby = lobbies[lobbyId];
        if (lobby.status !== 'playing') return;
        
        const cell = lobby.grid[index];
        if (cell.isFree && !cell.isSabotage) return;
        
        if (cell.claimedBy === socket.id) {
            // Deselect
            cell.claimedBy = null;
            io.to(lobbyId).emit('squareUnclaimed', { index });
        } else if (cell.claimedBy === null) {
            // Select
            cell.claimedBy = socket.id;
            io.to(lobbyId).emit('squareClaimed', { index, claimedBy: socket.id });
            checkWinCondition(lobbyId, socket.id);
        } else {
            // Already claimed by someone else
            socket.emit('squareClaimFailed', { index });
        }
    });

    socket.on('rerollLobby', () => {
        const lobbyId = socket.lobbyId;
        if (!lobbyId || !lobbies[lobbyId]) return;
        
        const lobby = lobbies[lobbyId];
        if (lobby.creatorId !== socket.id) return; // Only creator can reroll
        
        lobby.grid = generateGrid(lobby.lang, lobby.customChallenges, lobby.sabotageEnabled);
        lobby.status = 'playing';
        lobby.winner = null;
        
        // Emit new state to everyone
        io.to(lobbyId).emit('gameState', {
            lobbyId,
            lang: lobby.lang,
            creatorId: lobby.creatorId,
            players: lobby.players,
            grid: lobby.grid,
            status: lobby.status,
            winner: lobby.winner
        });
    });

    function handleLeave(socket) {
        const lobbyId = socket.lobbyId;
        if (lobbyId && lobbies[lobbyId]) {
            const lobby = lobbies[lobbyId];
            
            if (lobby.creatorId === socket.id) {
                socket.to(lobbyId).emit('lobbyClosed');
                delete lobbies[lobbyId];
            } else {
                delete lobby.players[socket.id];
                
                if (Object.keys(lobby.players).length === 0) {
                    // Delete empty lobby after some time or immediately
                    delete lobbies[lobbyId];
                } else {
                    io.to(lobbyId).emit('playersUpdate', lobby.players);
                }
            }
        }
        if (lobbyId) {
            socket.leave(lobbyId);
            socket.lobbyId = null;
        }
    }

    socket.on('disconnect', () => {
        handleLeave(socket);
    });

    socket.on('leaveLobby', () => {
        handleLeave(socket);
    });

    socket.on('kickPlayer', (targetId) => {
        const lobbyId = socket.lobbyId;
        if (!lobbyId || !lobbies[lobbyId]) return;
        const lobby = lobbies[lobbyId];
        
        // Only creator can kick
        if (lobby.creatorId !== socket.id) return;
        
        // Cannot kick self
        if (targetId === socket.id) return;
        
        if (lobby.players[targetId]) {
            const targetSocket = io.sockets.sockets.get(targetId);
            
            // Remove target player from lobby data
            delete lobby.players[targetId];
            
            // Release any squares claimed by the target player
            lobby.grid.forEach(cell => {
                if (cell.claimedBy === targetId) {
                    cell.claimedBy = null;
                }
            });
            
            // Broadcast players update and entire grid state to remaining players
            io.to(lobbyId).emit('gameState', {
                lobbyId,
                lang: lobby.lang,
                creatorId: lobby.creatorId,
                players: lobby.players,
                grid: lobby.grid,
                status: lobby.status,
                winner: lobby.winner
            });
            
            if (targetSocket) {
                targetSocket.emit('kicked');
                targetSocket.leave(lobbyId);
                targetSocket.lobbyId = null;
            }
        }
    });

    function checkWinCondition(lobbyId, socketId) {
        const lobby = lobbies[lobbyId];
        const grid = lobby.grid;
        const winLines = [];

        // 7x7 logic
        const SIZE = 7;
        
        // horizontal
        for (let r = 0; r < SIZE; r++) {
            const row = [];
            for (let c = 0; c < SIZE; c++) row.push(r * SIZE + c);
            winLines.push(row);
        }

        // vertical
        for (let c = 0; c < SIZE; c++) {
            const col = [];
            for (let r = 0; r < SIZE; r++) col.push(r * SIZE + c);
            winLines.push(col);
        }

        // diagonals
        const diag1 = [];
        const diag2 = [];
        for (let i = 0; i < SIZE; i++) {
            diag1.push(i * SIZE + i);
            diag2.push(i * SIZE + (SIZE - 1 - i));
        }
        winLines.push(diag1);
        winLines.push(diag2);

        // Helper to check if a cell is claimed by player or is free space
        const isClaimedOrFree = (idx) => {
            return grid[idx].isFree || grid[idx].claimedBy === socketId;
        };

        for (const line of winLines) {
            if (line.every(isClaimedOrFree)) {
                lobby.status = 'finished';
                lobby.winner = socketId;
                io.to(lobbyId).emit('gameWon', { winnerId: socketId, line, winnerName: lobby.players[socketId].name });
                return;
            }
        }

        // Initialize scores for all players
        let claimedCountByPlayer = {};
        Object.keys(lobby.players).forEach(pId => {
            claimedCountByPlayer[pId] = 0;
        });

        let totalClaimed = 0;
        const CLAIMABLE_SQUARES = 48; // 49 - 1 free space
        
        for (let i = 0; i < grid.length; i++) {
            if (!grid[i].isFree && grid[i].claimedBy !== null) {
                totalClaimed++;
                const pId = grid[i].claimedBy;
                if (claimedCountByPlayer[pId] !== undefined) {
                    claimedCountByPlayer[pId]++;
                } else {
                    claimedCountByPlayer[pId] = 1;
                }
            }
        }

        const remainingSquares = CLAIMABLE_SQUARES - totalClaimed;

        let maxClaims = 0;
        let leaders = [];
        for (const [pId, count] of Object.entries(claimedCountByPlayer)) {
            if (count > maxClaims) {
                maxClaims = count;
                leaders = [pId];
            } else if (count === maxClaims && count > 0) {
                leaders.push(pId);
            }
        }

        if (leaders.length === 0) return;

        // 1. Majority Win (25 or more out of 48)
        if (maxClaims >= 25) {
            const winner = leaders[0];
            lobby.status = 'finished';
            lobby.winner = winner;
            io.to(lobbyId).emit('gameWon', { winnerId: winner, line: [], winnerName: lobby.players[winner].name });
            return;
        }

        // 2. Full Board Win (all 48 claimed, no one reached 25)
        if (remainingSquares === 0) {
            const winner = leaders[0];
            lobby.status = 'finished';
            lobby.winner = winner;
            io.to(lobbyId).emit('gameWon', { winnerId: winner, line: [], winnerName: lobby.players[winner].name });
            return;
        }

        // 3. Impossible for others to win (only applies if there's more than 1 player)
        if (Object.keys(lobby.players).length > 1 && leaders.length === 1 && totalClaimed > 0) {
            const leader = leaders[0];
            let anyoneElseCanWin = false;

            for (const pId of Object.keys(lobby.players)) {
                if (pId === leader) continue;

                // Check if pId can win by squares
                const possibleScore = claimedCountByPlayer[pId] + remainingSquares;
                let canWinBySquares = (possibleScore >= maxClaims) || (possibleScore >= 25);

                // Check if pId can win by line
                let canWinByLine = false;
                for (const line of winLines) {
                    let possible = true;
                    for (const idx of line) {
                        const cell = grid[idx];
                        if (!cell.isFree && cell.claimedBy !== null && cell.claimedBy !== pId) {
                            possible = false;
                            break;
                        }
                    }
                    if (possible) {
                        canWinByLine = true;
                        break;
                    }
                }

                if (canWinBySquares || canWinByLine) {
                    anyoneElseCanWin = true;
                    break;
                }
            }

            if (!anyoneElseCanWin) {
                // Leader wins instantly
                lobby.status = 'finished';
                lobby.winner = leader;
                io.to(lobbyId).emit('gameWon', { winnerId: leader, line: [], winnerName: lobby.players[leader].name });
                return;
            }
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
