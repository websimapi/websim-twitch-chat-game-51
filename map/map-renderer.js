// This file was extracted from map.js
import { TILE_TYPE } from '../map-tile-types.js';
import { project } from '../game/projection.js';

export class MapRenderer {
    constructor(map) {
        this.map = map;
        // Cached pattern for tiling the grass texture over the height mesh
        this.grassPattern = null;
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
            if (!this.grassPattern) {
                // Use no-repeat smoothing for crisp pixels
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                this.grassPattern = ctx.createPattern(this.map.grassTile, 'repeat');
                ctx.imageSmoothingEnabled = prevSmoothing;
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
                        // Fill with repeating grass texture; align pattern roughly to world grid
                        ctx.fillStyle = this.grassPattern;

                        // Compute a conservative bounding box in screen space for this quad
                        const minX = Math.min(p00.x, p10.x, p11.x, p01.x);
                        const maxX = Math.max(p00.x, p10.x, p11.x, p01.x);
                        const minY = Math.min(p00.y, p10.y, p11.y, p01.y);
                        const maxY = Math.max(p00.y, p10.y, p11.y, p01.y);

                        // Offset the fill rect so pattern phase is stable between tiles
                        // Use projected position of the tile origin at z=0 as a reference
                        const base = project(i, j, 0, viewMode, ts);
                        const phaseX = base.x % ts;
                        const phaseY = base.y % (ts * 0.5); // iso tiles are shorter vertically

                        const drawX = Math.floor(minX - phaseX - ts);
                        const drawY = Math.floor(minY - phaseY - ts);
                        const drawW = Math.ceil((maxX - minX) + ts * 3);
                        const drawH = Math.ceil((maxY - minY) + ts * 3);

                        ctx.fillRect(drawX, drawY, drawW, drawH);
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

                    // Overlay flowers on top of the sloped ground
                    const tileType = this.map.grid[j][i];
                    if (tileType === TILE_TYPE.FLOWER_PATCH && this.map.flowerPatchTile && this.map.flowerPatchTile.complete) {
                        const centerPos = project(i + 0.5, j + 0.5, h, viewMode, ts);
                        const spriteSize = ts * 0.75;
                        const drawX = centerPos.x - spriteSize / 2;
                        const drawY = centerPos.y - spriteSize / 2;
                        ctx.drawImage(this.map.flowerPatchTile, drawX, drawY, spriteSize, spriteSize);
                    }

                } else {
                    // 2D
                    const drawX = i * ts;
                    const drawY = j * ts;
                    ctx.drawImage(this.map.grassTile, drawX, drawY, ts, ts);
                    const tileType = this.map.grid[j][i];
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