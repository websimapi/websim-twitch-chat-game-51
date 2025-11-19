// This file was extracted from map.js
import { TILE_TYPE } from '../map-tile-types.js';
import { project } from '../game/projection.js';

export class MapRenderer {
    constructor(map) {
        this.map = map;
        // Cached pattern for tiling the grass texture over the height mesh
        this.grassPattern = null;
        // Track the tileSize used to build the pattern so we can rebuild on zoom changes
        this.grassPatternTileSize = null;
        // Offscreen canvas used to scale the grass texture to the current tile size
        this.grassPatternCanvas = null;
    }

    getTallObjects(drawStartX, drawEndX, drawStartY, drawEndY) {
        const tallObjects = [];
        for (let j = drawStartY; j < drawEndY; j++) {
            for (let i = drawStartX; i < drawEndX; i++) {
                if (j < 0 || j >= this.map.height || i < 0 || i >= this.map.width) continue;
                const tileType = this.map.grid[j] ? this.map.grid[j][i] : TILE_TYPE.GRASS;
                const z = this.map.getHeight(i + 0.5, j + 0.5);
                
                if (tileType === TILE_TYPE.TREE) {
                    tallObjects.push({
                        type: 'tree',
                        x: i,
                        y: j,
                        z: z, 
                        image: this.map.treeTile,
                    });
                } else if (tileType === TILE_TYPE.LOGS || tileType === TILE_TYPE.BUSHES) {
                    tallObjects.push({
                         type: tileType === TILE_TYPE.LOGS ? 'logs' : 'bushes',
                         x: i,
                         y: j,
                         z: z,
                         image: tileType === TILE_TYPE.LOGS ? this.map.logsTile : this.map.bushesTile
                    });
                }
            }
        }
        return tallObjects;
    }

    renderBase(ctx, cameraX, cameraY, drawStartX, drawEndX, drawStartY, drawEndY, viewMode) {
        if (!this.map.grassTile || !this.map.grassTile.complete) return;

        ctx.save();
        
        const ts = this.map.tileSize;

        ctx.translate(-cameraX, -cameraY);

        // Ensure we have a repeating pattern for the grass texture (used in 2.5D mesh fill)
        if (viewMode === '2.5d') {
            // (Re)build pattern whenever tileSize changes so one repeat maps to one grid tile
            if (!this.grassPattern || this.grassPatternTileSize !== ts) {
                this.grassPatternTileSize = ts;

                // Create / reuse offscreen canvas sized to current tileSize
                if (!this.grassPatternCanvas) {
                    this.grassPatternCanvas = document.createElement('canvas');
                }
                const off = this.grassPatternCanvas;
                off.width = ts;
                off.height = ts;

                const offCtx = off.getContext('2d');
                // Disable smoothing for crisp pixels when scaling the source tile
                const prevSmoothing = offCtx.imageSmoothingEnabled;
                offCtx.imageSmoothingEnabled = false;
                offCtx.clearRect(0, 0, ts, ts);
                // Draw the base grass tile stretched/shrunk to exactly one grid tile
                offCtx.drawImage(this.map.grassTile, 0, 0, ts, ts);
                offCtx.imageSmoothingEnabled = prevSmoothing;

                this.grassPattern = ctx.createPattern(off, 'repeat');
            }
        }

        // Expand range slightly to cover projection overlap
        const pad = 4;
        const safeStartX = Math.max(0, drawStartX - pad);
        const safeEndX = Math.min(this.map.width, drawEndX + pad);
        const safeStartY = Math.max(0, drawStartY - pad);
        const safeEndY = Math.min(this.map.height, drawEndY + pad);

        for (let j = safeStartY; j < safeEndY; j++) {
            for (let i = safeStartX; i < safeEndX; i++) {
                // Sample height at tile center so slopes are smooth
                const h = this.map.getHeight(i + 0.5, j + 0.5);
                const tileType = this.map.grid[j][i]; // NEW: reuse tile type in both modes
                
                const pos = project(i, j, h, viewMode, ts);
                
                if (viewMode === '2.5d') {
                    // --- Render height-mapped quad with repeating grass texture ---

                    // Heights at the four grid corners of this cell
                    const h00 = this.map.getHeight(i,     j);
                    const h10 = this.map.getHeight(i + 1, j);
                    const h11 = this.map.getHeight(i + 1, j + 1);
                    const h01 = this.map.getHeight(i,     j + 1);

                    // Project the four corners
                    const p00 = project(i,     j,     h00, viewMode, ts);
                    const p10 = project(i + 1, j,     h10, viewMode, ts);
                    const p11 = project(i + 1, j + 1, h11, viewMode, ts);
                    const p01 = project(i,     j + 1, h01, viewMode, ts);

                    // Build a clip path for this height-mapped quad
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(p00.x, p00.y);
                    ctx.lineTo(p10.x, p10.y);
                    ctx.lineTo(p11.x, p11.y);
                    ctx.lineTo(p01.x, p01.y);
                    ctx.closePath();
                    ctx.clip();

                    if (this.grassPattern) {
                        // Fill with repeating grass texture; pattern cell already matches one grid tile
                        ctx.fillStyle = this.grassPattern;

                        // Conservative bounding box for this quad
                        const minX = Math.min(p00.x, p10.x, p11.x, p01.x);
                        const maxX = Math.max(p00.x, p10.x, p11.x, p01.x);
                        const minY = Math.min(p00.y, p10.y, p11.y, p01.y);
                        const maxY = Math.max(p00.y, p10.y, p11.y, p01.y);

                        const drawX = Math.floor(minX) - ts;
                        const drawY = Math.floor(minY) - ts;
                        const drawW = Math.ceil((maxX - minX) + ts * 2);
                        const drawH = Math.ceil((maxY - minY) + ts * 2);

                        ctx.fillRect(drawX, drawY, drawW, drawH);

                        // NEW: overlay flower patch texture flat on the same quad so it conforms to the slope
                        if (tileType === TILE_TYPE.FLOWER_PATCH && this.map.flowerPatchTile && this.map.flowerPatchTile.complete) {
                            // Draw flowers at a per-tile scale instead of stretching across the whole quad
                            // Position roughly at the quad center to keep them visually aligned with the tile
                            const centerX = (p00.x + p10.x + p11.x + p01.x) / 4;
                            const centerY = (p00.y + p10.y + p11.y + p01.y) / 4;
                            const flowerDrawX = Math.round(centerX - ts / 2);
                            const flowerDrawY = Math.round(centerY - ts / 2);
                            ctx.drawImage(this.map.flowerPatchTile, flowerDrawX, flowerDrawY, ts, ts);
                        }
                    } else {
                        // Fallback flat color if pattern is unavailable
                        const avgH = (h00 + h10 + h11 + h01) * 0.25;
                        const baseLight = 80;
                        const extra = Math.max(0, Math.min(20, avgH * 4));
                        const lightness = baseLight + extra;
                        ctx.fillStyle = `hsl(110, 40%, ${lightness}%)`;
                        ctx.fill();
                    }
                    ctx.restore();

                    // REMOVED OLD 2.5D flower sprite overlay here to avoid misaligned billboards

                } else {
                    // 2D
                    const drawX = i * ts;
                    const drawY = j * ts;
                    ctx.drawImage(this.map.grassTile, drawX, drawY, ts, ts);
                    if (tileType === TILE_TYPE.FLOWER_PATCH && this.map.flowerPatchTile && this.map.flowerPatchTile.complete) {
                        ctx.drawImage(this.map.flowerPatchTile, drawX, drawY, ts, ts);
                    }
                    if (tileType === TILE_TYPE.LOGS && this.map.logsTile && this.map.logsTile.complete) {
                        ctx.drawImage(this.map.logsTile, drawX, drawY, ts, ts);
                    }
                    if (tileType === TILE_TYPE.BUSHES && this.map.bushesTile && this.map.bushesTile.complete) {
                        ctx.drawImage(this.map.bushesTile, drawX, drawY, ts, ts);
                    }

                    // Very subtle height tint in 2D so terrain isn't visually flat
                    if (h > 0) {
                        const alpha = Math.min(0.4, h * 0.05);
                        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                        ctx.fillRect(drawX, drawY, ts, ts);
                    }
                }
            }
        }

        ctx.restore();
    }
}