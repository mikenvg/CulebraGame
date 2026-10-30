// Referencias a elementos del HTML que se actualizan durante el juego.
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('#game-screen');
const playerForm = document.querySelector('#player-form');
const playerNameInput = document.querySelector('#player-name');
const scoresButton = document.querySelector('#scores-button');
const gameScoresButton = document.querySelector('#game-scores-button');
const scoresDialog = document.querySelector('#scores-dialog');
const scoresStatus = document.querySelector('#scores-status');
const scoresTableWrap = document.querySelector('#scores-table-wrap');
const scoresTableBody = document.querySelector('#scores-table-body');
const scoresRefreshButton = document.querySelector('#scores-refresh');
const scoresCloseButton = document.querySelector('#scores-close');
const scoresModeLabel = document.querySelector('#scores-mode-label');
const board = document.querySelector('#game-board');
const startButton = document.querySelector('#start-button');
const gameMessage = document.querySelector('#game-message');
const liveScore = document.querySelector('#live-score');
const recordScore = document.querySelector('#record-score');

// Valores principales del juego: tamaño del tablero, velocidad y tamaño del fondo original.
const mapSize = 10;
const tickDuration = 200; // milisegundos
const backgroundSize = { width: 1672, height: 941 };

// Cada tecla se traduce a un cambio de fila/columna y a una orientación para el sprite.
const directions = {
  ArrowUp: { row: -1, column: 0, name: 'up' },
  ArrowDown: { row: 1, column: 0, name: 'down' },
  ArrowLeft: { row: 0, column: -1, name: 'left' },
  ArrowRight: { row: 0, column: 1, name: 'right' },
  w: { row: -1, column: 0, name: 'up' },
  s: { row: 1, column: 0, name: 'down' },
  a: { row: 0, column: -1, name: 'left' },
  d: { row: 0, column: 1, name: 'right' },
};

// Coordenadas porcentuales de los cuadros de comida dentro del spritesheet.
const foodSprites = [
  { x: '9.6%', y: '0%' }, { x: '23.8%', y: '0%' }, { x: '36.6%', y: '0%' },
  { x: '50.1%', y: '0%' }, { x: '64.5%', y: '0%' }, { x: '78.2%', y: '0%' },
  { x: '90.4%', y: '0%' }, { x: '16%', y: '100%' }, { x: '31.9%', y: '100%' },
  { x: '48.2%', y: '100%' }, { x: '64.2%', y: '100%' }, { x: '80.5%', y: '100%' },
];

// Estado de la partida. La serpiente se ordena desde la cabeza (índice 0) hasta la cola.
let snake = [];
let food = null;
let direction = directions.ArrowRight;
// El giro pendiente se aplica en el siguiente movimiento de la serpiente.
let queuedDirection = direction;
let score = 0;
let record = Number(window.localStorage.getItem('snake-record')) || 0;
let gamePhase = 'idle';
let gameTimer = null;
let playerName = '';
// Identificadores para descartar respuestas de partidas o consultas anteriores.
let gameNumber = 0;
let leaderboardRequest = 0;
// Señala si abrir el diálogo pausó una partida que debe continuar al cerrarlo.
let resumeAfterScores = false;

// Inicializa los valores visibles antes de que comience la primera partida.
recordScore.value = String(record).padStart(3, '0');
updateScoreDisplay();
updateScoreboardPosition();
window.addEventListener('resize', updateScoreboardPosition);

// Valida el nombre y cambia del menú inicial a la pantalla de juego.
playerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  playerName = playerNameInput.value.trim();
  if (!playerName) {
    playerNameInput.setCustomValidity('Escribe un nombre para jugar.');
    playerNameInput.reportValidity();
    return;
  }

  playerNameInput.setCustomValidity('');
  homeScreen.hidden = true;
  gameScreen.hidden = false;
});

// Quita el error personalizado cuando el jugador modifica el campo de nombre.
playerNameInput.addEventListener('input', () => playerNameInput.setCustomValidity(''));

// Conecta los botones de puntuaciones de ambas pantallas con el mismo diálogo.
scoresButton.addEventListener('click', openScores);
gameScoresButton.addEventListener('click', openScores);
scoresRefreshButton.addEventListener('click', loadLeaderboard);
scoresCloseButton.addEventListener('click', () => scoresDialog.close());
scoresDialog.addEventListener('close', () => {
  // Sólo se reanuda si el diálogo fue quien pausó la partida.
  if (!resumeAfterScores) return;
  resumeAfterScores = false;
  if (gamePhase !== 'paused') return;
  gamePhase = 'running';
  gameTimer = window.setInterval(moveSnake, tickDuration);
  updateGameControls();
});

// El botón cambia entre empezar, pausar, continuar y reiniciar según la fase.
startButton.addEventListener('click', () => {
  if (gamePhase === 'idle' || gamePhase === 'over') {
    startGame();
  } else if (gamePhase === 'paused') {
    gamePhase = 'running';
    gameTimer = window.setInterval(moveSnake, tickDuration);
    updateGameControls();
  } else if (gamePhase === 'running') {
    clearInterval(gameTimer);
    gameTimer = null;
    gamePhase = 'paused';
    updateGameControls();
  }
});

// Control de teclado: flechas/WASD mueven y espacio pausa o reanuda.
document.addEventListener('keydown', (event) => {
  // Ignora teclas cuando el juego no está visible, el diálogo está abierto o se escribe texto.
  if (gameScreen.hidden || scoresDialog.open) return;
  const targetTag = event.target.tagName;
  if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

  if (event.code === 'Space' && (gamePhase === 'running' || gamePhase === 'paused')) {
    event.preventDefault();
    startButton.click();
    return;
  }

  const pressedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const requestedDirection = directions[pressedKey];
  if (!requestedDirection || gamePhase === 'idle' || gamePhase === 'over' || gamePhase === 'paused') return;
  event.preventDefault();
  // No permite invertir el sentido actual ni el giro que ya está pendiente.
  if (isOpposite(requestedDirection, direction) || isOpposite(requestedDirection, queuedDirection)) return;

  queuedDirection = requestedDirection;
  if (gamePhase === 'ready') {
    direction = requestedDirection;
    gamePhase = 'running';
    gameTimer = window.setInterval(moveSnake, tickDuration);
    updateGameControls();
  }
});

// Construye una vez las 100 celdas que representan las posiciones del tablero 10x10.
for (let row = 1; row <= mapSize; row += 1) {
  for (let column = 1; column <= mapSize; column += 1) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-rowindex', row);
    cell.setAttribute('aria-colindex', column);
    cell.style.animationDelay = `${(row + column) * 5}ms`;
    cell.dataset.row = String(row - 1);
    cell.dataset.column = String(column - 1);
    board.append(cell);
  }
}

// Reinicia los datos de una partida y espera a que el jugador elija la primera dirección.
function startGame() {
  clearInterval(gameTimer);
  gameTimer = null;
  gameNumber += 1;
  snake = [{ row: 4, column: 4 }, { row: 4, column: 3 }];
  direction = directions.ArrowRight;
  queuedDirection = direction;
  score = 0;
  updateScoreDisplay();
  gamePhase = 'ready';
  placeFood();
  renderBoard();
  updateGameControls();
}

// Elige al azar una celda libre y un gráfico de comida.
function placeFood() {
  const emptyCells = [];
  for (let row = 0; row < mapSize; row += 1) {
    for (let column = 0; column < mapSize; column += 1) {
      if (!snake.some((segment) => segment.row === row && segment.column === column)) {
        emptyCells.push({ row, column });
      }
    }
  }

  if (emptyCells.length === 0) {
    food = null;
    finishGame(true);
    return;
  }

  const sprite = foodSprites[Math.floor(Math.random() * foodSprites.length)];
  food = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  food.sprite = sprite;
}

// Calcula cada turno, detecta colisiones y actualiza la longitud y puntuación.
function moveSnake() {
  direction = queuedDirection;
  const head = snake[0];
  const nextHead = {
    row: head.row + direction.row,
    column: head.column + direction.column,
  };
  const eating = nextHead.row === food.row && nextHead.column === food.column;
  // Si no come, la cola se moverá; por eso su celda actual puede recibir la nueva cabeza.
  const occupiedSegments = eating ? snake : snake.slice(0, -1);
  const hitWall = nextHead.row < 0 || nextHead.row >= mapSize || nextHead.column < 0 || nextHead.column >= mapSize;
  const hitSnake = occupiedSegments.some((segment) => segment.row === nextHead.row && segment.column === nextHead.column);

  if (hitWall || hitSnake) {
    finishGame(false);
    return;
  }

  snake.unshift(nextHead);
  if (eating) {
    score += 10;
    if (score > record) {
      record = score;
      window.localStorage.setItem('snake-record', String(record));
      recordScore.value = String(record).padStart(3, '0');
    }
    updateScoreDisplay();
    placeFood();
  } else {
    // Sin comida, se elimina la cola para que la longitud no cambie.
    snake.pop();
  }

  renderBoard();
}

// Dibuja el estado actual con clases CSS y variables de rotación/sprites.
function renderBoard() {
  const cells = board.children;
  for (const cell of cells) {
    // Limpia las marcas del turno anterior antes de representar el estado nuevo.
    cell.className = 'grid-cell';
    cell.style.removeProperty('--rotation');
    cell.style.removeProperty('--food-x');
    cell.style.removeProperty('--food-y');
  }

  if (food) {
    const foodCell = getCell(food.row, food.column);
    foodCell.classList.add('food-cell');
    foodCell.style.setProperty('--food-x', food.sprite.x);
    foodCell.style.setProperty('--food-y', food.sprite.y);
  }

  snake.forEach((segment, index) => {
    const cell = getCell(segment.row, segment.column);
    if (index === 0) {
      cell.classList.add('snake-head');
      cell.style.setProperty('--rotation', `${directionRotation(direction.name)}deg`);
    } else if (index === snake.length - 1) {
      cell.classList.add('snake-tail');
      const previousSegment = snake[index - 1];
      const tailDirection = directionBetween(previousSegment, segment);
      cell.style.setProperty('--rotation', `${tailRotation(tailDirection)}deg`);
    } else {
      // Los segmentos intermedios son rectos o curvos según las posiciones vecinas.
      const previousSegment = snake[index - 1];
      const nextSegment = snake[index + 1];
      const previousDirection = directionBetween(segment, previousSegment);
      const nextDirection = directionBetween(segment, nextSegment);
      if (previousDirection === nextDirection || isOppositeDirection(previousDirection, nextDirection)) {
        cell.classList.add('snake-body-straight');
        cell.style.setProperty('--rotation', `${directionRotation(previousDirection)}deg`);
      } else {
        cell.classList.add('snake-body-corner');
        cell.style.setProperty('--rotation', `${cornerRotation(previousDirection, nextDirection)}deg`);
      }
    }
  });
}

// Convierte fila y columna en el índice lineal del elemento del tablero.
function getCell(row, column) {
  return board.children[row * mapSize + column];
}

// Obtiene la dirección cardinal entre dos segmentos contiguos.
function directionBetween(from, to) {
  if (to.row < from.row) return 'up';
  if (to.row > from.row) return 'down';
  if (to.column < from.column) return 'left';
  return 'right';
}

// Ajusta la orientación del sprite de cabeza según la dirección del movimiento.
function directionRotation(name) {
  return { down: 0, left: 90, up: 180, right: 270 }[name];
}

// Ajusta por separado la orientación base del sprite de cola.
function tailRotation(name) {
  return { left: 0, up: 90, right: 180, down: 270 }[name];
}

// Elige la rotación de una curva a partir de las dos direcciones que conecta.
function cornerRotation(first, second) {
  const connectionKey = [first, second].sort().join('-');
  return {
    'down-right': 0,
    'down-left': 90,
    'left-up': 180,
    'right-up': 270,
  }[connectionKey];
}

// Comprueba si dos nombres representan direcciones contrarias.
function isOppositeDirection(first, second) {
  return ({ up: 'down', down: 'up', left: 'right', right: 'left' })[first] === second;
}

// Comprueba si dos desplazamientos de fila/columna son inversos.
function isOpposite(first, second) {
  return first.row === -second.row && first.column === -second.column;
}

// Muestra la puntuación con un mínimo de tres cifras.
function updateScoreDisplay() {
  liveScore.value = String(score).padStart(3, '0');
}

// Abre la clasificación y pausa la partida si estaba en marcha.
function openScores() {
  resumeAfterScores = false;
  if (gamePhase === 'running') {
    clearInterval(gameTimer);
    gameTimer = null;
    gamePhase = 'paused';
    resumeAfterScores = true;
    updateGameControls();
  }
  if (!scoresDialog.open) scoresDialog.showModal();
  void loadLeaderboard();
}

// Descarga la clasificación y muestra carga, resultados, lista vacía o error.
async function loadLeaderboard() {
  // El número permite ignorar resultados de consultas anteriores que terminen tarde.
  const requestId = ++leaderboardRequest;
  scoresRefreshButton.disabled = true;
  scoresStatus.hidden = false;
  scoresStatus.dataset.state = 'loading';
  scoresStatus.textContent = 'Cargando puntuaciones...';
  scoresTableWrap.hidden = true;
  scoresTableWrap.setAttribute('aria-busy', 'true');
  scoresTableBody.replaceChildren();

  try {
    const response = await fetch('/api/leaderboard');
    if (requestId !== leaderboardRequest) return;
    if (!response.ok) throw new Error(`La API respondió con HTTP ${response.status}.`);
    scoresModeLabel.textContent = response.headers.get('X-Snake-Demo-Mode') === 'true'
      ? 'MODO DEMO · DATOS TEMPORALES'
      : 'TOP 10';

    const scores = await response.json();
    if (requestId !== leaderboardRequest) return;
    if (!Array.isArray(scores)) throw new Error('La respuesta de puntuaciones no es válida.');
    if (scores.length === 0) {
      scoresStatus.dataset.state = 'empty';
      scoresStatus.textContent = 'Todavía no hay puntuaciones. ¡Juega la primera partida!';
      return;
    }

    const currentPlayer = normalizePlayerName(playerName || playerNameInput.value);
    scores.forEach((entry, index) => {
      const row = document.createElement('tr');
      const positionCell = document.createElement('td');
      const playerCell = document.createElement('td');
      const scoreCell = document.createElement('td');
      const isCurrentPlayer = currentPlayer && normalizePlayerName(entry.player) === currentPlayer;

      positionCell.className = 'score-position';
      positionCell.textContent = String(index + 1).padStart(2, '0');
      playerCell.className = 'score-player';
      playerCell.textContent = entry.player;
      scoreCell.className = 'score-value';
      scoreCell.textContent = String(entry.score).padStart(3, '0');

      if (isCurrentPlayer) {
        row.classList.add('is-current-player');
        const badge = document.createElement('span');
        badge.className = 'current-player-badge';
        badge.textContent = 'TÚ';
        playerCell.append(badge);
      }

      row.append(positionCell, playerCell, scoreCell);
      scoresTableBody.append(row);
    });

    scoresStatus.hidden = true;
    scoresTableWrap.hidden = false;
  } catch (error) {
    if (requestId !== leaderboardRequest) return;
    scoresStatus.dataset.state = 'error';
    scoresStatus.textContent = 'No se pudieron cargar las puntuaciones. Comprueba la conexión e inténtalo de nuevo.';
    console.warn('No se pudo cargar el leaderboard:', error.message);
  } finally {
    // Sólo la consulta más reciente puede reactivar el botón de actualización.
    if (requestId === leaderboardRequest) {
      scoresTableWrap.setAttribute('aria-busy', 'false');
      scoresRefreshButton.disabled = false;
    }
  }
}

// Normaliza el nombre para resaltar coincidencias sin distinguir mayúsculas o espacios externos.
function normalizePlayerName(name) {
  return typeof name === 'string' ? name.trim().normalize('NFKC').toLocaleLowerCase('es') : '';
}

// Alinea el marcador con la ilustración del fondo y recalcula al cambiar el tamaño de ventana.
function updateScoreboardPosition() {
  // Escala el fondo para cubrir la pantalla y calcula cuánto se recorta horizontalmente.
  const scale = Math.max(
    window.innerWidth / backgroundSize.width,
    window.innerHeight / backgroundSize.height,
  );
  const horizontalCrop = (backgroundSize.width * scale - window.innerWidth) / 2;
  const panel = {
    left: 1215,
    top: 114,
    width: 355,
    height: 215,
  };

  gameScreen.style.setProperty('--score-panel-left', `${panel.left * scale - horizontalCrop}px`);
  gameScreen.style.setProperty('--score-panel-top', `${panel.top * scale}px`);
  gameScreen.style.setProperty('--score-panel-width', `${panel.width * scale}px`);
  gameScreen.style.setProperty('--score-panel-height', `${panel.height * scale}px`);
}

// Detiene la partida, indica el resultado y envía la puntuación al servidor.
function finishGame(won) {
  if (gamePhase === 'over') return;

  clearInterval(gameTimer);
  gameTimer = null;
  gamePhase = 'over';
  if (!won && snake.length > 0) {
    getCell(snake[0].row, snake[0].column).classList.add('snake-head-dead');
  }
  const resultMessage = won ? '¡Has completado el mapa!' : 'Fin de la partida.';
  gameMessage.textContent = `${resultMessage} Guardando puntuación...`;
  updateGameControls();
  void saveScore(score, gameNumber, resultMessage);
}

// Guarda el resultado y actualiza el mensaje según la respuesta del servidor.
async function saveScore(finalScore, finishedGame, resultMessage) {
  try {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: playerName, score: finalScore }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `La API respondió con HTTP ${response.status}.`);
    }

    // Una respuesta tardía no debe cambiar el mensaje de una partida posterior.
    if (finishedGame === gameNumber && gamePhase === 'over') {
      gameMessage.textContent = `${resultMessage} Puntuación guardada.`;
    }
  } catch (error) {
    console.warn('No se pudo guardar la puntuación:', error.message);
    if (finishedGame === gameNumber && gamePhase === 'over') {
      gameMessage.textContent = `${resultMessage} No se pudo guardar la puntuación.`;
    }
  }
}

// Sincroniza el mensaje y el texto/estado del botón con la fase de juego actual.
function updateGameControls() {
  const messages = {
    idle: 'Pulsa empezar para preparar la partida.',
    ready: 'Usa las flechas o WASD para comenzar a moverte.',
    running: 'Flechas o WASD para girar. Espacio para pausar.',
    paused: 'Partida en pausa. Pulsa continuar para seguir.',
    over: gameMessage.textContent,
  };
  gameMessage.textContent = messages[gamePhase];
  startButton.textContent = {
    idle: 'Empezar a jugar',
    ready: 'Esperando dirección',
    running: 'Pausar',
    paused: 'Continuar',
    over: 'Jugar de nuevo',
  }[gamePhase];
  startButton.disabled = gamePhase === 'ready';
}