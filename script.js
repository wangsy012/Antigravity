// --- 常數設定 ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // 每個方塊的像素大小
const PREVIEW_BLOCK_SIZE = 24;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

// --- 顏色定義 (淺色主題下的明亮配色) ---
const COLORS = [
    null,
    '#00bcd4', // I - Cyan
    '#2196f3', // J - Blue
    '#ff9800', // L - Orange
    '#ffeb3b', // O - Yellow
    '#4caf50', // S - Green
    '#9c27b0', // T - Purple
    '#f44336'  // Z - Red
];

// --- 方塊形狀定義 ---
const SHAPES = [
    [],
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], // I
    [[2,0,0], [2,2,2], [0,0,0]], // J
    [[0,0,3], [3,3,3], [0,0,0]], // L
    [[4,4], [4,4]], // O
    [[0,5,5], [5,5,0], [0,0,0]], // S
    [[0,6,0], [6,6,6], [0,0,0]], // T
    [[7,7,0], [0,7,7], [0,0,0]]  // Z
];

// --- 音效系統 (Web Audio API) ---
class SoundSystem {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    playTone(freq, type, duration, vol=0.1) {
        if(this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    
    move() { this.playTone(300, 'sine', 0.1, 0.05); }
    rotate() { this.playTone(600, 'triangle', 0.1, 0.05); }
    drop() { this.playTone(150, 'square', 0.15, 0.05); }
    clear() {
        this.playTone(400, 'sine', 0.3, 0.1);
        setTimeout(() => this.playTone(600, 'sine', 0.4, 0.1), 100);
        setTimeout(() => this.playTone(800, 'sine', 0.5, 0.1), 200);
    }
    gameover() {
        this.playTone(200, 'sawtooth', 0.5, 0.1);
        setTimeout(() => this.playTone(150, 'sawtooth', 0.8, 0.1), 300);
    }
}

const sound = new SoundSystem();

// --- 遊戲狀態變數 ---
let board = [];
let piece = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let animationId = null;
let isGameOver = false;
let isPaused = false;

// --- DOM 元素 ---
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const startBtn = document.getElementById('startBtn');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');

// --- 初始化網格 ---
function createBoard() {
    return Array.from({length: ROWS}, () => Array(COLS).fill(0));
}

// --- 方塊類別 ---
class Piece {
    constructor(type) {
        this.type = type;
        this.matrix = SHAPES[type];
        this.x = Math.floor(COLS / 2) - Math.floor(this.matrix[0].length / 2);
        this.y = 0;
    }
}

// --- 輔助函式：產生隨機方塊 ---
function randomPiece() {
    const type = Math.floor(Math.random() * 7) + 1;
    return new Piece(type);
}

// --- 繪製 ---
function drawBlock(ctx, x, y, colorId, size) {
    if(colorId === 0) return;
    
    const color = COLORS[colorId];
    ctx.fillStyle = color;
    ctx.fillRect(x * size, y * size, size, size);
    
    // 繪製邊框及亮點以增加立體感
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x * size, y * size + size);
    ctx.lineTo(x * size, y * size);
    ctx.lineTo(x * size + size, y * size);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(x * size + size, y * size);
    ctx.lineTo(x * size + size, y * size + size);
    ctx.lineTo(x * size, y * size + size);
    ctx.stroke();
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 繪製網格線
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for(let i=0; i<=COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i*BLOCK_SIZE, 0); ctx.lineTo(i*BLOCK_SIZE, canvas.height); ctx.stroke();
    }
    for(let i=0; i<=ROWS; i++) {
        ctx.beginPath(); ctx.moveTo(0, i*BLOCK_SIZE); ctx.lineTo(canvas.width, i*BLOCK_SIZE); ctx.stroke();
    }
    
    // 繪製固定方塊
    board.forEach((row, y) => {
        row.forEach((value, x) => {
            if(value > 0) drawBlock(ctx, x, y, value, BLOCK_SIZE);
        });
    });
    
    // 繪製預測落點 (Ghost Piece)
    if(piece && !isGameOver) {
        let ghostY = piece.y;
        while(!collide(board, {x: piece.x, y: ghostY+1, matrix: piece.matrix})) {
            ghostY++;
        }
        ctx.globalAlpha = 0.2;
        piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if(value > 0) drawBlock(ctx, piece.x + x, ghostY + y, value, BLOCK_SIZE);
            });
        });
        ctx.globalAlpha = 1.0;
    }
    
    // 繪製目前方塊
    if(piece) {
        piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if(value > 0) drawBlock(ctx, piece.x + x, piece.y + y, value, BLOCK_SIZE);
            });
        });
    }
}

function drawPreview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    if(nextPiece) {
        const matrix = nextPiece.matrix;
        const offsetX = (previewCanvas.width / PREVIEW_BLOCK_SIZE - matrix[0].length) / 2;
        const offsetY = (previewCanvas.height / PREVIEW_BLOCK_SIZE - matrix.length) / 2;
        
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if(value > 0) {
                    drawBlock(previewCtx, offsetX + x, offsetY + y, value, PREVIEW_BLOCK_SIZE);
                }
            });
        });
    }
}

// --- 碰撞偵測 ---
function collide(board, piece) {
    const m = piece.matrix;
    for(let y=0; y<m.length; y++) {
        for(let x=0; x<m[y].length; x++) {
            if(m[y][x] !== 0) {
                const boardX = piece.x + x;
                const boardY = piece.y + y;
                if(boardX < 0 || boardX >= COLS || boardY >= ROWS || (boardY >= 0 && board[boardY][boardX] !== 0)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// --- 矩陣旋轉 ---
function rotateMatrix(matrix, dir) {
    const newMatrix = [];
    for(let i=0; i<matrix[0].length; i++) {
        newMatrix[i] = [];
        for(let j=0; j<matrix.length; j++) {
            if(dir > 0) { // 順時針
                newMatrix[i][j] = matrix[matrix.length - 1 - j][i];
            } else { // 逆時針
                newMatrix[i][j] = matrix[j][matrix[0].length - 1 - i];
            }
        }
    }
    return newMatrix;
}

// --- 遊戲邏輯 ---
function merge() {
    piece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if(value !== 0 && piece.y + y >= 0) {
                board[piece.y + y][piece.x + x] = value;
            }
        });
    });
}

function clearLines() {
    let linesCleared = 0;
    outer: for(let y = ROWS - 1; y >= 0; y--) {
        for(let x = 0; x < COLS; x++) {
            if(board[y][x] === 0) continue outer;
        }
        
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        y++;
        linesCleared++;
    }
    
    if(linesCleared > 0) {
        sound.clear();
        lines += linesCleared;
        linesEl.innerText = lines;
        
        // 計分規則
        const points = [0, 100, 300, 500, 800];
        score += points[linesCleared] * level;
        scoreEl.innerText = score;
        
        // 升級
        if(lines >= level * 10) {
            level++;
            levelEl.innerText = level;
            dropInterval = Math.max(100, 1000 - (level - 1) * 100);
        }
    }
}

function resetPiece() {
    if(!nextPiece) nextPiece = randomPiece();
    piece = nextPiece;
    nextPiece = randomPiece();
    drawPreview();
    
    if(collide(board, piece)) {
        gameOver();
    }
}

function gameOver() {
    isGameOver = true;
    sound.gameover();
    cancelAnimationFrame(animationId);
    finalScoreEl.innerText = score;
    gameOverModal.classList.remove('hidden');
}

function update(time = 0) {
    if(isGameOver || isPaused) return;
    
    const deltaTime = time - lastTime;
    lastTime = time;
    
    dropCounter += deltaTime;
    if(dropCounter > dropInterval) {
        drop();
    }
    
    drawBoard();
    animationId = requestAnimationFrame(update);
}

function drop() {
    piece.y++;
    if(collide(board, piece)) {
        piece.y--;
        merge();
        clearLines();
        resetPiece();
    } else {
        dropCounter = 0; // 重置計時器，避免手動下落後馬上又自動下落
    }
}

function hardDrop() {
    while(!collide(board, piece)) {
        piece.y++;
    }
    piece.y--;
    merge();
    sound.drop();
    clearLines();
    resetPiece();
    dropCounter = 0;
}

// --- 控制 ---
document.addEventListener('keydown', event => {
    if(isGameOver || isPaused) return;
    
    switch(event.code) {
        case 'ArrowLeft':
            piece.x--;
            if(collide(board, piece)) piece.x++;
            else sound.move();
            break;
        case 'ArrowRight':
            piece.x++;
            if(collide(board, piece)) piece.x--;
            else sound.move();
            break;
        case 'ArrowDown':
            drop();
            sound.move();
            break;
        case 'ArrowUp':
        case 'KeyX':
            const m1 = piece.matrix;
            piece.matrix = rotateMatrix(piece.matrix, 1);
            if(collide(board, piece)) piece.matrix = m1;
            else sound.rotate();
            break;
        case 'KeyZ':
        case 'ControlLeft':
        case 'ControlRight':
            const m2 = piece.matrix;
            piece.matrix = rotateMatrix(piece.matrix, -1);
            if(collide(board, piece)) piece.matrix = m2;
            else sound.rotate();
            break;
        case 'Space':
            hardDrop();
            break;
    }
});

// 防止方向鍵與空白鍵捲動網頁
window.addEventListener('keydown', function(e) {
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code) > -1) {
        e.preventDefault();
    }
}, false);

// --- 流程控制 ---
function startGame() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    scoreEl.innerText = score;
    linesEl.innerText = lines;
    levelEl.innerText = level;
    isGameOver = false;
    isPaused = false;
    
    gameOverModal.classList.add('hidden');
    startBtn.innerText = '暫停 / 繼續';
    
    // 初始化 AudioContext (必須在使用者互動後)
    if(sound.ctx.state === 'suspended') sound.ctx.resume();
    
    resetPiece();
    lastTime = performance.now();
    cancelAnimationFrame(animationId);
    update();
}

startBtn.addEventListener('click', () => {
    if(isGameOver) {
        startGame();
    } else if(!piece) {
        startGame();
    } else {
        isPaused = !isPaused;
        if(!isPaused) {
            lastTime = performance.now();
            update();
        }
    }
});

restartBtn.addEventListener('click', startGame);

// 初次繪製空網格
drawBoard();
