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
import { renderGame } from './game/renderer.js';
import { updateActiveChopping } from './game/chopping-manager.js';
// New imports for refactored logic
import { initRealtimeHost, sendLiveViewUpdate } from './game/realtime.js';
import { handlePlayerCommand as handlePlayerCommandImpl } from './game/commands.js';

export class Game {
    constructor(canvas, channel, worldName = 'default', hosts = [], settings = DEFAULT_GAME_SETTINGS) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.channel = channel;
        this.worldName = worldName;
        this.hosts = new Set(hosts.map(h => h.toLowerCase()));
        this.settings = settings;
        console.log("Game started with hosts:", this.hosts);
        console.log("Game started with settings:", this.settings);

        this.players = new Map();
        this.baseTileSize = 32;
        this.map = new GameMap(this.baseTileSize); // TileSize is 32
        this.camera = new Camera(this.canvas, this.map, this.players, this.settings);
        this.activeChoppingTargets = new Map();
        
        this.assets = {}; // Store assets overrides
        this.generatedAssets = []; // Store AI-generated asset library for this world

        // Realtime communication for remote inventory
        this.room = null;
        this.pendingLinks = new Map(); // code -> { clientId, expiry }
        this.linkedPlayers = new Map(); // twitchUserId -> clientId
        this.liveViewUpdateTimer = 0;

        setEnergyCooldown(this.settings.energy.chat_cooldown_seconds);

        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // Mouse wheel zoom (on canvas only)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.handleWheel(e.deltaY);
        }, { passive: false });
        
        this.saveInterval = setInterval(async () => {
            await StorageManager.saveGameState(this.channel, this.worldName, this.players, this.map, this.assets, this.generatedAssets);
        }, 5000); // Save every 5 seconds
    }

    async init() {
        // Refactored realtime initialization into game/realtime.js
        await initRealtimeHost(this);

        await StorageManager.init(this.channel, this.worldName);
        const gameState = await StorageManager.loadGameState(this.channel, this.worldName);

        // Load assets overrides and generated assets from saved state
        this.assets = gameState.assets || {};
        this.generatedAssets = gameState.assetsGenerated || [];

        if (gameState.map && gameState.map.grid && gameState.map.grid.length > 0) {
            this.map.grid = gameState.map.grid;
            this.map.treeRespawns = gameState.map.treeRespawns || [];
            
            // Ensure dimensions are correct based on loaded grid
            this.map.height = this.map.grid.length;
            this.map.width = this.map.grid[0].length;

            if (gameState.map.heightGrid && gameState.map.heightGrid.length > 0) {
                this.map.heightGrid = gameState.map.heightGrid;
            } else {
                // Default height grid for legacy saves
                this.map.heightGrid = Array(this.map.height).fill(0).map(() => Array(this.map.width).fill(0));
            }
        } else {
            this.map.generateMap();
        }

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
        
        // Validate player states after loading everything
        for (const player of this.players.values()) {
            player.validateState(this.map, this);
        }

        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.saveInterval = setInterval(async () => {
            await StorageManager.saveGameState(this.channel, this.worldName, this.players, this.map, this.assets, this.generatedAssets);
        }, 5000); // Save every 5 seconds
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Use a fixed base tileSize for gameplay scale, allowing the map to be larger than viewport
        const fixedTileSize = this.baseTileSize; 
        // Apply current zoom level from camera
        const zoomedTileSize = fixedTileSize * (this.camera?.zoom || 1);
        this.map.setTileSize(zoomedTileSize);

        this.map.setViewport(this.canvas.width, this.canvas.height);
    }

    handleKeyPress(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            this.camera.switchToNextPlayerFocus();
        }
    }

    handlePlayerCommand(userId, command, args) {
        // Delegated to game/commands.js for maintainability
        handlePlayerCommandImpl(this, userId, command, args);
    }

    addOrUpdatePlayer(chatter) {
        if (!chatter || !chatter.id) {
            console.error("Attempted to add or update player with invalid chatter data:", chatter);
            return;
        }
        let player = this.players.get(chatter.id);
        const wasPoweredBefore = player ? player.isPowered() : false;

        if (!player) {
            // Truly new player (not in persistence or current map)
            player = new Player(chatter.id, chatter.username, chatter.color, this.settings);
            this.players.set(chatter.id, player);
            
            // Ensure player is positioned correctly on the map, avoiding obstacles
            player.setInitialPosition(this.map);

            console.log(`Player ${chatter.username} joined.`);
            
            if (!this.camera.focusedPlayerId) {
                this.camera.setFocus(chatter.id);
            }
        } else {
             // Existing player (loaded from storage or currently active)
             // Update volatile data like username/color which might change
             player.username = chatter.username;
             player.color = chatter.color;
        }

        player.addEnergy();
        console.log(`Player ${player.username} gained energy. Current energy cells: ${player.energy.timestamps.length}`);

        // If a player who was not active just gained energy, focus the camera on them.
        if (!wasPoweredBefore && player.isPowered()) {
            console.log(`Focusing camera on newly powered player: ${player.username}`);
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
        const deltaTime = (currentTime - this.lastTime) / 1000; // in seconds
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
        const shouldSendUpdate = this.liveViewUpdateTimer > (1 / 15); // 15 FPS updates

        for (const player of this.players.values()) {
            player.update(deltaTime, this.map, this.players, this);
            if (this.linkedPlayers.has(player.id) && shouldSendUpdate) {
                // Use refactored helper in game/realtime.js
                sendLiveViewUpdate(this, player);
            }
        }

        if (shouldSendUpdate) {
            this.liveViewUpdateTimer = 0;
        }
    }
    
    render() {
        renderGame(this);
    }
}