import { project } from '../game/projection.js';

export class Camera {
    constructor(canvas, map, players, settings) {
        this.canvas = canvas;
        this.map = map;
        this.players = players;
        this.settings = settings;

        this.x = 0;
        this.y = 0;

        this.focusedPlayerId = null;
        this.focusTimer = 0;
        this.FOCUS_DURATION = 60; // seconds

        // Zoom parameters
        this.zoom = 1;
        this.minZoom = 0.5;
        this.maxZoom = 2;

        // Remember the base (unzoomed) tile size so we can derive zoomed size
        this.baseTileSize = this.map.tileSize;
    }

    setFocus(playerId) {
        this.focusedPlayerId = playerId;
        this.focusTimer = this.FOCUS_DURATION;
        const player = this.players.get(playerId);
        if (player) {
            console.log(`Camera focusing on: ${player.username} for ${this.FOCUS_DURATION} seconds.`);
        }
    }

    handleWheel(deltaY) {
        // deltaY > 0 => wheel down => zoom out
        // deltaY < 0 => wheel up   => zoom in
        const zoomStep = 0.1;
        const factor = deltaY < 0 ? (1 + zoomStep) : (1 - zoomStep);
        const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
        if (newZoom === this.zoom) {
            return;
        }

        const viewMode = this.settings?.visuals?.view_mode || '2d';
        const oldTileSize = this.map.tileSize;

        // Compute current world-space point at the center of the screen
        const centerScreenX = this.x + this.canvas.width / 2;
        const centerScreenY = this.y + this.canvas.height / 2;

        let worldCenterX, worldCenterY;

        if (viewMode === '2.5d') {
            // Invert isometric projection used in project()
            // x_scr = (x - y) * 0.5 * ts
            // y_scr = (x + y) * 0.25 * ts
            const factorX = centerScreenX / (0.5 * oldTileSize);
            const factorY = centerScreenY / (0.25 * oldTileSize);
            worldCenterX = (factorX + factorY) / 2;
            worldCenterY = (factorY - factorX) / 2;
        } else {
            // 2D top-down inverse
            worldCenterX = centerScreenX / oldTileSize;
            worldCenterY = centerScreenY / oldTileSize;
        }

        // Apply new zoom and update tile size
        this.zoom = newZoom;
        const newTileSize = this.baseTileSize * this.zoom;
        this.map.setTileSize(newTileSize);

        // Re-project the same world center with the new zoom
        const projectedCenter = project(worldCenterX, worldCenterY, 0, viewMode, newTileSize);

        // Adjust camera so that the worldCenter stays under the screen center
        this.x = projectedCenter.x - this.canvas.width / 2;
        this.y = projectedCenter.y - this.canvas.height / 2;

        console.log(`Camera zoom set to: ${this.zoom.toFixed(2)}`);
    }

    update(deltaTime) {
        this.focusTimer -= deltaTime;
        if (this.focusTimer <= 0) {
            this.chooseNewFocus();
            this.focusTimer = this.FOCUS_DURATION;
        }

        const focusedPlayer = this.focusedPlayerId ? this.players.get(this.focusedPlayerId) : null;
        const tileSize = this.map.tileSize;
        const viewMode = this.settings?.visuals?.view_mode || '2d';

        if (focusedPlayer) {
            // Calculate projected center of player
            const projected = project(focusedPlayer.pixelX + 0.5, focusedPlayer.pixelY + 0.5, 0, viewMode, tileSize);
            const playerCenterX = projected.x;
            const playerCenterY = projected.y;

            // Smoothly interpolate camera position
            const lerpFactor = 1.0 - Math.exp(-10 * deltaTime); // Smooth damping
            
            // The camera x/y represents the top-left coordinate of the viewport in screen space units.
            // To center the player, we want (playerPos - cameraPos) = (screenWidth/2, screenHeight/2)
            // So targetCameraPos = playerPos - screenCenter
            
            const targetX = playerCenterX - this.canvas.width / 2;
            const targetY = playerCenterY - this.canvas.height / 2;

            this.x += (targetX - this.x) * lerpFactor;
            this.y += (targetY - this.y) * lerpFactor;

            // Clamping is tricky in 2.5D because the map isn't a rectangle. 
            // For now, we disable strict clamping in 2.5D or use a loose bound.
            if (viewMode === '2d') {
                const mapPixelWidth = this.map.width * tileSize;
                const mapPixelHeight = this.map.height * tileSize;

                if (mapPixelWidth > this.canvas.width) {
                    const maxCameraX = mapPixelWidth - this.canvas.width;
                    this.x = Math.max(0, Math.min(this.x, maxCameraX));
                } else {
                    this.x = -(this.canvas.width - mapPixelWidth) / 2;
                }

                if (mapPixelHeight > this.canvas.height) {
                    const maxCameraY = mapPixelHeight - this.canvas.height;
                    this.y = Math.max(0, Math.min(this.y, maxCameraY));
                } else {
                    this.y = -(this.canvas.height - mapPixelHeight) / 2;
                }
            }

        } else {
            // If no player, maybe center on map? 
            // For 2D, we did specific centering logic.
            // For 2.5D, let's just stay where we are or drift to 0,0 projected.
             if (viewMode === '2d') {
                const mapPixelWidth = this.map.width * tileSize;
                const mapPixelHeight = this.map.height * tileSize;
                if (this.canvas.width > mapPixelWidth) {
                     this.x = -(this.canvas.width - mapPixelWidth) / 2;
                }
                if (this.canvas.height > mapPixelHeight) {
                    this.y = -(this.canvas.height - mapPixelHeight) / 2;
                }
             }
        }
    }

    chooseNewFocus() {
        const activePlayers = Array.from(this.players.values()).filter(p => p.isPowered());

        if (activePlayers.length === 0) {
            this.focusedPlayerId = null;
            this.focusTimer = this.FOCUS_DURATION;
            console.log("No active players to focus on.");
            return;
        }

        const randomIndex = Math.floor(Math.random() * activePlayers.length);
        const player = activePlayers[randomIndex];

        this.focusedPlayerId = player.id;
        console.log(`Camera focusing on: ${player.username} for ${this.FOCUS_DURATION} seconds.`);
    }

    switchToNextPlayerFocus() {
        const activePlayers = Array.from(this.players.values()).filter(p => p.isPowered());

        if (activePlayers.length === 0) {
            console.log("No active players to focus on.");
            return;
        }

        // Always sort to get deterministic order
        activePlayers.sort((a, b) => a.username.localeCompare(b.username));

        // If there is only one active player, always focus them
        if (activePlayers.length === 1) {
            const onlyPlayer = activePlayers[0];
            if (this.focusedPlayerId !== onlyPlayer.id) {
                this.setFocus(onlyPlayer.id);
            } else {
                // Already focused on the only player, just reset the focus timer
                this.focusTimer = this.FOCUS_DURATION;
            }
            return;
        }

        let currentIndex = -1;
        if (this.focusedPlayerId) {
            currentIndex = activePlayers.findIndex(p => p.id === this.focusedPlayerId);
        }

        // If no current focus or focused player is no longer active, start from first
        if (currentIndex === -1) {
            const nextPlayer = activePlayers[0];
            this.setFocus(nextPlayer.id);
            return;
        }

        const nextIndex = (currentIndex + 1) % activePlayers.length;
        const nextPlayer = activePlayers[nextIndex];

        if (nextPlayer) {
            this.setFocus(nextPlayer.id);
            console.log(`Camera focus switched to: ${nextPlayer.username}`);
        }
    }
}