import { Player } from './player.js';
import { Map as GameMap } from './map.js';
import { startChoppingCycle } from './behaviors/chopping.js';
import { startGatheringCycle } from './behaviors/gathering.js';
import { AudioManager } from './audio-manager.js';
import { PLAYER_STATE } from './player-state.js';
import { Camera } from './game/camera.js';
import * as StorageManager from './storage-manager.js';
import { finishChopping } from './behaviors/chopping.js';
import { beginChopping, beginHarvestingBushes, beginHarvestingLogs } from './behaviors/index.js';
import { DEFAULT_GAME_SETTINGS } from './game-settings.js';
import { setEnergyCooldown } from './twitch.js';
import { ThreeRenderer } from './game/renderer.js';
import { updateActiveChopping } from './game/chopping-manager.js';
import { initRealtimeHost, sendLiveViewUpdate } from './game/realtime.js';
import { handlePlayerCommand as handlePlayerCommandImpl } from './game/commands.js';
import { TILE_TYPE } from './map-tile-types.js';

export class Game {
    constructor(container, channel, worldName = 'default', hosts = [], settings = DEFAULT_GAME_SETTINGS) {
        // Container is the DIV, not canvas. Renderer creates canvas.
        this.container = container;
        this.channel = channel;
        this.worldName = worldName;
        this.hosts = new Set(hosts.map(h => h.toLowerCase()));
        this.settings = settings;
        
        // Ensure valid view mode for 3D migration
        if (this.settings.visuals.view_mode === '2d') {
            this.settings.visuals.view_mode = 'top-down'; 
        }

        console.log("Game started with hosts:", this.hosts);

        this.players = new Map();
        this.baseTileSize = 1; // In 3D, 1 tile = 1 unit
        this.map = new GameMap(this.baseTileSize); 
        this.camera = new Camera(this, this.map, this.players, this.settings);
        
        this.renderer = new ThreeRenderer(container); // Initialize Three.js renderer

        this.activeChoppingTargets = new Map();
        
        this.assets = {}; 
        this.generatedAssets = [];

        this.room = null;
        this.pendingLinks = new Map();
        this.linkedPlayers = new Map();
        this.liveViewUpdateTimer = 0;

        setEnergyCooldown(this.settings.energy.chat_cooldown_seconds);

        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.handleWheel(e.deltaY);
        }, { passive: false });

        // NEW: middle mouse drag to orbit camera (isometric view)
        this._isOrbitDragging = false;
        this._lastOrbitDragX = 0;
        this.container.addEventListener('mousemove', (e) => {
            if (!this._isOrbitDragging) return;
            const dx = e.clientX - this._lastOrbitDragX;
            this._lastOrbitDragX = e.clientX;
            // Sensitivity: negative to match drag direction
            const sensitivity = 0.3;
            this.camera.adjustOrbit(-dx * sensitivity);
        });
        
        this.saveInterval = setInterval(async () => {
            await StorageManager.saveGameState(this.channel, this.worldName, this.players, this.map, this.assets, this.generatedAssets);
        }, 5000);
    }

    async init() {
        await initRealtimeHost(this);
        await StorageManager.init(this.channel, this.worldName);
        const gameState = await StorageManager.loadGameState(this.channel, this.worldName);

        this.assets = gameState.assets || {};
        this.generatedAssets = gameState.assetsGenerated || [];

        if (gameState.map && gameState.map.grid && gameState.map.grid.length > 0) {
            this.map.grid = gameState.map.grid;
            this.map.treeRespawns = gameState.map.treeRespawns || [];
            this.map.height = this.map.grid.length;
            this.map.width = this.map.grid[0].length;

            if (gameState.map.heightGrid && gameState.map.heightGrid.length > 0) {
                this.map.heightGrid = gameState.map.heightGrid;
            } else {
                this.map.heightGrid = Array(this.map.height).fill(0).map(() => Array(this.map.width).fill(0));
            }
        } else {
            this.map.generateMap();
        }

        let hasTree = false;
        let hasFlowers = false;
        for (let j = 0; j < this.map.height; j++) {
            const row = this.map.grid[j];
            if (!row) continue;
            for (let i = 0; i < this.map.width; i++) {
                const t = row[i];
                if (t === TILE_TYPE.TREE) hasTree = true;
                if (t === TILE_TYPE.FLOWER_PATCH) hasFlowers = true;
                if (hasTree && hasFlowers) break;
            }
            if (hasTree && hasFlowers) break;
        }
        if (!hasTree) this.map.regenerateTrees();
        if (!hasFlowers) this.map.regenerateFlowers();

        if (gameState.players) {
            for (const id in gameState.players) {
                const state = gameState.players[id];
                if (state && state.id && state.username) {
                    const player = new Player(state.id, state.username, state.color, this.settings);
                    player.loadState(state);
                    this.players.set(id, player);
                }
            }
        }
        
        for (const player of this.players.values()) {
            player.validateState(this.map, this);
        }

        this.resize();
    }

    resize() {
        this.renderer.resize(this); // Pass game reference for camera updates
        this.map.setViewport(window.innerWidth, window.innerHeight);
    }

    handleKeyPress(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            this.camera.switchToNextPlayerFocus();
        } else if (e.code === 'ArrowLeft') {
            // Rotate camera left around focused player in isometric mode
            e.preventDefault();
            if (this.settings.visuals.view_mode === 'isometric') {
                this.camera.adjustOrbit(-this.camera.orbitSpeedDegPerStep);
            }
        } else if (e.code === 'ArrowRight') {
            // Rotate camera right around focused player in isometric mode
            e.preventDefault();
            if (this.settings.visuals.view_mode === 'isometric') {
                this.camera.adjustOrbit(this.camera.orbitSpeedDegPerStep);
            }
        }
    }

    handlePlayerCommand(userId, command, args) {
        handlePlayerCommandImpl(this, userId, command, args);
    }

    addOrUpdatePlayer(chatter) {
        if (!chatter || !chatter.id) return;
        let player = this.players.get(chatter.id);
        const wasPoweredBefore = player ? player.isPowered() : false;

        if (!player) {
            player = new Player(chatter.id, chatter.username, chatter.color, this.settings);
            this.players.set(chatter.id, player);
            player.setInitialPosition(this.map);
            console.log(`Player ${chatter.username} joined.`);
            if (!this.camera.focusedPlayerId) {
                this.camera.setFocus(chatter.id);
            }
        } else {
             player.username = chatter.username;
             player.color = chatter.color;
        }

        player.addEnergy();
        console.log(`Player ${player.username} gained energy.`);

        if (!wasPoweredBefore && player.isPowered()) {
            this.camera.setFocus(player.id);
        }
    }

    start() {
        this.init().then(() => {
            this.map.loadAssets(this.assets).then(() => {
                this.lastTime = performance.now();
                this.gameLoop();
            });
        });
    }

    gameLoop(currentTime = performance.now()) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        this.camera.update(deltaTime);
        updateActiveChopping(this, deltaTime);

        this.map.update(this.players);

        this.liveViewUpdateTimer += deltaTime;
        const shouldSendUpdate = this.liveViewUpdateTimer > (1 / 15);

        for (const player of this.players.values()) {
            player.update(deltaTime, this.map, this.players, this);
            if (this.linkedPlayers.has(player.id) && shouldSendUpdate) {
                sendLiveViewUpdate(this, player);
            }
        }

        if (shouldSendUpdate) {
            this.liveViewUpdateTimer = 0;
        }
    }
    
    render() {
        this.renderer.render(this);
    }
}