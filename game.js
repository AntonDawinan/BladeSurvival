// Game elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const retryBtn = document.getElementById('retryBtn');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const waveEl = document.getElementById('wave');
const healthBar = document.getElementById('healthBar');
const gameOverContainer = document.querySelector('.game-over-container');
const finalScoreEl = document.getElementById('finalScore');
const highScoreNotification = document.getElementById('highScoreNotification');
const pauseOverlay = document.getElementById('pauseOverlay');
const survivalTimeEl = document.createElement('div'); // New survival time element
const performanceStatsEl = document.createElement('div'); // New performance stats element
const mainMenu = document.getElementById('mainMenu');
const startGameBtn = document.getElementById('startGameBtn');
const toggleMusicBtn = document.getElementById('toggleMusicBtn');
const gameContainer = document.getElementById('gameContainer');

// Game state
let player, enemies, keys, mouse, isAttacking, score, gameOver, spawnInterval, wave, particles;
let highScore = localStorage.getItem('highScore') || 0;
let playerHealth = 100;
let lastAttackTime = 0;
const attackDelay = 300;
let shakeIntensity = 0;
let gamePaused = false;
let touchJoystick = { x: 0, y: 0, active: false };
let swordAngle = 0;
let isSwinging = false;
let swingDirection = 1;
let swordLength = 65;
let maxStamina = 100;
let currentStamina = maxStamina;
let staminaRegenRate = 0.5; // Stamina per frame
let staminaDrainRate = 2; // Stamina per attack
let lastStaminaUse = 0;
let staminaRegenDelay = 1000; // ms before regen starts after use

// Performance tracking
let startTime = 0;
let survivalTime = 0;
let lastFPSCheck = 0;
let frameCount = 0;
let currentFPS = 0;
let cpuUsage = 0;
let memoryUsage = 0;
let performanceCheckInterval;
let performanceEntries = [];
const particlePool = [];
const MAX_PARTICLES = 200;

// Inventory
let inventoryOpen = false;
const inventoryItems = Array(6).fill(null);
const inventoryElement = document.createElement('div');
inventoryElement.id = 'inventory';
inventoryElement.className = 'inventory-container';
inventoryElement.innerHTML = `
  <div class="inventory-header">Inventory (Press E to close)</div>
  <div class="inventory-slots">
    ${Array(6).fill().map((_,i) => `<div class="inventory-slot" data-slot="${i}"></div>`).join('')}
  </div>
`;
document.body.appendChild(inventoryElement);
const inventorySlots = Array.from(inventoryElement.querySelectorAll('.inventory-slot'));

// Setup performance stats element
performanceStatsEl.id = 'performanceStats';
performanceStatsEl.innerHTML = `
  <div>FPS: <span id="fpsCounter">0</span></div>
  <div>CPU: <span id="cpuUsage">0%</span></div>
  <div>RAM: <span id="memoryUsage">0MB</span></div>
`;
document.body.appendChild(performanceStatsEl);

// Setup survival time element
survivalTimeEl.id = 'survivalTime';
document.body.appendChild(survivalTimeEl);

const powerups = {
    'Health Potion': { 
      use: () => { 
        playerHealth = Math.min(100, playerHealth + 30);
        healthBar.style.width = `${playerHealth}%`;
        createParticles(player.x, player.y, 'lime', 20);
        powerupSound.currentTime = 0;
        powerupSound.play();
        return true;
      },
      color: '#00FF00'
    },
    'Sword Upgrade': { 
      use: () => { 
        const originalLength = swordLength;
        swordLength = 90;
        powerupSound.currentTime = 0;
        powerupSound.play();
        createParticles(player.x, player.y, 'gold', 30);
        setTimeout(() => {
          swordLength = originalLength;
          createParticles(player.x, player.y, 'gold', 15);
        }, 10000);
        return true;
      },
      color: '#FFD700'
    },
    'Armor': { 
      use: () => { 
        // Clear any existing armor first
        if (player.armorTimeout) {
            clearTimeout(player.armorTimeout);
            player.damageReduction = 1.0; // Reset to normal
        }
        
        player.damageReduction = 0.4; // Reduces damage to 40% (60% reduction)
        powerupSound.currentTime = 0;
        powerupSound.play();
        createParticles(player.x, player.y, 'cyan', 25);
        
        player.armorTimeout = setTimeout(() => {
            player.damageReduction = 1.0; // Back to normal
            createParticles(player.x, player.y, 'cyan', 10);
            player.armorTimeout = null;
        }, 7000);
        
        return true;
      },
      color: '#00FFFF'
    }
,
    'Time Freeze': {
  use: () => {
    powerupSound.currentTime = 0;
    powerupSound.play();
    enemies.forEach(e => {
      e.frozen = true;
      e.frozenTime = Date.now();
      e.originalSpeed = e.speed;
      e.speed = 0;
      // Make frozen enemies vulnerable by changing their color
      e.color = '#8888FF'; // Light blue color for frozen enemies
    });
    createParticles(player.x, player.y, 'lightblue', 40);
    setTimeout(() => {
      enemies.forEach(e => {
        if (Date.now() - e.frozenTime >= 3000) {
          e.frozen = false;
          e.speed = e.originalSpeed;
          // Restore original color
          if (e.type === 'normal') e.color = 'red';
          else if (e.type === 'fast') e.color = '#f0f';
          else if (e.type === 'tank') e.color = '#800';
          else if (e.type === 'splitter') e.color = '#0f0';
          else if (e.type === 'bomber') e.color = '#FF8C00';
        }
      });
    }, 3000);
    return true;
  },
  color: '#ADD8E6'
}
};


// Audio
const swingSound = new Audio('swing.mp3');
const hitSound = new Audio('hit.mp3');
const gameOverSound = new Audio('gameover.mp3');
const powerupSound = new Audio('powerups.mp3');
const explosionSound = new Audio('explosion.mp3');

// Initialize audio
function initAudio() {
    swingSound.volume = 0.3;
    hitSound.volume = 0.2;
    gameOverSound.volume = 0.5;
    powerupSound.volume = 0.4;
    explosionSound.volume = 0.3;
    [swingSound, hitSound, gameOverSound, powerupSound, explosionSound].forEach(s => {
        s.load();
        s.play().then(() => s.pause());
    });
}

// Setup canvas
function setupCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.offscreen = document.createElement('canvas');
    canvas.offscreen.width = canvas.width;
    canvas.offscreen.height = canvas.height;
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.offscreen.width = canvas.width;
        canvas.offscreen.height = canvas.height;
    });
}

// Initialize game
function initGame() {
    player = { 
        x: canvas.width / 2, 
        y: canvas.height / 2, 
        size: 20, 
        speed: 5.5,
        invulnerable: false,
        damageReduction: 1.0,
        armorTimeout: null, // Add this line
        trail: [],
        baseHealth: 120,
        maxHealth: 120,
        invulnerable: false,
        invulnerableTimer: 0,
        invulnerableDuration: 800, // 800ms of invulnerability
        damageReduction: 1.0,
        armorTimeout: null
    };
    playerHealth = player.maxHealth;
    healthBar.style.width = '100%';
    enemies = [];
    particles = [];
    keys = {};
    mouse = { x: player.x, y: player.y };
    isAttacking = false;
    score = 0;
    wave = 1;
    playerHealth = 100;
    gameOver = false;
    shakeIntensity = 0;
    gamePaused = false;
    swordAngle = 0;
    isSwinging = false;
    swordLength = 65;
    
    // Performance tracking
    startTime = Date.now();
    survivalTime = 0;
    performanceEntries = [];
    
    // Clear inventory
    inventoryItems.fill(null);
    updateInventoryUI();
    
    updateUI();
    clearInterval(spawnInterval);
    spawnInterval = setInterval(spawnEnemy, 1000);
    
    // Start performance monitoring
    if (window.performance && performance.memory) {
        performanceCheckInterval = setInterval(monitorPerformance, 1000);

        currentStamina = maxStamina;
        document.getElementById('staminaBar').style.width = '100%';
  
    }
}

// Performance monitoring
function monitorPerformance() {
    // Calculate FPS
    currentFPS = Math.round(frameCount / ((Date.now() - lastFPSCheck) / 1000));
    frameCount = 0;
    lastFPSCheck = Date.now();
    
    // Get memory usage (Chrome only)
    if (performance.memory) {
        memoryUsage = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
    }
    
    // Simple CPU usage estimation
    const now = Date.now();
    const timeDiff = now - (performanceEntries[0]?.time || now);
    const idleDiff = timeDiff - (performanceEntries.reduce((sum, entry) => sum + entry.duration, 0));
    cpuUsage = Math.min(100, Math.round((timeDiff - idleDiff) / timeDiff * 100));
    
    // Store current performance data
    performanceEntries.push({
        time: now,
        duration: 16 // Approximate frame time
    });
    
    // Keep only recent entries (last 1 second)
    performanceEntries = performanceEntries.filter(entry => now - entry.time < 1000);
    
    // Update UI
    document.getElementById('fpsCounter').textContent = currentFPS;
    document.getElementById('cpuUsage').textContent = `${cpuUsage}%`;
    document.getElementById('memoryUsage').textContent = `${memoryUsage}MB`;
}

function updateSurvivalTime() {
    if (gameOver || gamePaused) return;
    
    survivalTime = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(survivalTime / 60);
    const seconds = survivalTime % 60;
    survivalTimeEl.textContent = `Survived: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Update UI elements
function updateUI() {
    scoreEl.textContent = `Score: ${score}`;
    waveEl.textContent = `Wave: ${wave}`;
    highScoreEl.textContent = `High Score: ${highScore}`;
    healthBar.style.width = `${playerHealth}%`;
    gameOverContainer.style.display = 'none';
    highScoreNotification.style.display = 'none';
    retryBtn.style.display = 'none';
    pauseOverlay.style.display = 'none';
    inventoryElement.style.display = 'none';
    performanceStatsEl.style.display = 'none';
}

// Setup event listeners
function setupEventListeners() {
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            gamePaused = !gamePaused;
            pauseOverlay.style.display = gamePaused ? 'flex' : 'none';
            inventoryElement.style.display = 'none';
            inventoryOpen = false;
        }
        if (e.key === 'e' || e.key === 'E') {
            inventoryOpen = !inventoryOpen;
            inventoryElement.style.display = inventoryOpen ? 'block' : 'none';
            gamePaused = inventoryOpen;
            pauseOverlay.style.display = 'none';
        }
        if (e.key === '`') { // Toggle performance stats
            performanceStatsEl.style.display = 
                performanceStatsEl.style.display === 'none' ? 'block' : 'none';
        }

        if (startGameBtn) {
            startGameBtn.addEventListener('click', startGame);
          }
          
          if (toggleMusicBtn) {
            toggleMusicBtn.addEventListener('click', function() {
              console.log('Music toggle would go here');
            });
          }

        keys[e.key] = true;
    });
    
    document.addEventListener('keyup', e => keys[e.key] = false);
    
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    
    canvas.addEventListener('mousedown', () => isAttacking = true);
    canvas.addEventListener('mouseup', () => isAttacking = false);
    
    document.querySelector('.touch-joystick').addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.querySelector('.touch-shoot').addEventListener('touchstart', () => isAttacking = true);
    document.querySelector('.touch-shoot').addEventListener('touchend', () => isAttacking = false);
    
    retryBtn.addEventListener('click', initGame);
}

function handleTouchStart(e) {
    touchJoystick.active = true;
    e.preventDefault();
}

function handleTouchMove(e) {
    if (touchJoystick.active) {
        const touch = e.touches[0];
        const joystick = document.querySelector('.touch-joystick');
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width/2;
        const centerY = rect.top + rect.height/2;
        
        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        const dist = Math.min(Math.hypot(dx, dy), 50);
        const angle = Math.atan2(dy, dx);
        
        touchJoystick.x = Math.cos(angle) * (dist / 50);
        touchJoystick.y = Math.sin(angle) * (dist / 50);
        e.preventDefault();
    }
}

function handleTouchEnd() {
    touchJoystick.active = false;
    touchJoystick.x = 0;
    touchJoystick.y = 0;
}

function swingSword() {
    const now = Date.now();
    if (now - lastAttackTime < attackDelay || currentStamina < staminaDrainRate) return;
    
    // Use stamina
    currentStamina = Math.max(0, currentStamina - staminaDrainRate);
    document.getElementById('staminaBar').style.width = `${(currentStamina/maxStamina)*100}%`;
    lastStaminaUse = now;
    
    // Rest of existing swing code...
    lastAttackTime = now;
    isSwinging = true;
    swingDirection = Math.random() > 0.5 ? 1 : -1;
    swordAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    
    swingSound.currentTime = 0;
    swingSound.play();
    
    setTimeout(() => {
        isSwinging = false;
    }, attackDelay);
}

function spawnEnemy() {
    if (gameOver || gamePaused) return;
    
    // Adjusted difficulty scaling
    const speedMultiplier = 1 + (wave * 0.03); // Reduced from 0.05
    const hpMultiplier = 1 + Math.floor(wave / 4); // Reduced from floor(wave/3)
    const spawnRate = Math.max(300, 1200 - wave * 40); // Slightly slower spawn rate increase
    
    if (Math.random() > 0.5) return;
    
    const edge = Math.floor(Math.random() * 4);
    let x, y;

    if (edge === 0) { x = 0; y = Math.random() * canvas.height; }
    else if (edge === 1) { x = canvas.width; y = Math.random() * canvas.height; }
    else if (edge === 2) { x = Math.random() * canvas.width; y = 0; }
    else { x = Math.random() * canvas.width; y = canvas.height; }

    const typeChance = Math.random();
    let type = 'normal';
    
    // Adjusted spawn probabilities
    if (wave > 5 && typeChance > 0.94) type = 'bomber';
    else if (wave > 4 && typeChance > 0.88) type = 'tank';
    else if (wave > 3 && typeChance > 0.75) type = 'fast';
    else if (wave > 2 && typeChance > 0.65) type = 'splitter';

    const props = {
        normal: { 
            size: 20, 
            speed: (1.2 + wave * 0.08) * speedMultiplier, // Reduced base speed
            hp: 1 * hpMultiplier, 
            color: 'red', 
            points: 1,
            frozen: false
        },
        fast: { 
            size: 15, 
            speed: (2.8 + wave * 0.12) * speedMultiplier, // Reduced base speed
            hp: 1 * hpMultiplier, 
            color: '#f0f', 
            points: 2,
            frozen: false
        },
        tank: { 
            size: 30, 
            speed: (0.7 + wave * 0.04) * speedMultiplier, // Reduced base speed
            hp: (2 + Math.floor(wave/4)) * hpMultiplier, // Reduced HP scaling
            color: '#800', 
            points: 5,
            frozen: false
        },
        splitter: { 
            size: 18, 
            speed: 1.8 * speedMultiplier, // Reduced base speed
            hp: 1 * hpMultiplier, 
            color: '#0f0', 
            points: 3,
            frozen: false
        },
        // In the enemy props section of spawnEnemy()
        bomber: { 
            size: 22, 
            speed: 1.6 * speedMultiplier,
            hp: 2 * hpMultiplier, 
            color: '#000000', // Pure black for bombers
            innerColor: '#FF8C00', // Orange inner circle
            points: 4,
            explode: true,
            frozen: false
        },
        mini: { 
            size: 12, 
            speed: 2.5,
            hp: 1, 
            color: '#0a0', 
            points: 0,
            frozen: false
        },
    }[type];

    enemies.push({ 
        x, 
        y, 
        ...props, 
        type, 
        lastHit: 0,
        originalSpeed: props.speed // Store original speed for time freeze
    });
}

function createParticles(x, y, color = 'orange', count = 15) {
    for (let i = 0; i < count; i++) {
        let particle;
        if (particlePool.length > 0) {
            particle = particlePool.pop();
            Object.assign(particle, {
                x, y,
                dx: (Math.random() - 0.5) * 6,
                dy: (Math.random() - 0.5) * 6,
                size: Math.random() * 3 + 2,
                life: 30 + Math.random() * 20,
                color,
                isText: false
            });
        } else if (particles.length < MAX_PARTICLES) {
            particle = {
                x, y,
                dx: (Math.random() - 0.5) * 6,
                dy: (Math.random() - 0.5) * 6,
                size: Math.random() * 3 + 2,
                life: 30 + Math.random() * 20,
                color,
                isText: false
            };
        } else {
            return; // Skip if we've reached max particles
        }
        particles.push(particle);
    }
}

function createScoreText(x, y, points) {
    particles.push({
        x, y,
        dx: 0,
        dy: -1,
        size: 20,
        life: 60,
        color: 'gold',
        text: `+${points}`,
        isText: true
    });
}

function update() {
    if (gameOver || gamePaused) return;

    updatePlayer();
    updateEnemies();
    updateParticles();
    reduceScreenShake();
    updateStamina();
    
    if (isSwinging) {
        swordAngle += swingDirection * 0.2;
        checkSwordCollision();
    } else if (isAttacking) {
        swingSword();
    } else {
        swordAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    }
}

function checkSwordCollision() {
    if (!isSwinging) return;

    const swordStartX = player.x;
    const swordStartY = player.y;
    const swordEndX = player.x + Math.cos(swordAngle) * swordLength;
    const swordEndY = player.y + Math.sin(swordAngle) * swordLength;

    // Check collision with each enemy (including frozen ones)
    enemies.forEach((e, ei) => {
        // Calculate distance from enemy to sword line
        const dist = pointToLineDistance(e.x, e.y, swordStartX, swordStartY, swordEndX, swordEndY);
        
        // More generous hit detection (sword width + enemy size)
        if (dist < (e.size + 15)) {
            handleSwordHit(e, ei);
        }
    });
}

function handleSwordHit(enemy, enemyIndex) {
    enemy.hp -= 1;
    enemy.lastHit = Date.now();
    
    if (enemy.hp <= 0) {
        // Special handling for bomber enemies
        if (enemy.type === 'bomber') {
            // Trigger explosion before removing
            createParticles(enemy.x, enemy.y, '#FF8C00', 30);
            explosionSound.currentTime = 0;
            explosionSound.play();
            
            // Damage player if nearby
            const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (distToPlayer < 100) { // Explosion radius
                const damage = 12 * (player.damageReduction || 1);
                playerHealth -= damage;
                healthBar.style.width = `${playerHealth}%`;
                shakeIntensity = 15;
                
                if (playerHealth <= 0) {
                    endGame();
                }
            }
        }
        
        enemies.splice(enemyIndex, 1);
        score += enemy.points;
        createScoreText(enemy.x, enemy.y, enemy.points);
        
        if (enemy.type === 'splitter') {
            spawnSplitterMinions(enemy.x, enemy.y);
        }
        
        hitSound.currentTime = 0;
        hitSound.play();
        createParticles(enemy.x, enemy.y, enemy.color);
        updateScore();

        // 30% chance to drop a random powerup
        if (Math.random() < 0.3) {
            const items = Object.keys(powerups);
            const randomItem = items[Math.floor(Math.random() * items.length)];
            addToInventory(randomItem);
        }
    }
}

function updateStamina() {
    const now = Date.now();
    
    // Only regen if not recently used and not at max
    if (currentStamina < maxStamina && now - lastStaminaUse > staminaRegenDelay) {
        currentStamina = Math.min(maxStamina, currentStamina + staminaRegenRate);
        document.getElementById('staminaBar').style.width = `${(currentStamina/maxStamina)*100}%`;
    }
}

function addToInventory(item) {
    const emptySlot = inventoryItems.findIndex(slot => slot === null);
    if (emptySlot !== -1) {
        inventoryItems[emptySlot] = item;
        inventorySlots[emptySlot].innerHTML = `<div class="item">${item}</div>`;
        return true;
    }
    return false;
}

function updatePlayer() {
    let moveX = 0, moveY = 0;
    if (keys['ArrowUp'] || keys['w']) moveY -= 1;
    if (keys['ArrowDown'] || keys['s']) moveY += 1;
    if (keys['ArrowLeft'] || keys['a']) moveX -= 1;
    if (keys['ArrowRight'] || keys['d']) moveX += 1;
    
    if (touchJoystick.active) {
        moveX += touchJoystick.x;
        moveY += touchJoystick.y;
    }
    
    if (moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
    }
    
    player.x += moveX * player.speed;
    player.y += moveY * player.speed;

    player.trail.push({x: player.x, y: player.y});
    if (player.trail.length > 10) player.trail.shift();

    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));
}

function useItem(slotIndex) {
    if (inventoryItems[slotIndex]) {
      const itemName = inventoryItems[slotIndex];
      if (powerups[itemName]) {
        powerups[itemName].use();
        inventoryItems[slotIndex] = null;
        inventorySlots[slotIndex].innerHTML = '';
        inventorySlots[slotIndex].onclick = null;
      }
    }
}

function updateEnemies() {
    enemies.forEach((e, i) => {
        if (e.frozen) return;
        
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.hypot(dx, dy);
        e.x += (dx / dist) * e.speed;
        e.y += (dy / dist) * e.speed;

        handleEnemyCollision(e);
    });
}

function handleEnemyCollision(e) {
    const dist = Math.hypot(player.x - e.x, player.y - e.y);
    const collisionDist = player.size + e.size;
    
    if (dist < collisionDist) {
        // Base damage values (normal damage without armor)
        const damageValues = {
            normal: 5,
            fast: 4,
            tank: 6, 
            splitter: 3,
            bomber: 10,
            mini: 2,
        };
        
        let damage = damageValues[e.type];
        
        // Apply distance factor (70-100% of damage)
        const proximityRatio = 1 - Math.min(1, dist / collisionDist);
        damage = Math.floor(damage * (0.7 + proximityRatio * 0.3));
        
        // Apply armor reduction if active
        if (player.damageReduction < 1.0) {
            damage = Math.max(1, Math.floor(damage * player.damageReduction));
        }
        
        if (e.explode) {
            // Bomber explosion (always full damage, then reduced by armor)
            createParticles(e.x, e.y, '#FF8C00', 30);
            playerHealth -= damage;
            shakeIntensity = 15;
            enemies.splice(enemies.indexOf(e), 1);
            explosionSound.currentTime = 0;
            explosionSound.play();
        } else {
            // Normal collision
            playerHealth -= damage;
            shakeIntensity = 8 + damage * 2;
        }
        
        healthBar.style.width = `${playerHealth}%`;
        
        // Brief invulnerability only when not armored
        if (player.damageReduction >= 1.0) {
            player.invulnerable = true;
            if (player.invulnTimeout) clearTimeout(player.invulnTimeout);
            player.invulnTimeout = setTimeout(() => {
                player.invulnerable = false;
            }, 800);
        }
        
        createParticles(e.x, e.y, 'white', 10 + damage * 2);
        
        if (playerHealth <= 0) {
            endGame();
        }
    }
}

function spawnSplitterMinions(x, y) {
    for (let i = 0; i < 3; i++) {
        enemies.push({
            x, 
            y,
            size: 12,
            speed: 2.5,
            hp: 1,
            color: '#0a0',
            type: 'mini',
            points: 0,
            lastHit: 0,
            frozen: false,
            // Add these properties to match normal enemy structure
            originalSpeed: 2.5,
            damageReduction: 1.0,
            explode: false
        });
    }
}
function updateScore() {
    scoreEl.textContent = `Score: ${score}`;
    
    if (score % 10 === 0) {
        wave++;
        waveEl.textContent = `Wave: ${wave}`;
        waveEl.style.transform = 'scale(1.2)';
        waveEl.style.color = '#ffcc00';
        setTimeout(() => {
            waveEl.style.transform = 'scale(1)';
            waveEl.style.color = 'white';
        }, 1000);
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.dx;
        p.y += p.dy;
        p.life--;
        if (!p.isText) p.size *= 0.98;
        
        if (p.life <= 0) {
            particlePool.push(particles.splice(i, 1)[0]);
        }
    }
}

function reduceScreenShake() {
    if (shakeIntensity > 0) {
        shakeIntensity *= 0.9;
    }
}

function endGame() {
    gameOver = true;
    clearInterval(spawnInterval);
    clearInterval(performanceCheckInterval);
    shakeIntensity = 20;
    
    finalScoreEl.textContent = score;
    gameOverContainer.style.display = 'flex';
    retryBtn.style.display = 'block';
    
    // Remove any existing survival time displays first
    const existingTimeDisplays = document.querySelectorAll('.survival-time');
    existingTimeDisplays.forEach(el => el.remove());
    
    // Add survival time to game over screen
    const minutes = Math.floor(survivalTime / 60);
    const seconds = survivalTime % 60;
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'survival-time';
    timeDisplay.textContent = `Survived: ${minutes}m ${seconds}s`;
    
    // Insert after the final score element
    finalScoreEl.parentNode.insertBefore(timeDisplay, finalScoreEl.nextSibling);
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', score);
        highScoreEl.textContent = `High Score: ${highScore}`;
        highScoreNotification.style.display = 'block';
    }
    
    gameOverSound.currentTime = 0;
    gameOverSound.play();
}

function draw() {
    if (gamePaused) return;
    
    frameCount++;
    
    const offCtx = canvas.offscreen.getContext('2d');
    offCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawWithScreenShake(offCtx);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas.offscreen, 0, 0);
}

function drawWithScreenShake(context) {
    context.save();
    if (shakeIntensity > 0) {
        context.translate(
            (Math.random() - 0.5) * shakeIntensity,
            (Math.random() - 0.5) * shakeIntensity
        );
    }

    drawPlayerTrail(context);
    drawPlayer(context);
    drawSword(context);
    drawEnemies(context);
    drawParticles(context);
    
    context.restore();
}

function drawPlayerTrail(context) {
    context.globalAlpha = 0.3;
    player.trail.forEach((pos, i) => {
        const alpha = i / player.trail.length;
        context.fillStyle = `rgba(0, 255, 255, ${alpha})`;
        context.beginPath();
        context.arc(pos.x, pos.y, player.size * alpha, 0, Math.PI * 2);
        context.fill();
    });
    context.globalAlpha = 1;
}

function drawPlayer(context) {
    // Draw player trail (ghost images)
    context.globalAlpha = 0.3;
    player.trail.forEach((pos, i) => {
        const alpha = i / player.trail.length;
        const gradient = context.createRadialGradient(
            pos.x, pos.y, 0,
            pos.x, pos.y, player.size * alpha
        );
        gradient.addColorStop(0, `rgba(0, 255, 255, ${alpha})`);
        gradient.addColorStop(1, `rgba(0, 150, 255, ${alpha * 0.5})`);
        
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(pos.x, pos.y, player.size * alpha, 0, Math.PI * 2);
        context.fill();
    });
    context.globalAlpha = 1;

    // Draw main player body
    if (!player.invulnerable || Math.floor(Date.now() / 100) % 2 === 0) {
        // Body gradient
        const bodyGradient = context.createRadialGradient(
            player.x, player.y, 0,
            player.x, player.y, player.size
        );
        bodyGradient.addColorStop(0, '#00FFFF');
        bodyGradient.addColorStop(0.7, '#0088FF');
        bodyGradient.addColorStop(1, '#0055FF');
        
        context.fillStyle = bodyGradient;
        context.beginPath();
        context.arc(player.x, player.y, player.size, 0, Math.PI * 2);
        context.fill();
        
        // Core glow
        context.fillStyle = 'rgba(255, 255, 255, 0.8)';
        context.beginPath();
        context.arc(player.x, player.y, player.size * 0.4, 0, Math.PI * 2);
        context.fill();
    }

    // Draw armor/shield effects if active
    if (player.damageReduction < 1.0) {
        // Shield pulse effect
        const pulseIntensity = 2 + Math.sin(Date.now() / 200) * 2;
        
        // Outer shield ring
        context.strokeStyle = `rgba(0, 200, 255, ${0.3 + pulseIntensity/10})`;
        context.lineWidth = pulseIntensity;
        context.beginPath();
        context.arc(player.x, player.y, player.size * 1.5, 0, Math.PI * 2);
        context.stroke();
        
        // Shield timer indicator (countdown circle)
        const elapsed = Date.now() % 7000;
        const remaining = 7000 - elapsed;
        const endAngle = (remaining / 7000) * Math.PI * 2;
        context.beginPath();
        context.arc(player.x, player.y, player.size * 1.7, -Math.PI/2, -Math.PI/2 + endAngle, true);
        context.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        context.lineWidth = 3;
        context.lineCap = 'round';
        context.stroke();
        
        // Inner shield glow
        context.fillStyle = 'rgba(0, 150, 255, 0.15)';
        context.beginPath();
        context.arc(player.x, player.y, player.size * 1.4, 0, Math.PI * 2);
        context.fill();
    }

    // Draw invulnerability flash effect
    if (player.invulnerable && player.damageReduction >= 1.0) {
        const flashAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
        context.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        context.beginPath();
        context.arc(player.x, player.y, player.size * 1.2, 0, Math.PI * 2);
        context.fill();
    }
}

function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    }
    else if (param > 1) {
        xx = x2;
        yy = y2;
    }
    else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function drawSword(context) {
    const swordTipX = player.x + Math.cos(swordAngle) * swordLength;
    const swordTipY = player.y + Math.sin(swordAngle) * swordLength;
    
    context.save();
    
    if (isSwinging) {
        // Thicker, glowing sword
        const gradient = context.createLinearGradient(
            player.x, player.y, 
            swordTipX, swordTipY
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 100, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 200, 0, 0.8)');
        
        context.strokeStyle = gradient;
        context.lineWidth = 10;
        context.shadowColor = 'rgba(255, 200, 0, 0.7)';
        context.shadowBlur = 15;
    }  else {
        // Change sword color when low on stamina
        if (currentStamina < staminaDrainRate) {
            context.strokeStyle = 'rgba(255, 50, 50, 0.5)';
        } else {
            context.strokeStyle = 'rgba(200, 200, 200, 0.7)';
        }
        context.lineWidth = 5;
    }
    
    // Draw sword
    context.beginPath();
    context.moveTo(player.x, player.y);
    context.lineTo(swordTipX, swordTipY);
    context.stroke();
    
    // Sword tip effect
    if (isSwinging) {
        context.fillStyle = 'white';
        context.beginPath();
        context.arc(swordTipX, swordTipY, 8, 0, Math.PI * 2);
        context.fill();
        
        // Glowing tip
        const tipGradient = context.createRadialGradient(
            swordTipX, swordTipY, 0,
            swordTipX, swordTipY, 15
        );
        tipGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        tipGradient.addColorStop(1, 'rgba(255, 200, 0, 0)');
        
        context.fillStyle = tipGradient;
        context.beginPath();
        context.arc(swordTipX, swordTipY, 15, 0, Math.PI * 2);
        context.fill();
    }
    
    context.restore();
}

function drawEnemies(context) {
    enemies.forEach(e => {
        if (e.frozen) {
            context.fillStyle = 'rgba(150, 150, 255, 0.7)';
            context.beginPath();
            context.arc(e.x, e.y, e.size * 1.3, 0, Math.PI * 2);
            context.fill();
        }
        
        // Draw enemy body
        if (e.type === 'bomber') {
            // Black outer circle for bombers
            context.fillStyle = e.color;
            context.beginPath();
            context.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            context.fill();
            
            // Orange inner circle
            context.fillStyle = e.innerColor;
            context.beginPath();
            context.arc(e.x, e.y, e.size * 0.7, 0, Math.PI * 2);
            context.fill();
        } else {
            // Normal enemy appearance
            if (Date.now() - e.lastHit < 200) {
                context.fillStyle = 'white';
                context.beginPath();
                context.arc(e.x, e.y, e.size * 1.2, 0, Math.PI * 2);
                context.fill();
            }
            
            context.fillStyle = e.color;
            context.beginPath();
            context.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            context.fill();
        }
        
        if (e.type === 'tank') {
            drawEnemyHealthBar(context, e);
        }
    });
}

function drawEnemyHealthBar(context, enemy) {
    const healthWidth = (enemy.size * 2) * (enemy.hp / (3 + Math.floor(wave/3)));
    context.fillStyle = 'red';
    context.fillRect(enemy.x - enemy.size, enemy.y - enemy.size - 10, enemy.size * 2, 5);
    context.fillStyle = 'lime';
    context.fillRect(enemy.x - enemy.size, enemy.y - enemy.size - 10, healthWidth, 5);
}

// Inventory functions
function updateInventoryUI() {
    inventorySlots.forEach((slot, index) => {
        const item = inventoryItems[index];
        if (item) {
            const powerup = powerups[item];
            slot.innerHTML = `<div class="item" style="color:${powerup.color}">${item}</div>`;
            slot.onclick = () => useItem(index);
        } else {
            slot.innerHTML = '';
            slot.onclick = null;
        }
    });
}

function useItem(slotIndex) {
    const itemName = inventoryItems[slotIndex];
    if (itemName && powerups[itemName]) {
        powerupSound.currentTime = 0;
        powerupSound.play();
        if (powerups[itemName].use()) {
            inventoryItems[slotIndex] = null;
            updateInventoryUI();
        }
    }
}

function addToInventory(item) {
    const emptySlot = inventoryItems.findIndex(slot => slot === null);
    if (emptySlot !== -1) {
        inventoryItems[emptySlot] = item;
        updateInventoryUI();
        return true;
    }
    return false;
}

function drawParticles(context) {
    particles.forEach(p => {
        if (p.isText) {
            drawTextParticle(context, p);
        } else {
            drawRegularParticle(context, p);
        }
    });
}

function drawTextParticle(context, particle) {
    context.font = `${particle.size}px Arial`;
    context.fillStyle = particle.color;
    context.globalAlpha = particle.life / 60;
    context.textAlign = 'center';
    context.fillText(particle.text, particle.x, particle.y);
    context.globalAlpha = 1;
}

function drawRegularParticle(context, particle) {
    context.fillStyle = particle.color;
    context.globalAlpha = particle.life / 50;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
}

function gameLoop() {
    update();
    draw();
    updateSurvivalTime();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    // Hide menu and show game
    if (mainMenu) mainMenu.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'block';

    if (!document.getElementById('mainMenu')) {
  window.addEventListener('load', startGame);
}
    
    setupCanvas();
    initAudio();
    setupEventListeners();
    initGame();
    gameLoop();
  }

// Add inventory CSS
const style = document.createElement('style');
style.textContent = `
  .inventory-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    background: rgba(0, 0, 0, 0.9);
    border: 2px solid #4CAF50;
    border-radius: 10px;
    padding: 20px;
    z-index: 100;
    display: none;
  }
  .inventory-header {
    color: white;
    font-size: 24px;
    text-align: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #4CAF50;
  }
  .inventory-slots {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .inventory-slot {
    height: 80px;
    background: rgba(255,255,255,0.1);
    border: 1px solid #4CAF50;
    border-radius: 5px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  .inventory-slot:hover {
    background: rgba(255,255,255,0.2);
    transform: scale(1.05);
  }
  .inventory-slot .item {
    font-size: 14px;
    text-align: center;
    font-weight: bold;
  }
  #performanceStats {
    position: fixed;
    bottom: 10px;
    right: 10px;
    font-size: 14px;
    color: #ccc;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 8px 12px;
    border-radius: 5px;
    z-index: 10;
  }
  #survivalTime {
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 18px;
    color: white;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 5px 15px;
    border-radius: 5px;
    z-index: 10;
  }
  .game-over-container .survival-time {
    font-size: 24px;
    color: #4CAF50;
    margin: 10px 0;
  }
`;
document.head.appendChild(style);

window.addEventListener('load', startGame);