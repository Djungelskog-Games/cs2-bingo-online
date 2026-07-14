const socket = io();

// translations for UI
const translations = {
    pt: {
        lobby_info: "Informação do Lobby",
        players: "Jogadores",
        join_lobby: "Entrar no Lobby",
        create_lobby: "Criar Novo Lobby",
        reroll_game: "Novo Jogo (Baralhar)",
        win_congrats: "O jogo terminou!",
        winner: "Vencedor:",
        continue_playing: "Voltar ao Lobby",
        free_space: "FREE",
        custom_challenges_info: "Desafios Customizados (Apenas ao Criar Lobby):",
        upload_file: "Carregar Ficheiro .txt",
        squares_occupied: "QUADRADOS OCUPADOS",
        lobby_closed: "O dono do lobby saiu. O lobby foi fechado.",
        leave_lobby: "Sair do Lobby",
        join_menu_btn: "Entrar num Lobby",
        create_menu_btn: "Criar Lobby",
        back_btn: "Voltar",
        enable_sabotage: "Ativar Botão de Sabotagem",
        sabotage_space: "SABOTAGEM",
        grid_size: "Tamanho:",
        player_name_placeholder: "Nome",
        lobby_id_placeholder: "ID do Lobby",
        custom_items_placeholder: "Escreve um desafio por linha, ou deixa vazio para os originais...",
        lobby_id_title: "ID DO LOBBY:",
        export_btn: "Exportar",
        import_btn: "Importar"
    },
    en: {
        lobby_info: "Lobby Info",
        players: "Players",
        join_lobby: "Join Lobby",
        create_lobby: "Create New Lobby",
        reroll_game: "New Game (Reroll)",
        win_congrats: "The game has ended!",
        winner: "Winner:",
        continue_playing: "Back to Lobby",
        free_space: "FREE",
        custom_challenges_info: "Custom Challenges (Create Lobby Only):",
        upload_file: "Upload .txt File",
        squares_occupied: "SQUARES OCCUPIED",
        lobby_closed: "The lobby owner left. Lobby closed.",
        leave_lobby: "Leave Lobby",
        join_menu_btn: "Join a Lobby",
        create_menu_btn: "Create Lobby",
        back_btn: "Back",
        enable_sabotage: "Enable Sabotage Button",
        sabotage_space: "SABOTAGE",
        grid_size: "Size:",
        player_name_placeholder: "Name",
        lobby_id_placeholder: "Lobby ID",
        custom_items_placeholder: "Write one challenge per line, or leave empty for defaults...",
        lobby_id_title: "LOBBY ID:",
        export_btn: "Export",
        import_btn: "Import"
    }
};

let currentLang = 'pt';
let playersList = {};
let myId = null;
let creatorId = null;
let currentState = null;

// DOM elements
let gridElement;
let winOverlay;
let closeWinBtn;
let canvas;
let ctx;
let lobbyOverlay;
let joinLobbyBtn;
let createLobbyBtn;
let joinPlayerNameInput;
let createPlayerNameInput;
let lobbyIdInput;
let lobbyError;
let currentLobbyIdDisplay;
let playersListContainer;
let rerollBtn;
let stateControls;
let exportStateBtn;
let importStateBtn;
let stateFileInput;
let customItemsInput;
let customFileLoader;
let leaveLobbyBtn;
let mainMenuSection;
let joinMenuSection;
let createMenuSection;
let showJoinBtn;
let showCreateBtn;
let backBtns;
let sabotageCheckbox;
let copyLobbyIdBtn;
let gridSizeSelect;

// synth beep using web audio api
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSynthBeep(frequency, duration) {
    try {
        initAudio();
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        // ignore errors if browser blocks sound before interaction
    }
}

function playWinMelody() {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
        setTimeout(() => {
            playSynthBeep(freq, 0.3);
        }, idx * 150);
    });
}

// confetti animation
let confetti = [];
let animationFrameId = null;

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

class ConfettiParticle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height - canvas.height;
        this.size = Math.random() * 8 + 6;
        this.speedX = Math.random() * 4 - 2;
        this.speedY = Math.random() * 5 + 4;
        const colors = ['#de9b35', '#eb5e28', '#ffffff', '#8b97a5', '#ffb649'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 4 - 2;
    }

    update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.rotation += this.rotationSpeed;
        if (this.y > canvas.height) {
            this.y = -10;
            this.x = Math.random() * canvas.width;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

function startConfetti() {
    confetti = [];
    for (let i = 0; i < 100; i++) {
        confetti.push(new ConfettiParticle());
    }
    animateConfetti();
}

function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confetti.forEach(particle => {
        particle.update();
        particle.draw();
    });
    animationFrameId = requestAnimationFrame(animateConfetti);
}

function stopConfetti() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Render grid based on server state
function renderGrid(grid, gridSize = 7) {
    gridElement.innerHTML = '';

    gridElement.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    gridElement.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;

    grid.forEach((cellData, index) => {
        const cell = document.createElement('div');
        cell.className = 'cell';

        if (cellData.isFree) {
            cell.classList.add('free-space');
            cell.innerHTML = `
                <div>
                    <span class="icon">🐓</span>
                    <span class="free-text">${translations[currentLang].free_space}</span>
                </div>
            `;
        } else if (cellData.isSabotage) {
            cell.classList.add('sabotage-space');
            cell.innerHTML = `
                <div>
                    <span class="icon" style="font-size: 2rem; display: block; margin-bottom: 5px; color: #ff5757;">💣</span>
                    <span class="sabotage-text" style="font-weight: 800; font-family: var(--font-display); text-transform: uppercase;">${translations[currentLang].sabotage_space}</span>
                </div>
            `;
            cell.addEventListener('click', () => {
                socket.emit('toggleSquare', index);
            });
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = 'cell-text-wrapper';
            const content = document.createElement('div');
            content.className = 'cell-text-content';
            content.textContent = cellData.text;
            wrapper.appendChild(content);
            cell.appendChild(wrapper);
            cell.addEventListener('click', () => {
                socket.emit('toggleSquare', index);
            });
        }

        if (cellData.claimedBy) {
            cell.classList.add('checked');
            const playerColor = playersList[cellData.claimedBy]?.color || '#de9b35';
            cell.style.setProperty('--player-color', playerColor);
            cell.setAttribute('data-owner-id', cellData.claimedBy);
        }

        gridElement.appendChild(cell);
    });

    updateCounters();
    setTimeout(setupCellOverflows, 50);
}

function setupCellOverflows() {
    if (!gridElement) return;
    const cells = gridElement.querySelectorAll('.cell');
    cells.forEach(cell => {
        const wrapper = cell.querySelector('.cell-text-wrapper');
        const content = cell.querySelector('.cell-text-content');
        if (!wrapper || !content) return;

        // Reset inline styles and classes
        wrapper.classList.remove('overflowing');
        cell.classList.remove('cell-overflow');
        content.style.transform = '';
        cell.style.removeProperty('--translate-y');

        const containerHeight = wrapper.clientHeight;
        const contentHeight = content.scrollHeight;

        if (contentHeight > containerHeight) {
            wrapper.classList.add('overflowing');
            cell.classList.add('cell-overflow');
            const scrollDistance = contentHeight - containerHeight;
            // set negative translate value with 4px safety padding
            cell.style.setProperty('--translate-y', `-${scrollDistance + 4}px`);
        }
    });
}

function updateCounters() {
    let total = 0;
    let scores = {};

    const cells = gridElement.children;
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.classList.contains('checked')) {
            total++;
            const owner = cell.getAttribute('data-owner-id');
            if (owner) {
                scores[owner] = (scores[owner] || 0) + 1;
            }
        }
    }

    // Calculate max squares dynamically from grid elements
    const maxSquares = Array.from(gridElement.children).filter(cell => !cell.classList.contains('free-space')).length;

    // Update Board Counter
    const boardCounter = document.getElementById('board-counter');
    if (boardCounter) {
        boardCounter.textContent = `${total}/${maxSquares} ${translations[currentLang].squares_occupied}`;
    }

    // Update Player List scores
    Object.keys(playersList).forEach(pId => {
        const pScoreEl = document.getElementById(`score-${pId}`);
        if (pScoreEl) {
            pScoreEl.textContent = scores[pId] || 0;
        }
    });
}

function updatePlayersList() {
    playersListContainer.innerHTML = '';
    Object.values(playersList).forEach(player => {
        const pEl = document.createElement('div');
        pEl.style.display = 'flex';
        pEl.style.alignItems = 'center';
        pEl.style.justifyContent = 'space-between';
        pEl.style.margin = '5px 0';

        const isMe = player.id === socket.id;
        const isCurrentPlayerHost = creatorId === socket.id;
        const showKick = isCurrentPlayerHost && !isMe;

        pEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                <div style="width: 15px; height: 15px; border-radius: 50%; background-color: ${player.color}; box-shadow: 0 0 5px ${player.color}; flex-shrink: 0;"></div>
                <span style="font-size: 1.1rem; color: var(--text-light); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${player.name} ${isMe ? '(You)' : ''}
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                ${showKick ? `
                    <button class="btn-kick" data-player-id="${player.id}" title="Kick Player">
                        Kick
                    </button>
                ` : ''}
                <div style="font-size: 1.2rem; font-weight: 700; color: ${player.color};" id="score-${player.id}">0</div>
            </div>
        `;
        playersListContainer.appendChild(pEl);
    });

    // Attach kick event listeners
    const kickBtns = playersListContainer.querySelectorAll('.btn-kick');
    kickBtns.forEach(btn => {
        let confirmTimeout = null;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const playerId = btn.getAttribute('data-player-id');

            if (btn.classList.contains('confirming')) {
                // Second click: emit kick event
                socket.emit('kickPlayer', playerId);
                if (confirmTimeout) clearTimeout(confirmTimeout);
            } else {
                // First click: prompt inside button
                btn.classList.add('confirming');
                btn.textContent = 'Sure?';

                confirmTimeout = setTimeout(() => {
                    btn.classList.remove('confirming');
                    btn.textContent = 'Kick';
                }, 3000);
            }
        });
    });

    updateCounters();
}

// Socket Events
socket.on('connect', () => {
    myId = socket.id;
});

socket.on('gameState', (state) => {
    lobbyOverlay.classList.remove('active');
    currentLobbyIdDisplay.textContent = state.lobbyId;
    playersList = state.players;
    creatorId = state.creatorId;
    currentState = state;

    if (state.creatorId === socket.id) {
        rerollBtn.style.display = 'flex';
        stateControls.style.display = 'flex';
    } else {
        rerollBtn.style.display = 'none';
        stateControls.style.display = 'none';
    }

    // if game was restarted, we should clear the win overlay if active
    if (state.status === 'playing') {
        winOverlay.classList.remove('active');
        stopConfetti();
    }

    updatePlayersList();
    renderGrid(state.grid, state.gridSize);
});

socket.on('playersUpdate', (players) => {
    playersList = players;
    if (currentState) {
        currentState.players = players;
    }
    updatePlayersList();
});

socket.on('kicked', () => {
    const errMsg = currentLang === 'pt' ? 'Foste expulso do lobby!' : 'You have been kicked from the lobby!';
    if (lobbyError) {
        lobbyError.textContent = errMsg;
        lobbyError.style.display = 'block';
    }
    lobbyOverlay.classList.add('active');
    winOverlay.classList.remove('active');
    stopConfetti();
    // Clear state
    playersList = {};
    myId = null;
    creatorId = null;
});

socket.on('squareClaimed', ({ index, claimedBy }) => {
    const cells = gridElement.children;
    const cell = cells[index];

    if (cell && !cell.classList.contains('checked')) {
        cell.classList.add('checked');
        const playerColor = playersList[claimedBy]?.color || '#de9b35';
        cell.style.setProperty('--player-color', playerColor);
        cell.setAttribute('data-owner-id', claimedBy);

        if (currentState && currentState.grid[index]) {
            currentState.grid[index].claimedBy = claimedBy;
        }

        // play a click sound (success)
        playSynthBeep(claimedBy === socket.id ? 523.25 : 440.00, 0.15);

        updateCounters();
    }
});

socket.on('squareUnclaimed', ({ index }) => {
    const cells = gridElement.children;
    const cell = cells[index];

    if (cell && cell.classList.contains('checked')) {
        cell.classList.remove('checked');
        cell.style.removeProperty('--player-color');
        cell.removeAttribute('data-owner-id');

        if (currentState && currentState.grid[index]) {
            currentState.grid[index].claimedBy = null;
        }

        // play a deselect sound (lower pitch)
        playSynthBeep(261.63, 0.15);

        updateCounters();
    }
});

socket.on('squareClaimFailed', ({ index }) => {
    // Play an error sound (low dissonant beep)
    playSynthBeep(150, 0.2);
});

socket.on('gameWon', ({ winnerId, line, winnerName }) => {
    if (currentState) {
        currentState.winner = winnerId;
        currentState.status = 'finished';
    }
    winOverlay.querySelector('.win-text').textContent = translations[currentLang].win_congrats + ` ${translations[currentLang].winner}` + ` ${winnerName}`;
    winOverlay.classList.add('active');
    startConfetti();
    playWinMelody();
});

socket.on('errorMsg', (msg) => {
    lobbyError.textContent = msg;
    lobbyError.style.display = 'block';
});

socket.on('lobbyClosed', () => {
    lobbyOverlay.classList.add('active');
    lobbyError.textContent = translations[currentLang].lobby_closed;
    lobbyError.style.display = 'block';

    // Also reset win overlay if open
    winOverlay.classList.remove('active');
    stopConfetti();
});

// language controller
function setLanguage(lang) {
    currentLang = lang;

    // update the active class
    document.querySelectorAll('.lang-btn').forEach(btn => {
        if (btn.getAttribute('data-lang') === lang) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // update HTML text elements
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        if (translations[lang][key]) {
            if (el.tagName === 'SPAN') {
                el.textContent = translations[lang][key];
            } else {
                el.textContent = translations[lang][key];
            }
        }
    });

    // update placeholders
    document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
        const key = el.getAttribute('data-translate-placeholder');
        if (translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });

    if (typeof updateCounters === 'function') {
        updateCounters();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    gridElement = document.getElementById('bingo-grid');
    winOverlay = document.getElementById('win-overlay');
    closeWinBtn = document.getElementById('close-win-btn');
    canvas = document.getElementById('confetti-canvas');
    ctx = canvas.getContext('2d');

    lobbyOverlay = document.getElementById('lobby-overlay');
    joinLobbyBtn = document.getElementById('join-lobby-btn');
    createLobbyBtn = document.getElementById('create-lobby-btn');
    joinPlayerNameInput = document.getElementById('join-player-name');
    createPlayerNameInput = document.getElementById('create-player-name');
    lobbyIdInput = document.getElementById('lobby-id-input');
    lobbyError = document.getElementById('lobby-error');
    currentLobbyIdDisplay = document.getElementById('current-lobby-id');
    playersListContainer = document.getElementById('players-list');
    rerollBtn = document.getElementById('reroll-btn');
    stateControls = document.getElementById('state-controls');
    exportStateBtn = document.getElementById('export-state-btn');
    importStateBtn = document.getElementById('import-state-btn');
    stateFileInput = document.getElementById('state-file-input');
    customItemsInput = document.getElementById('custom-items-input');
    customFileLoader = document.getElementById('custom-file-loader');
    leaveLobbyBtn = document.getElementById('leave-lobby-btn');
    mainMenuSection = document.getElementById('main-menu-section');
    joinMenuSection = document.getElementById('join-menu-section');
    createMenuSection = document.getElementById('create-menu-section');
    showJoinBtn = document.getElementById('show-join-btn');
    showCreateBtn = document.getElementById('show-create-btn');
    backBtns = document.querySelectorAll('.back-btn');
    sabotageCheckbox = document.getElementById('sabotage-checkbox');
    copyLobbyIdBtn = document.getElementById('copy-lobby-id-btn');
    gridSizeSelect = document.getElementById('grid-size-select');

    // initialize canvas dimensions
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('resize', setupCellOverflows);

    closeWinBtn.addEventListener('click', () => {
        winOverlay.classList.remove('active');
        stopConfetti();
        // You could redirect back to lobby here if desired:
        // window.location.reload();
    });

    if (copyLobbyIdBtn) {
        copyLobbyIdBtn.addEventListener('click', () => {
            const lobbyId = currentLobbyIdDisplay.textContent;
            if (!lobbyId || lobbyId === '----') return;

            const copyIcon = copyLobbyIdBtn.querySelector('.copy-icon');
            const checkIcon = copyLobbyIdBtn.querySelector('.check-icon');

            navigator.clipboard.writeText(lobbyId).then(() => {
                if (copyIcon && checkIcon) {
                    copyIcon.style.display = 'none';
                    checkIcon.style.display = 'block';
                    copyLobbyIdBtn.style.borderColor = 'var(--primary)';

                    setTimeout(() => {
                        copyIcon.style.display = 'block';
                        checkIcon.style.display = 'none';
                        copyLobbyIdBtn.style.borderColor = '';
                    }, 2000);
                }
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });
    }

    // Menu transitions
    showJoinBtn.addEventListener('click', () => {
        mainMenuSection.style.display = 'none';
        joinMenuSection.style.display = 'block';
    });

    showCreateBtn.addEventListener('click', () => {
        mainMenuSection.style.display = 'none';
        createMenuSection.style.display = 'block';
    });

    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            joinMenuSection.style.display = 'none';
            createMenuSection.style.display = 'none';
            mainMenuSection.style.display = 'block';
            lobbyError.style.display = 'none';
        });
    });

    // Lobby events
    joinLobbyBtn.addEventListener('click', () => {
        const name = joinPlayerNameInput.value.trim() || 'Player';
        const lobbyId = lobbyIdInput.value.trim();
        if (!lobbyId) {
            lobbyError.textContent = 'Insira um ID de Lobby / Enter a Lobby ID';
            lobbyError.style.display = 'block';
            return;
        }
        lobbyError.style.display = 'none';
        socket.emit('joinLobby', { lobbyId, name });
    });

    createLobbyBtn.addEventListener('click', () => {
        const name = createPlayerNameInput.value.trim() || 'Player';
        lobbyError.style.display = 'none';

        // Parse custom challenges
        let customChallenges = [];
        if (customItemsInput && customItemsInput.value.trim() !== '') {
            customChallenges = customItemsInput.value.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        }

        const sabotageEnabled = sabotageCheckbox ? sabotageCheckbox.checked : false;
        const gridSize = gridSizeSelect ? parseInt(gridSizeSelect.value) : 7;

        socket.emit('createLobby', { name, lang: currentLang, customChallenges, sabotageEnabled, gridSize });
    });

    // Handle custom file upload
    if (customFileLoader) {
        customFileLoader.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (evt) {
                customItemsInput.value = evt.target.result;
            };
            reader.readAsText(file);
        });
    }

    rerollBtn.addEventListener('click', () => {
        socket.emit('rerollLobby');
    });

    if (exportStateBtn) {
        exportStateBtn.addEventListener('click', () => {
            if (!currentState) return;
            const stateStr = JSON.stringify(currentState, null, 2);
            const blob = new Blob([stateStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cs2-bingo-state-${currentState.lobbyId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (importStateBtn && stateFileInput) {
        importStateBtn.addEventListener('click', () => {
            stateFileInput.click();
        });

        stateFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const importedState = JSON.parse(evt.target.result);
                    socket.emit('importState', importedState);
                } catch (err) {
                    console.error('Invalid JSON file', err);
                }
            };
            reader.readAsText(file);

            e.target.value = ''; // Reset input
        });
    }

    leaveLobbyBtn.addEventListener('click', () => {
        socket.emit('leaveLobby');
        lobbyOverlay.classList.add('active');
        lobbyError.style.display = 'none'; // clear errors
        // reset UI
        winOverlay.classList.remove('active');
        stopConfetti();
    });

    // language selector
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setLanguage(btn.getAttribute('data-lang'));
        });
    });

    setLanguage('pt');
});
