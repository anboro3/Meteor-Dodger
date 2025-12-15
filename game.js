// Game.js

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

// --- 画像アセット ---
const imgSpaceship = new Image();
imgSpaceship.src = 'assets/spaceship.png';

const imgSpaceshipVillain = new Image();
imgSpaceshipVillain.src = 'assets/spaceship_villain.png';

const imgMeteor = new Image();
// ... (rest unchanged)
imgMeteor.src = 'assets/meteor.png';

const imgStar = new Image();
imgStar.src = 'assets/star.png';

const imgClock = new Image();
imgClock.src = 'assets/clock.png';

// --- 音声 (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (type === 'spawn') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === 'hit') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } else if (type === 'gameover') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 1.0);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.0);
  } else if (type === 'item') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(1800, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  }
}


// --- ゲームの状態管理 ---
let isGameOver = false;
let score = 0;
let destroyedCount = 0;

// 難易度管理
let currentDifficulty = 'easy';
let meteorSpeedScale = 0.6;
let isProgressive = false;

// ハイスコア
function getHighScore(diff) {
  return parseInt(localStorage.getItem('meteorHighscore_' + diff)) || 0;
}
function setHighScore(diff, val) {
  localStorage.setItem('meteorHighscore_' + diff, val);
}
let highScore = getHighScore(currentDifficulty);

// 設定
let playerSpeedScale = 0.7;

// 効果時間の管理
let invincibleEndTime = 0;
let slowDownEndTime = 0;

// --- スキン管理 ---
let isVillainUnlocked = localStorage.getItem('meteor_skin_villain_unlocked') === 'true';
let currentSkin = localStorage.getItem('meteor_current_skin') || 'standard';

const skinSelect = document.getElementById('skinSelect');
if (skinSelect) {
  // Init UI status
  if (isVillainUnlocked) {
    skinSelect.options[1].disabled = false;
    skinSelect.options[1].text = "Villain (Red)";
  } else {
    skinSelect.options[1].text = "Villain (Red) 🔒 (Get 20,000pts)";
  }
  skinSelect.value = currentSkin;

  skinSelect.addEventListener('change', (e) => {
    currentSkin = e.target.value;
    localStorage.setItem('meteor_current_skin', currentSkin);
    /* if (!isGameRunning) draw(); // Optional preview */
  });
}

// --- 設定UIのイベントリスナー ---
const diffRadios = document.getElementsByName('difficulty');
for (let i = 0; i < diffRadios.length; i++) {
  diffRadios[i].addEventListener('change', function (e) {
    currentDifficulty = e.target.value;
    isProgressive = (currentDifficulty === 'progressive');

    if (currentDifficulty === 'easy') {
      meteorSpeedScale = 0.6;
    } else if (currentDifficulty === 'normal') {
      meteorSpeedScale = 0.8;
    } else if (currentDifficulty === 'hard') {
      meteorSpeedScale = 1.0;
    } else if (isProgressive) {
      meteorSpeedScale = 0.7; // 開始時は0.7 (EasyとNormalの間くらい)
    }

    highScore = getHighScore(currentDifficulty);
    resetGame();
    this.blur();
  });
}

const playerRange = document.getElementById('playerSpeedRange');
const playerVal = document.getElementById('playerSpeedVal');
if (playerRange) {
  playerRange.addEventListener('input', function (e) {
    playerSpeedScale = parseFloat(e.target.value);
    playerVal.textContent = playerSpeedScale.toFixed(1);
  });
}

// --- プレイヤー ---
let player = {
  x: SCREEN_WIDTH / 2 - 25,
  y: SCREEN_HEIGHT - 80,
  width: 50,
  height: 50,
  speed: 5
};

// --- オブジェクト ---
let meteors = [];
let items = [];

// --- 背景（星） ---
const stars = [];
for (let i = 0; i < 100; i++) {
  stars.push({
    x: Math.random() * SCREEN_WIDTH,
    y: Math.random() * SCREEN_HEIGHT,
    size: Math.random() * 2,
    speed: Math.random() * 0.5 + 0.1
  });
}

// --- 操作入力 (Input Handling) ---
const keys = {};
let isTouchLeft = false;
let isTouchRight = false;

window.addEventListener('keydown', function (e) {
  keys[e.key] = true;
  keys[e.code] = true; // Support both
  // Prevent scrolling with arrows/space
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.code) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key)) {
    e.preventDefault();
  }
  if (isGameOver && (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter')) resetGame();
});

window.addEventListener('keyup', function (e) {
  keys[e.key] = false;
  keys[e.code] = false;
});

// Touch Controls
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');

if (btnLeft && btnRight) {
  const handleLeftDown = (e) => { if (e.cancelable) e.preventDefault(); isTouchLeft = true; };
  const handleLeftUp = (e) => { if (e.cancelable) e.preventDefault(); isTouchLeft = false; };
  const handleRightDown = (e) => { if (e.cancelable) e.preventDefault(); isTouchRight = true; };
  const handleRightUp = (e) => { if (e.cancelable) e.preventDefault(); isTouchRight = false; };

  btnLeft.addEventListener('mousedown', handleLeftDown);
  btnLeft.addEventListener('touchstart', handleLeftDown, { passive: false });
  btnLeft.addEventListener('mouseup', handleLeftUp);
  btnLeft.addEventListener('touchend', handleLeftUp, { passive: false });
  btnLeft.addEventListener('mouseleave', handleLeftUp);

  btnRight.addEventListener('mousedown', handleRightDown);
  btnRight.addEventListener('touchstart', handleRightDown, { passive: false });
  btnRight.addEventListener('mouseup', handleRightUp);
  btnRight.addEventListener('touchend', handleRightUp, { passive: false });
  btnRight.addEventListener('mouseleave', handleRightUp);
}

function resetGame() {
  isGameOver = false;
  score = 0;
  destroyedCount = 0;
  meteors = [];
  items = [];
  invincibleEndTime = 0;
  slowDownEndTime = 0;
  player.x = SCREEN_WIDTH / 2 - 25;
  highScore = getHighScore(currentDifficulty);

  if (isProgressive) {
    meteorSpeedScale = 0.7;
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function update() {
  const now = Date.now();

  // 背景アニメ
  for (let s of stars) {
    s.y += s.speed;
    if (s.y > SCREEN_HEIGHT) {
      s.y = 0;
      s.x = Math.random() * SCREEN_WIDTH;
    }
  }

  if (isGameOver) return;

  score++;

  // プログレッシブ難易度
  if (isProgressive) {
    // 500フレームごとに0.05ずつ加速 (上限3.0)
    let bonusSpeed = Math.floor(score / 500) * 0.05;
    meteorSpeedScale = 0.7 + bonusSpeed;
    if (meteorSpeedScale > 3.0) meteorSpeedScale = 3.0;
  }

  // Player Movement
  let moveSpeed = player.speed * playerSpeedScale;

  if (keys['ArrowLeft'] || keys['Left'] || keys['a'] || isTouchLeft) {
    player.x -= moveSpeed;
  }
  if (keys['ArrowRight'] || keys['Right'] || keys['d'] || isTouchRight) {
    player.x += moveSpeed;
  }

  // Boundary Check
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > SCREEN_WIDTH) player.x = SCREEN_WIDTH - player.width;

  // 隕石生成
  // 800px時代の密度(0.02)の1.5倍相当にする計算
  // 400px換算で等倍なら0.01、その1.3倍で0.013
  if (Math.random() < 0.013) {
    meteors.push({
      x: Math.random() * (SCREEN_WIDTH - 30),
      y: -30,
      width: 30, // 画像サイズに合わせるなら調整
      height: 30,
      speed: 3 + Math.random() * 5,
    });
    playSound('spawn');
  }

  // アイテム生成: 約30秒に1回 (0.0006)
  if (Math.random() < 0.0006) {
    // 確率: TIME(75%), Invincible(25%)
    let type = Math.random() < 0.25 ? 'invincible' : 'slow';

    items.push({
      x: Math.random() * (SCREEN_WIDTH - 30),
      y: -30,
      width: 30,
      height: 30,
      speed: 1.5,
      type: type
    });
  }

  let isSlow = now < slowDownEndTime;
  let isInvincible = now < invincibleEndTime;

  // 隕石更新
  for (let i = 0; i < meteors.length; i++) {
    let m = meteors[i];
    let moveSpeed = m.speed * meteorSpeedScale;
    if (isSlow) moveSpeed *= 0.5;
    m.y += moveSpeed;

    // 当たり判定 (Hitbox Adjustment)
    // 画像の見た目より少し小さく判定することで、理不尽な衝突を防ぐ
    let pPad = 10; // プレイヤーの判定を上下左右10px縮小
    let mPad = 0;  // 隕石は四角い画像になったので、判定を実際のサイズに合わせる

    if (
      player.x + pPad < m.x + m.width - mPad &&
      player.x + player.width - pPad > m.x + mPad &&
      player.y + pPad < m.y + m.height - mPad &&
      player.y + player.height - pPad > m.y + mPad
    ) {
      if (isInvincible) {
        playSound('hit');
        // score += 100; // ここで加算せず、表示のときに計算する（内訳を明確にするため）
        destroyedCount++;
        meteors.splice(i, 1);
        i--;
        continue;
      } else {
        // 即死
        isGameOver = true;
        playSound('hit');
        playSound('gameover');

        let currentFinalScore = score + (destroyedCount * 100);

        // ハイスコア更新チェック
        if (currentFinalScore > parseInt(highScore)) {
          highScore = currentFinalScore;
          setHighScore(currentDifficulty, highScore);
        }

        // スキン解放チェック (20,000点)
        if (currentFinalScore >= 20000 && !isVillainUnlocked) {
          isVillainUnlocked = true;
          localStorage.setItem('meteor_skin_villain_unlocked', 'true');
          if (skinSelect) {
            skinSelect.options[1].disabled = false;
            skinSelect.options[1].text = "Villain (Red)";
          }
        }
      }
    }

    if (m.y > SCREEN_HEIGHT) {
      meteors.splice(i, 1);
      i--;
    }
  }

  // アイテム更新
  for (let i = 0; i < items.length; i++) {
    let item = items[i];
    item.y += item.speed;

    // アイテムは取得しやすいように判定大きめ（そのまま）でOK、または少し緩くする
    // ここではそのまま
    if (
      player.x < item.x + item.width &&
      player.x + player.width > item.x &&
      player.y < item.y + item.height &&
      player.y + player.height > item.y
    ) {
      playSound('item');
      if (item.type === 'invincible') {
        invincibleEndTime = Date.now() + 5000;
      } else if (item.type === 'slow') {
        slowDownEndTime = Date.now() + 5000;
      }
      items.splice(i, 1);
      i--;
      continue;
    }

    if (item.y > SCREEN_HEIGHT) {
      items.splice(i, 1);
      i--;
    }
  }
}

function draw() {
  // 背景描画
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  ctx.fillStyle = 'white';
  for (let s of stars) {
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }

  const now = Date.now();

  // プレイヤー描画
  if (Math.floor(now / 100) % 2 === 0 || now >= invincibleEndTime) {
    let shipImg = (currentSkin === 'villain') ? imgSpaceshipVillain : imgSpaceship;
    ctx.drawImage(shipImg, player.x, player.y, player.width, player.height);
  }

  if (now < invincibleEndTime) {
    // 無敵エフェクト（オーラ）
    ctx.strokeStyle = 'gold';
    ctx.lineWidth = 3;
    ctx.strokeRect(player.x - 5, player.y - 5, player.width + 10, player.height + 10);
  }

  // 隕石描画
  for (let m of meteors) {
    ctx.drawImage(imgMeteor, m.x, m.y, m.width, m.height);
  }

  // アイテム描画
  for (let item of items) {
    let img = null;
    let label = '';
    if (item.type === 'invincible') { img = imgStar; label = '★'; }
    else if (item.type === 'slow') { img = imgClock; label = 'TIME'; }

    if (img) {
      ctx.drawImage(img, item.x, item.y, item.width, item.height);
    } else {
      ctx.fillStyle = 'white';
      ctx.fillRect(item.x, item.y, item.width, item.height);
    }
  }

  // UI描画
  let currentTotalScore = score + (destroyedCount * 100);

  ctx.fillStyle = 'white';
  ctx.font = '20px sans-serif';
  ctx.fillText('Score: ' + currentTotalScore, 20, 30);
  let diffLabel = currentDifficulty.toUpperCase();
  if (isProgressive) diffLabel = "PROG (x" + meteorSpeedScale.toFixed(2) + ")";
  ctx.fillText('High Score (' + diffLabel + '): ' + highScore, 20, 60);

  // Destroyed Count
  ctx.fillStyle = 'white';
  ctx.fillText('Destroyed meteorite: ' + destroyedCount, 20, 90);

  // Effect Timers
  if (now < invincibleEndTime) {
    ctx.fillStyle = 'gold';
    let remaining = Math.ceil((invincibleEndTime - now) / 1000);
    ctx.fillText('INVINCIBLE: ' + remaining, 20, 120);
  }
  if (now < slowDownEndTime) {
    ctx.fillStyle = 'cyan';
    let remaining = Math.ceil((slowDownEndTime - now) / 1000);
    ctx.fillText('SLOW MOTION: ' + remaining, 20, 150);
  }

  if (isGameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    let bonus = destroyedCount * 100;
    let finalScore = score + bonus;

    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20);

    ctx.font = '24px sans-serif';
    ctx.fillText('Base Score: ' + score, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 30);
    ctx.fillStyle = 'gold';
    ctx.fillText('Bonus (+100 x ' + destroyedCount + '): +' + bonus, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 60);

    ctx.fillStyle = 'white';
    ctx.font = '32px sans-serif';
    ctx.fillText('Final Score: ' + finalScore, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 100);

    if (finalScore >= highScore && finalScore > 0) {
      ctx.fillStyle = 'yellow';
      ctx.font = '24px sans-serif';
      ctx.fillText('NEW HIGH SCORE!', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 140);
      ctx.fillStyle = 'white';
    } else if (finalScore >= 20000 && currentSkin !== 'villain') {
      // Show unlock message if high score enough and not using it yet
      ctx.fillStyle = '#ff5555';
      ctx.font = '20px sans-serif';
      ctx.fillText('SKIN UNLOCKED! Check Settings', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 140);
    }

    ctx.fillText('Press SPACE or ENTER to Restart', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 180);
    ctx.textAlign = 'start';
  }
}

// --- Start Screen Logic ---
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
let isGameRunning = false;

if (startBtn) {
  startBtn.addEventListener('click', () => {
    startGame();
  });
}

function startGame() {
  if (isGameRunning) return;
  startScreen.style.display = 'none';
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  isGameRunning = true;
  resetGame();
  gameLoop();
}

// Delete initial gameLoop() call, wait for button
// gameLoop();
