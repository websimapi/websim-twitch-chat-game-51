import { TILE_TYPE } from './map-tile-types.js';
import { MapFinder } from './map/map-finder.js';
import { MapRenderer } from './map/map-renderer.js';

export class Map {
    constructor(tileSize) {
        this.width = 256;
        this.height = 256;
        this.tileSize = tileSize;
        this.grassTile = null;
        this.treeTile = null;
        this.logsTile = null;
        this.bushesTile = null;
        this.flowerPatchTile = null;
        this.dirtTile = null; // New dirt asset
        this.grid = [];
        this.heightGrid = []; // New height grid
        this.treeRespawns = [];
        this.viewportWidth = 0;
        this.viewportHeight = 0;

        // Refactored helpers
        this.finder = new MapFinder(this);
        this.renderer = new MapRenderer(this);

        // Alias methods for backward compatibility
        this.findAll = this.finder.findAll.bind(this.finder);
        this.findAllInRadius = this.finder.findAllInRadius.bind(this.finder);
        this.findNearest = this.finder.findNearest.bind(this.finder);
        this.findNearestInRadius = this.finder.findNearestInRadius.bind(this.finder);
        this.getTallObjects = this.renderer.getTallObjects.bind(this.renderer);
        this.renderBase = this.renderer.renderBase.bind(this.renderer);
    }

    setViewport(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
    }

    setTileSize(size) {
        this.tileSize = size;
    }

    async loadAssets(overrides = {}) {
        const loadTile = (src) => new Promise((resolve) => {
            const img = new Image();
            // If cross-origin issues arise with user uploads, might need: img.crossOrigin = "Anonymous";
            img.crossOrigin = "Anonymous"; 
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.error(`Failed to load image: ${src}`);
                resolve(null); // Resolve with null so Promise.all doesn't fail completely
            };
        });

        const assets = {
            grass: overrides.grass || './grass_tile.png',
            tree: overrides.tree || './tree.png',
            logs: overrides.logs || './logs.png',
            bushes: overrides.bushes || './bushes.png',
            flowers: overrides.flowers || './flowers.png',
            dirt: overrides.dirt || './dirt.png'
        };

        await Promise.all([
            loadTile(assets.grass).then(img => this.grassTile = img),
            loadTile(assets.tree).then(img => this.treeTile = img),
            loadTile(assets.logs).then(img => this.logsTile = img),
            loadTile(assets.bushes).then(img => this.bushesTile = img),
            loadTile(assets.flowers).then(img => this.flowerPatchTile = img),
            loadTile(assets.dirt).then(img => this.dirtTile = img)
        ]);
        
        console.log("Map assets loaded with overrides:", overrides);
    }
    
    _generateTrees(grid) {
        const TREE_CHANCE = 1 / 16;
        for (let j = 0; j < this.height; j++) {
            for (let i = 0; i < this.width; i++) {
                // Only place on grass
                if (grid[j][i] === TILE_TYPE.GRASS && Math.random() < TREE_CHANCE) {
                    grid[j][i] = TILE_TYPE.TREE;
                }
            }
        }
    }

    _generateFlowers(grid) {
        const FLOWER_CLUSTER_CHANCE = 1 / 32;
        for (let j = 0; j < this.height; j++) {
            for (let i = 0; i < this.width; i++) {
                // Only place on grass
                if (grid[j][i] === TILE_TYPE.GRASS && Math.random() < FLOWER_CLUSTER_CHANCE) {
                    const clusterSize = 2 + Math.floor(Math.random() * 2); // 2x2 or 3x3 area
                    for (let cj = -Math.floor(clusterSize / 2); cj < Math.ceil(clusterSize / 2); cj++) {
                        for (let ci = -Math.floor(clusterSize / 2); ci < Math.ceil(clusterSize / 2); ci++) {
                            const tileX = i + ci;
                            const tileY = j + cj;
                            if (tileX >= 0 && tileX < this.width && tileY >= 0 && tileY < this.height && grid[tileY][tileX] === TILE_TYPE.GRASS) {
                                if (Math.random() < 0.7) { // 70% chance for a flower patch within the cluster area
                                    grid[tileY][tileX] = TILE_TYPE.FLOWER_PATCH;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    generateMap() {
        console.log(`Generating map of size ${this.width}x${this.height}.`);
        this.grid = [];
        this.heightGrid = [];
        for (let j = 0; j < this.height; j++) {
            this.grid[j] = [];
            this.heightGrid[j] = [];
            for (let i = 0; i < this.width; i++) {
                this.grid[j][i] = TILE_TYPE.GRASS;
                // Initialize height to 0 as a float so terrain generation can fill with smooth values
                this.heightGrid[j][i] = 0;
            }
        }
        this._generateTrees(this.grid);
        this._generateFlowers(this.grid);
    }
    
    getHeight(x, y) {
        // Bilinear interpolation over heightGrid so we get smooth slopes
        if (!this.heightGrid || this.heightGrid.length === 0) return 0;

        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        // Clamp indices to valid range
        const clampX = (v) => Math.max(0, Math.min(this.width - 1, v));
        const clampY = (v) => Math.max(0, Math.min(this.height - 1, v));

        const cx0 = clampX(x0);
        const cx1 = clampX(x1);
        const cy0 = clampY(y0);
        const cy1 = clampY(y1);

        const h00 = this.heightGrid[cy0] && this.heightGrid[cy0][cx0] != null ? this.heightGrid[cy0][cx0] : 0;
        const h10 = this.heightGrid[cy0] && this.heightGrid[cy0][cx1] != null ? this.heightGrid[cy0][cx1] : h00;
        const h01 = this.heightGrid[cy1] && this.heightGrid[cy1][cx0] != null ? this.heightGrid[cy1][cx0] : h00;
        const h11 = this.heightGrid[cy1] && this.heightGrid[cy1][cx1] != null ? this.heightGrid[cy1][cx1] : h00;

        const fx = Math.max(0, Math.min(1, x - x0));
        const fy = Math.max(0, Math.min(1, y - y0));

        const h0 = h00 + (h10 - h00) * fx;
        const h1 = h01 + (h11 - h01) * fx;
        const h = h0 + (h1 - h0) * fy;

        return h || 0;
    }

    regenerateTrees() {
        // Clear existing trees
        for (let j = 0; j < this.height; j++) {
            for (let i = 0; i < this.width; i++) {
                if (this.grid[j][i] === TILE_TYPE.TREE) {
                    this.grid[j][i] = TILE_TYPE.GRASS;
                }
            }
        }
        // Generate new ones
        this._generateTrees(this.grid);
        console.log("Trees have been regenerated.");
    }
    
    regenerateFlowers() {
        // Clear existing flowers
        for (let j = 0; j < this.height; j++) {
            for (let i = 0; i < this.width; i++) {
                if (this.grid[j][i] === TILE_TYPE.FLOWER_PATCH) {
                    this.grid[j][i] = TILE_TYPE.GRASS;
                }
            }
        }
        // Generate new ones
        this._generateFlowers(this.grid);
        console.log("Flowers have been regenerated.");
    }

    cutTree(x, y) {
        this.grid[y][x] = TILE_TYPE.LOGS;
        this.scheduleTreeRespawn(x, y);
    }

    scheduleTreeRespawn(originalX, originalY, isRetry = false) {
        const MIN_RESPAWN_MS = 5 * 60 * 1000; // 5 minutes
        const MAX_RESPAWN_MS = 60 * 60 * 1000; // 1 hour
        const respawnTime = Date.now() + MIN_RESPAWN_MS + Math.random() * (MAX_RESPAWN_MS - MIN_RESPAWN_MS);

        this.treeRespawns.push({ originalX, originalY, respawnTime });
        if (!isRetry) {
             console.log(`Tree at (${originalX}, ${originalY}) will respawn around ${new Date(respawnTime).toLocaleTimeString()}`);
        } else {
             console.log(`Tree respawn for (${originalX}, ${originalY}) failed, retrying around ${new Date(respawnTime).toLocaleTimeString()}`);
        }
    }

    update(players) {
        const now = Date.now();
        const respawnsToProcess = this.treeRespawns.filter(r => now >= r.respawnTime);

        if (respawnsToProcess.length > 0) {
            this.treeRespawns = this.treeRespawns.filter(r => now < r.respawnTime);

            for (const respawn of respawnsToProcess) {
                let spawned = false;
                const RADIUS = 8;
                const ATTEMPTS = 20;

                for (let i = 0; i < ATTEMPTS; i++) {
                    const angle = Math.random() * 2 * Math.PI;
                    const distance = Math.random() * RADIUS;
                    const newX = Math.round(respawn.originalX + Math.cos(angle) * distance);
                    const newY = Math.round(respawn.originalY + Math.sin(angle) * distance);

                    if (newX < 0 || newX >= this.width || newY < 0 || newY >= this.height) {
                        continue;
                    }

                    const isOccupiedByTree = this.grid[newY][newX] === TILE_TYPE.TREE;
                    const isOccupiedByPlayer = Array.from(players.values()).some(p => Math.round(p.pixelX) === newX && Math.round(p.pixelY) === newY);

                    if (!isOccupiedByTree && !isOccupiedByPlayer) {
                        this.grid[newY][newX] = TILE_TYPE.TREE;
                        console.log(`Tree respawned at (${newX}, ${newY}) from original location (${respawn.originalX}, ${respawn.originalY})`);
                        spawned = true;
                        break;
                    }
                }

                if (!spawned) {
                    this.scheduleTreeRespawn(respawn.originalX, respawn.originalY, true);
                }
            }
        }
    }
    
    isColliding(gridX, gridY) {
        // Check map bounds
        if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) {
            return true; 
        }
        
        // 1 means Tree/Obstacle. For pathfinding, the whole tile is an obstacle.
        return this.grid[gridY][gridX] === TILE_TYPE.TREE;
    }

    isPixelColliding(pixelX, pixelY) {
        // This function is obsolete and will be replaced by the new physics engine.
        // Keeping it for now to avoid breaking other parts, but it should not be used for movement.
        const gridX = Math.floor(pixelX);
        const gridY = Math.floor(pixelY);
        const tileYOffset = pixelY - gridY;
    
        if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) {
            return true;
        }
    
        const tileType = this.grid[gridY][gridX];
    
        if (tileType === TILE_TYPE.TREE) {
            // Legacy collision: bottom 40%
            return tileYOffset > 0.6;
        }
    
        return false;
    }

    getChunk(centerX, centerY, radius) {
        const chunk = [];
        const heightChunk = [];
        const startX = Math.floor(centerX - radius);
        const endX = Math.ceil(centerX + radius);
        const startY = Math.floor(centerY - radius);
        const endY = Math.ceil(centerY + radius);

        for (let j = startY; j <= endY; j++) {
            const row = [];
            const heightRow = [];
            for (let i = startX; i <= endX; i++) {
                if (j < 0 || j >= this.height || i < 0 || i >= this.width) {
                    row.push(null); // Out of bounds
                    heightRow.push(0);
                } else {
                    row.push(this.grid[j][i]);
                    heightRow.push(this.getHeight(i, j)); // Capture exact height at grid center/corner
                }
            }
            chunk.push(row);
            heightChunk.push(heightRow);
        }
        return {
            grid: chunk,
            heightGrid: heightChunk,
            origin: { x: startX, y: startY }
        };
    }

    render(ctx, cameraX, cameraY) {
        if (!this.grassTile || !this.grassTile.complete) return;

        ctx.save();
        
        // Calculate the drawing offset based on camera position
        // This translation effectively shifts the world according to the camera view
        ctx.translate(-cameraX, -cameraY);

        const ts = this.tileSize;
        
        // Calculate visible tile range in grid coordinates
        // cameraX/Y can be negative if the map is centered and smaller than viewport
        const startTileX = Math.floor(cameraX / ts);
        const endTileX = Math.ceil((cameraX + this.viewportWidth) / ts);
        const startTileY = Math.floor(cameraY / ts);
        const endTileY = Math.ceil((cameraY + this.viewportHeight) / ts);

        // Clamp tile indices to map boundaries (0 to width/height)
        const drawStartX = Math.max(0, startTileX);
        const drawEndX = Math.min(this.width, endTileX);
        const drawStartY = Math.max(0, startTileY);
        const drawEndY = Math.min(this.height, endTileY);

        // Iterate and draw grass tiles only for visible grid spots
        for (let i = drawStartX; i < drawEndX; i++) {
            for (let j = drawStartY; j < drawEndY; j++) {
                ctx.drawImage(
                    this.grassTile,
                    i * ts,
                    j * ts,
                    ts,
                    ts
                );
                
                // Check and draw obstacle/object
                const tileType = this.grid[j] ? this.grid[j][i] : TILE_TYPE.GRASS;
                let objectImage = null;

                switch(tileType) {
                    case TILE_TYPE.TREE: objectImage = this.treeTile; break;
                    case TILE_TYPE.LOGS: objectImage = this.logsTile; break;
                    case TILE_TYPE.BUSHES: objectImage = this.bushesTile; break;
                    case TILE_TYPE.FLOWER_PATCH: objectImage = this.flowerPatchTile; break;
                }
                
                if (objectImage && objectImage.complete) {
                     // For 2D legacy render, lift trees by half a tile so trunk is halfway up the grid cell
                     const drawX = i * ts;
                     const drawY = tileType === TILE_TYPE.TREE ? (j * ts - ts / 2) : (j * ts);
                     ctx.drawImage(
                        objectImage,
                        drawX,
                        drawY,
                        ts,
                        ts
                    );
                }
            }
        }

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Subtle grid lines
        ctx.lineWidth = 1;

        // Draw visible vertical lines
        for (let i = drawStartX; i <= drawEndX; i++) {
            if (i > this.width) continue; 
            const x = i * ts;
            ctx.beginPath();
            ctx.moveTo(x, drawStartY * ts);
            ctx.lineTo(x, drawEndY * ts);
            ctx.stroke();
        }

        // Draw visible horizontal lines
        for (let j = drawStartY; j <= drawEndY; j++) {
            if (j > this.height) continue;
            const y = j * ts;
            ctx.beginPath();
            ctx.moveTo(drawStartX * ts, y);
            ctx.lineTo(drawEndX * ts, y);
            ctx.stroke();
        }
        
        ctx.restore();
    }
}