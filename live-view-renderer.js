import { TILE_TYPE } from './map-tile-types.js';
import { renderPlayer } from './player-renderer.js';
import { project, getSortDepth } from './game/projection.js';

class MockPlayer {
    constructor(state) {
        this.stateData = state;
    }
    get id() { return this.stateData.id; }
    get username() { return this.stateData.username; }
    get color() { return this.stateData.color; }
    get pixelX() { return this.stateData.pixelX; }
    get pixelY() { return this.stateData.pixelY; }
    get offsetX() { return this.stateData.offsetX || 0; }
    get offsetY() { return this.stateData.offsetY || 0; }
    get z() { return this.stateData.z || 0; } // Use Z
    get state() { return this.stateData.state; }
    get actionTimer() { return this.stateData.actionTimer; }
    get actionTotalTime() { return this.stateData.actionTotalTime; }
    isPowered() { return true; } // Assume powered for rendering purposes
    render(ctx, tileSize, cameraX, cameraY, viewMode = '2d') {
        // Simplified energy object for renderer
        this.energy = {
            timestamps: this.stateData.energyTimestamps || [],
            currentCellDrainRatio: 0,
            flashState: 0,
        };
        renderPlayer(ctx, this, tileSize, cameraX, cameraY, viewMode);
    }
}

export class LiveViewRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tileSize = 32;
        this.assets = {};
        this.state = null;
        this.animationFrameId = null;
        this.viewMode = '2d'; // '2d' or '2.5d'

        // Zoom controls (similar to host camera)
        this.baseTileSize = 32;
        // Start slightly zoomed out so more of the world is visible by default
        this.zoom = 0.75;
        this.minZoom = 0.4;
        this.maxZoom = 2;

        // Disable smoothing to avoid visible seams between tiles when scaled
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
        }
    }

    async loadAssets() {
        const loadTile = (src) => new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
        });

        const [grass, tree, logs, bushes, flowers] = await Promise.all([
            loadTile('./grass_tile.png'),
            loadTile('./tree.png'),
            loadTile('./logs.png'),
            loadTile('./bushes.png'),
            loadTile('./flowers.png')
        ]);

        this.assets = { grass, tree, logs, bushes, flowers };
        console.log("Live View assets loaded.");
    }

    setViewMode(mode) {
        if (mode === '2d' || mode === '2.5d') {
            this.viewMode = mode;
        }
    }

    // New: handle zoom via mouse wheel
    handleWheel(deltaY) {
        const zoomStep = 0.1;
        const factor = deltaY < 0 ? (1 + zoomStep) : (1 - zoomStep);
        const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
        if (newZoom === this.zoom) return;
        this.zoom = newZoom;
        console.log(`Live View zoom set to: ${this.zoom.toFixed(2)}`);
    }

    updateState(newState) {
        this.state = newState;
    }

    start() {
        this.loadAssets().then(() => {
            // Attach wheel zoom handler once assets are ready
            this.canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.handleWheel(e.deltaY);
            }, { passive: false });

            this.renderLoop();
        });
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    renderLoop() {
        this.render();
        this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    }

    render() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.state || !this.assets.grass) return;

        const { playerState, mapChunk, nearbyPlayers } = this.state;
        const mainPlayer = new MockPlayer(playerState);

        // Use zoomed tile size similar to host camera
        const ts = this.baseTileSize * this.zoom;
        this.tileSize = ts;
        const viewMode = this.viewMode;

        // Compute camera based on view mode
        let cameraX, cameraY;

        if (viewMode === '2.5d') {
            // Project player center and center camera on that point
            const projected = project(mainPlayer.pixelX + 0.5, mainPlayer.pixelY + 0.5, 0, viewMode, ts);
            cameraX = projected.x - this.canvas.width / 2;
            cameraY = projected.y - this.canvas.height / 2;
        } else {
            // 2D top-down
            cameraX = (mainPlayer.pixelX * ts) - (this.canvas.width / 2);
            cameraY = (mainPlayer.pixelY * ts) - (this.canvas.height / 2);
        }

        // Render map chunk
        if (mapChunk) {
            if (viewMode === '2.5d') {
                ctx.save();
                // Snap camera to whole pixels for smoother motion and to avoid seams
                const snappedCameraX = Math.round(cameraX);
                const snappedCameraY = Math.round(cameraY);
                ctx.translate(-snappedCameraX, -snappedCameraY);
                // Apply isometric ground transform (same as MapRenderer)
                ctx.transform(0.5, 0.25, -0.5, 0.25, 0, 0);

                const pad = 2;
                for (let j = -pad; j < mapChunk.grid.length + pad; j++) {
                    for (let i = -pad; i < mapChunk.grid[0].length + pad; i++) {
                        const worldX = mapChunk.origin.x + i;
                        const worldY = mapChunk.origin.y + j;

                        // Skip far out-of-bounds tiles
                        if (worldY < mapChunk.origin.y ||
                            worldY >= mapChunk.origin.y + mapChunk.grid.length ||
                            worldX < mapChunk.origin.x ||
                            worldX >= mapChunk.origin.x + mapChunk.grid[0].length) {
                            // Just draw grass outside known chunk so ground doesn't look cut
                            const drawX = Math.floor(worldX * ts) - 0.5;
                            const drawY = Math.floor(worldY * ts) - 0.5;
                            ctx.drawImage(this.assets.grass, drawX, drawY, ts + 1, ts + 1);
                            continue;
                        }

                        const tileType = mapChunk.grid[worldY - mapChunk.origin.y][worldX - mapChunk.origin.x];
                        if (tileType === null) continue;

                        const drawX = Math.floor(worldX * ts) - 0.5;
                        const drawY = Math.floor(worldY * ts) - 0.5;
                        ctx.drawImage(this.assets.grass, drawX, drawY, ts + 1, ts + 1);

                        // Flat ground details (flowers only). Logs/bushes/trees stand up later.
                        if (tileType === TILE_TYPE.FLOWER_PATCH) {
                            ctx.drawImage(this.assets.flowers, drawX, drawY, ts + 1, ts + 1);
                        }
                    }
                }

                ctx.restore();
            } else {
                // 2D top-down (existing behavior)
                for (let j = 0; j < mapChunk.grid.length; j++) {
                    for (let i = 0; i < mapChunk.grid[j].length; i++) {
                        const tileType = mapChunk.grid[j][i];
                        if (tileType === null) continue;

                        const worldX = mapChunk.origin.x + i;
                        const worldY = mapChunk.origin.y + j;

                        const screenX = Math.round(worldX * ts - cameraX);
                        const screenY = Math.round(worldY * ts - cameraY);

                        // Slightly overlap tiles to hide any subpixel gaps
                        const drawX = screenX - 0.5;
                        const drawY = screenY - 0.5;
                        ctx.drawImage(this.assets.grass, drawX, drawY, ts + 1, ts + 1);

                        let objectImage = null;
                        if (tileType === TILE_TYPE.LOGS) objectImage = this.assets.logs;
                        else if (tileType === TILE_TYPE.BUSHES) objectImage = this.assets.bushes;
                        else if (tileType === TILE_TYPE.FLOWER_PATCH) objectImage = this.assets.flowers;

                        if (objectImage) {
                            ctx.drawImage(objectImage, drawX, drawY, ts + 1, ts + 1);
                        }
                    }
                }
            }
        }

        // Prepare Y-sorted render list
        const renderList = [];

        // Main player
        renderList.push({
            type: 'player',
            depth: getSortDepth(mainPlayer.pixelX, mainPlayer.pixelY, 0, viewMode),
            entity: mainPlayer
        });

        // Nearby players
        if (nearbyPlayers) {
            nearbyPlayers.forEach(pState => {
                const p = new MockPlayer(pState);
                renderList.push({
                    type: 'player',
                    depth: getSortDepth(p.pixelX, p.pixelY, 0, viewMode),
                    entity: p
                });
            });
        }

        // Trees, logs, bushes as standing entities in 2.5D; only trees in 2D (matching main renderer)
        if (mapChunk) {
            for (let j = 0; j < mapChunk.grid.length; j++) {
                for (let i = 0; i < mapChunk.grid[j].length; i++) {
                    const tileType = mapChunk.grid[j][i];
                    if (tileType === TILE_TYPE.TREE ||
                        (viewMode === '2.5d' && (tileType === TILE_TYPE.LOGS || tileType === TILE_TYPE.BUSHES))) {
                        const worldX = mapChunk.origin.x + i;
                        const worldY = mapChunk.origin.y + j;

                        let typeStr = 'tree';
                        let img = this.assets.tree;
                        if (tileType === TILE_TYPE.LOGS) { typeStr = 'logs'; img = this.assets.logs; }
                        else if (tileType === TILE_TYPE.BUSHES) { typeStr = 'bushes'; img = this.assets.bushes; }

                        const baseDepth = getSortDepth(worldX, worldY, 0, viewMode);
                        let depthOffset = 0.5;
                        if (typeStr === 'logs' || typeStr === 'bushes') depthOffset = -0.25;

                        renderList.push({
                            type: typeStr,
                            depth: baseDepth + depthOffset,
                            entity: { x: worldX, y: worldY, z: 0, image: img }
                        });
                    }
                }
            }
        }

        // Sort by depth
        renderList.sort((a, b) => a.depth - b.depth);

        // Render sorted entities
        for (const item of renderList) {
            if (item.type === 'player') {
                item.entity.render(ctx, ts, cameraX, cameraY, viewMode);
            } else {
                const { x, y, z, image } = item.entity;
                if (!image || !image.complete) continue;

                const pos = project(x, y, z, viewMode, ts);
                const baseX = pos.x - cameraX;
                const baseY = pos.y - cameraY;

                if (viewMode === '2.5d') {
                    if (item.type === 'logs' || item.type === 'bushes') {
                        const spriteWidth = ts * 0.7;
                        const spriteHeight = ts * 0.55;
                        const drawX = Math.round(baseX - spriteWidth / 2);
                        // Adjust logs/bushes so they sit centered in the isometric diamond
                        const drawY = Math.round(baseY - spriteHeight * 0.5);
                        ctx.drawImage(image, drawX, drawY, spriteWidth, spriteHeight);
                    } else {
                        const spriteWidth = ts;
                        const spriteHeight = ts;
                        const drawX = Math.round(baseX - spriteWidth / 2);
                        const drawY = Math.round(baseY - spriteHeight);
                        ctx.drawImage(image, drawX, drawY, spriteWidth, spriteHeight);
                    }
                } else {
                    // 2D top-down
                    const screenX = Math.round(x * ts - cameraX);
                    const screenY = Math.round(y * ts - cameraY);
                    if (item.type === 'tree') {
                        const drawY = screenY - ts / 2; // trunk halfway up the grid cell
                        ctx.drawImage(image, screenX, drawY, ts, ts);
                    } else {
                        ctx.drawImage(image, screenX, screenY, ts, ts);
                    }
                }
            }
        }
    }
}