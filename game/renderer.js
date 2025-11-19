import { PLAYER_STATE } from '../player-state.js';
import { AudioManager } from '../audio-manager.js';
import { getPlayerHitbox, getTreeTrunkHitbox } from '../game/physics.js';
import { TILE_TYPE } from '../map-tile-types.js';
import { project, getSortDepth } from '../game/projection.js';

function getVisibleTileRange(camera, canvas, map, viewMode) {
    const ts = map.tileSize;
    
    if (viewMode === '2.5d') {
        // Simple heuristic: Expand range significantly to cover rotation/skew
        // Center tile
        const centerX = (camera.x + canvas.width/2); // Screen coord relative to world 0,0? No camera.x IS the offset.
        // Inverse projection is complex. Let's just return a large box around the approximate center.
        // Since camera.x/y are somewhat arbitrary in 2.5D mode without the center offset logic being perfectly strictly defined 
        // (we defined camera as top-left of viewport for 2d), we need to be careful.
        
        // Approximation:
        // Get rough center in world units
        const centerX_Screen = camera.x + canvas.width / 2;
        const centerY_Screen = camera.y + canvas.height / 2;
        
        // Map to Grid:
        // x_scr = (x-y)*0.5*ts => x-y = x_scr / (0.5*ts)
        // y_scr = (x+y)*0.25*ts => x+y = y_scr / (0.25*ts)
        // 2x = (x_scr/0.5ts) + (y_scr/0.25ts)
        const factorX = centerX_Screen / (0.5 * ts);
        const factorY = centerY_Screen / (0.25 * ts);
        const gridCenterX = (factorX + factorY) / 2;
        const gridCenterY = (factorY - factorX) / 2; // Approx
        
        const radius = Math.ceil(canvas.width / ts) + 5; // Generous radius
        
        return {
            drawStartX: Math.max(0, Math.floor(gridCenterX - radius)),
            drawEndX: Math.min(map.width, Math.ceil(gridCenterX + radius)),
            drawStartY: Math.max(0, Math.floor(gridCenterY - radius)),
            drawEndY: Math.min(map.height, Math.ceil(gridCenterY + radius))
        };
    }

    const startTileX = Math.floor(camera.x / ts);
    const endTileX = Math.ceil((camera.x + canvas.width) / ts);
    const startTileY = Math.floor(camera.y / ts);
    const endTileY = Math.ceil((camera.y + canvas.height) / ts);

    const drawStartX = Math.max(0, startTileX);
    const drawEndX = Math.min(map.width, endTileX);
    const drawStartY = Math.max(0, startTileY);
    const drawEndY = Math.min(map.height, endTileY);

    return { drawStartX, drawEndX, drawStartY, drawEndY };
}

function renderTargetHighlights(ctx, players, camera, tileSize, settings, map) {
    if (!(settings.visuals && settings.visuals.show_target_indicator)) return;
    const viewMode = settings.visuals.view_mode || '2d';

    ctx.save();
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    
    const alpha = (Math.sin(performance.now() / 250) + 1) / 2 * 0.6 + 0.4; 
    
    const woodcuttingStates = [PLAYER_STATE.MOVING_TO_TREE, PLAYER_STATE.CHOPPING];
    const gatheringStates = [
        PLAYER_STATE.MOVING_TO_LOGS,
        PLAYER_STATE.HARVESTING_LOGS,
        PLAYER_STATE.MOVING_TO_BUSHES,
        PLAYER_STATE.HARVESTING_BUSHES
    ];

    for (const player of players.values()) {
        let indicatorColor = null;

        if (woodcuttingStates.includes(player.state)) {
            ctx.shadowColor = 'rgba(255, 255, 100, 0.8)';
            indicatorColor = `rgba(255, 255, 100, ${alpha})`;
        } else if (gatheringStates.includes(player.state)) {
            ctx.shadowColor = 'rgba(100, 220, 255, 0.8)';
            indicatorColor = `rgba(100, 220, 255, ${alpha})`;
        }
        
        if (indicatorColor && player.actionTarget) {
            const targetX = player.actionTarget.x;
            const targetY = player.actionTarget.y;

            if (viewMode === '2.5d') {
                // Use the isometric center of the tile with the actual terrain height
                const h = map ? map.getHeight(targetX + 0.5, targetY + 0.5) : 0;
                const centerPos = project(targetX + 0.5, targetY + 0.5, h, viewMode, tileSize);
                const screenCX = centerPos.x - camera.x;
                const screenCY = centerPos.y - camera.y;

                // Diamond sized to the isometric tile footprint
                const halfWidth = tileSize * 0.5;   // horizontal extent
                const halfHeight = tileSize * 0.25; // vertical extent (matches projection ratios)

                // Visibility check with a small margin
                if (
                    screenCX > -halfWidth * 2 && screenCX < ctx.canvas.width + halfWidth * 2 &&
                    screenCY > -halfHeight * 2 && screenCY < ctx.canvas.height + halfHeight * 2
                ) {
                    ctx.strokeStyle = indicatorColor;
                    ctx.beginPath();
                    ctx.moveTo(screenCX + halfWidth,  screenCY);            // Right
                    ctx.lineTo(screenCX,             screenCY + halfHeight); // Bottom
                    ctx.lineTo(screenCX - halfWidth, screenCY);              // Left
                    ctx.lineTo(screenCX,             screenCY - halfHeight); // Top
                    ctx.closePath();
                    ctx.stroke();
                }
            } else {
                // 2D top-down: use tile's top-left corner
                const pos = project(targetX, targetY, 0, viewMode, tileSize);
                const screenX = pos.x - camera.x;
                const screenY = pos.y - camera.y;

                if (screenX > -tileSize * 2 && screenX < ctx.canvas.width + tileSize * 2 &&
                    screenY > -tileSize * 2 && screenY < ctx.canvas.height + tileSize * 2) {

                    ctx.strokeStyle = indicatorColor;
                    ctx.strokeRect(screenX + 1, screenY + 1, tileSize - 2, tileSize - 2);
                }
            }
        }
    }
    ctx.restore();
}

function renderYSorted(ctx, players, map, drawStartX, drawEndX, drawStartY, drawEndY, tileSize, camera, settings) {
    const renderList = [];
    const viewMode = settings.visuals.view_mode || '2d';

    // 1. Add players to render list
    for (const player of players.values()) {
        if (player.isPowered()) {
            renderList.push({
                type: 'player',
                // In 2.5D, Z-sort is based on diagonal depth (x+y).
                // project() doesn't return depth, so we calculate sort key manually.
                depth: getSortDepth(player.pixelX, player.pixelY, 0, viewMode),
                entity: player,
            });
        }
    }
    
    // 2. Add tall map objects (trees) and objects that should "stand up" in 2.5D (logs, bushes)
    // In 2D mode, logs/bushes are drawn in renderBase (flat). In 2.5D, we draw them here (standing).
    
    const shouldStandUp = (tileType) => {
        if (viewMode === '2.5d') {
            return tileType === TILE_TYPE.TREE || tileType === TILE_TYPE.LOGS || tileType === TILE_TYPE.BUSHES;
        }
        return tileType === TILE_TYPE.TREE;
    };

    for (let j = drawStartY; j < drawEndY; j++) {
        for (let i = drawStartX; i < drawEndX; i++) {
            if (j < 0 || j >= map.height || i < 0 || i >= map.width) continue;
            const tileType = map.grid[j] ? map.grid[j][i] : TILE_TYPE.GRASS;
            
            if (shouldStandUp(tileType)) {
                let typeStr = 'tree';
                let img = map.treeTile;
                if (tileType === TILE_TYPE.LOGS) { typeStr = 'logs'; img = map.logsTile; }
                else if (tileType === TILE_TYPE.BUSHES) { typeStr = 'bushes'; img = map.bushesTile; }

                const z = map.getHeight(i, j);
                const entity = {
                    x: i,
                    y: j,
                    z: z,
                    image: img
                };

                let depthOffset = 0.5; // default for tall trees

                // Ground items like logs and bushes should be behind players on the same tile
                if (typeStr === 'logs' || typeStr === 'bushes') {
                     depthOffset = 0.0; 
                }
                
                renderList.push({
                    type: typeStr,
                    // Sort using the object's Z
                    depth: getSortDepth(i, j, z, viewMode) + depthOffset,
                    entity: entity
                });
            }
        }
    }
    
    // 3. Sort the list by depth
    renderList.sort((a, b) => a.depth - b.depth);

    // 4. Render from the sorted list
    for (const item of renderList) {
        if (item.type === 'player') {
            item.entity.render(ctx, tileSize, camera.x, camera.y, viewMode);
        } else {
            const { x, y, z, image } = item.entity;
             if (image && image.complete) {
                const pos = project(x, y, z, viewMode, tileSize);
                const screenX = Math.round(pos.x - camera.x);
                const screenY = Math.round(pos.y - camera.y);
                
                if (viewMode === '2.5d') {
                    // Draw standing up. Anchor at bottom center of tile.
                    const centerPos = project(x + 0.5, y + 0.5, z, viewMode, tileSize);
                    const baseX = centerPos.x - camera.x;
                    const baseY = centerPos.y - camera.y;

                    if (item.type === 'logs' || item.type === 'bushes') {
                        // Smaller footprint so they fit inside the isometric diamond
                        const spriteWidth = tileSize * 0.7;
                        const spriteHeight = tileSize * 0.55;
                        const drawX = Math.round(baseX - spriteWidth / 2);
                        // Adjust logs/bushes so they sit centered in the isometric diamond
                        const drawY = Math.round(baseY - spriteHeight * 0.5);
                        ctx.drawImage(image, drawX, drawY, spriteWidth, spriteHeight);
                    } else {
                        // Trees: full height but still anchored to tile center
                        const spriteWidth = tileSize;
                        const spriteHeight = tileSize;
                        const drawX = Math.round(baseX - spriteWidth / 2);
                        const drawY = Math.round(baseY - spriteHeight);
                        ctx.drawImage(image, drawX, drawY, spriteWidth, spriteHeight);
                    }
                } else {
                    // 2D
                    if (item.type === 'tree') {
                        // Offset tree upward by half a tile so trunk sits halfway up the grid cell
                        const drawY = screenY - tileSize / 2;
                        ctx.drawImage(image, screenX, drawY, tileSize, tileSize);
                    } else {
                        ctx.drawImage(image, screenX, screenY, tileSize, tileSize);
                    }
                }
            }
        }
    }
}

// Hitboxes and path lines follow similar projection logic updates
function renderHitboxes(ctx, players, map, camera, settings) {
    if (!settings.visuals || !settings.visuals.show_hitboxes) return;
    const viewMode = settings.visuals.view_mode || '2d';

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 1;

    const tileSize = map.tileSize;

    // Transform context to map coordinates relative to camera
    const snappedCameraX = Math.round(camera.x);
    const snappedCameraY = Math.round(camera.y);
    ctx.translate(-snappedCameraX, -snappedCameraY);

    if (viewMode === '2.5d') {
        // Apply isometric ground transform: maps flat grid coordinates to isometric screen coordinates
        // This squashes and rotates the coordinate system so drawing a circle results in a floor-aligned ellipse
        ctx.transform(0.5, 0.25, -0.5, 0.25, 0, 0);
    }

    // --- Player hitboxes ---
    for (const player of players.values()) {
        if (!player.isPowered()) continue;
        const hitbox = getPlayerHitbox(player);

        ctx.beginPath();
        // Draw circle in flat coordinates; transform handles the view projection
        ctx.arc(hitbox.x * tileSize, hitbox.y * tileSize, hitbox.radius * tileSize, 0, Math.PI * 2);
        ctx.stroke();
    }

    // --- Tree hitboxes (rectangles) ---
    // Compute visible tile range so we only iterate trees that can be on screen
    const { drawStartX, drawEndX, drawStartY, drawEndY } = getVisibleTileRange(
        camera,
        ctx.canvas,
        map,
        viewMode
    );

    for (let j = drawStartY; j < drawEndY; j++) {
        for (let i = drawStartX; i < drawEndX; i++) {
            if (j < 0 || j >= map.height || i < 0 || i >= map.width) continue;
            if (map.grid[j][i] !== TILE_TYPE.TREE) continue;

            const trunk = getTreeTrunkHitbox(i, j);
            
            ctx.beginPath();
            // Draw circle in flat coordinates; transform handles the view projection
            ctx.arc(trunk.x * tileSize, trunk.y * tileSize, trunk.radius * tileSize, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function renderPathingLines(ctx, players, camera, map, settings) {
    if (!settings.visuals || !settings.visuals.show_pathing_lines) return;
    const viewMode = settings.visuals.view_mode || '2d';

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const tileSize = map.tileSize;
    
    const isMovingState = (state) => {
        return state.startsWith('moving_to') || state === PLAYER_STATE.FOLLOWING;
    };

    for (const player of players.values()) {
        if (!player.isPowered() || !player.path || player.path.length === 0 || !isMovingState(player.state)) continue;

        const pathColor = player.color || '#FFFFFF';
        ctx.strokeStyle = pathColor;
        ctx.globalAlpha = 0.8;

        ctx.beginPath();

        // Player center
        const pPos = project(player.pixelX + player.offsetX, player.pixelY + player.offsetY, 0, viewMode, tileSize);
        ctx.moveTo(pPos.x - camera.x, pPos.y - camera.y);

        for (const waypoint of player.path) {
            const wPos = project(waypoint.x + 0.5, waypoint.y + 0.5, 0, viewMode, tileSize);
            ctx.lineTo(wPos.x - camera.x, wPos.y - camera.y);
        }

        ctx.stroke();
    }

    ctx.restore();
}

export function renderGame(game) {
    const { ctx, canvas, camera, map, players, settings } = game;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tileSize = map.tileSize;
    const viewMode = settings.visuals.view_mode || '2d';
    
    const listenerX = camera.x + canvas.width / 2;
    const listenerY = camera.y + canvas.height / 2;
    AudioManager.setListenerPosition(listenerX, listenerY, tileSize);
    
    const { drawStartX, drawEndX, drawStartY, drawEndY } = getVisibleTileRange(camera, canvas, map, viewMode);
    
    map.renderBase(ctx, camera.x, camera.y, drawStartX, drawEndX, drawStartY, drawEndY, viewMode);

    renderTargetHighlights(ctx, players, camera, tileSize, settings, map);

    renderYSorted(ctx, players, map, drawStartX, drawEndX, drawStartY, drawEndY, tileSize, camera, settings);

    renderHitboxes(ctx, players, map, camera, settings);
    renderPathingLines(ctx, players, camera, map, settings);
}