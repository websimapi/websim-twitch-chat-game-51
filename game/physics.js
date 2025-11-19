import { TILE_TYPE } from '../map-tile-types.js';

// --- Hitbox Definitions (in tile units) ---

// Player hitbox: A circle.
const PLAYER_HITBOX_RADIUS = 1 / 2.5; // ~0.4 tile units, from player-renderer.js

export function getPlayerHitbox(player) {
    return {
        // circle
        x: player.pixelX + player.offsetX,
        y: player.pixelY + player.offsetY,
        radius: PLAYER_HITBOX_RADIUS
    };
}

export function getTreeTrunkHitbox(tileX, tileY) {
    return {
        x: tileX + 0.5,
        y: tileY + 0.5, // Centered within the tile for accurate isometric alignment
        radius: 0.2
    };
}


// --- Collision Detection ---

/**
 * Basic AABB collision check.
 * @param {object} rect1 - { x, y, width, height }
 * @param {object} rect2 - { x, y, width, height }
 * @returns {boolean} - True if the rectangles overlap.
 */
function checkAABBCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

export function checkCircleCollision(c1, c2) {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    const distSq = dx * dx + dy * dy;
    const radii = c1.radius + c2.radius;
    return distSq < radii * radii;
}

export function checkCircleRectCollision(circle, rect) {
    // Find the closest point on the rect to the circle's center
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

    // Calculate the distance between the circle's center and this closest point
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    const distanceSquared = (dx * dx) + (dy * dy);

    // If the distance is less than the circle's radius squared, they are colliding
    return distanceSquared < (circle.radius * circle.radius);
}

/**
 * Checks a given rectangular hitbox against all solid objects in the world.
 * @param {object} rect - The hitbox to check { x, y, width, height }.
 * @param {GameMap} gameMap - The game map instance.
 * @returns {boolean} - True if a collision is detected.
 */
export function checkWorldCollision(hitbox, gameMap) {
    const isCircle = hitbox.radius !== undefined;

    // Collision with steep terrain
    // We check the tile centers covered by the hitbox.
    // If any covered tile has a height diff > 1 compared to the hitbox center's tile, it's a wall.
    
    // Rough center of hitbox
    const cx = hitbox.x + (hitbox.width ? hitbox.width/2 : 0);
    const cy = hitbox.y + (hitbox.height ? hitbox.height/2 : 0);
    const currentH = gameMap.getHeight(cx, cy);

    const rect = isCircle ? {
        x: hitbox.x - hitbox.radius,
        y: hitbox.y - hitbox.radius,
        width: hitbox.radius * 2,
        height: hitbox.radius * 2,
    } : hitbox;

    const startX = Math.floor(rect.x);
    const endX = Math.ceil(rect.x + rect.width);
    const startY = Math.floor(rect.y);
    const endY = Math.ceil(rect.y + rect.height);

    for (let j = startY; j < endY; j++) {
        for (let i = startX; i < endX; i++) {
            if (i < 0 || i >= gameMap.width || j < 0 || j >= gameMap.height) {
                return true; // Map bounds
            }
            
            // Height check
            const tileH = gameMap.getHeight(i, j);
            if (Math.abs(tileH - currentH) > 1.5) { // Tolerance 1.5 allows step up 1
                // We treat this tile as solid
                // Standard AABB vs Tile check
                const tileRect = { x: i, y: j, width: 1, height: 1 };
                if (isCircle) {
                     if (checkCircleRectCollision({x: i+0.5, y: j+0.5, radius: 0.7}, rect)) { // Approximate tile as circle/rect?
                        // Simpler: Check collision with the tile square
                        // checkCircleRectCollision logic helper
                        const closestX = Math.max(i, Math.min(hitbox.x, i + 1));
                        const closestY = Math.max(j, Math.min(hitbox.y, j + 1));
                        const dx = hitbox.x - closestX;
                        const dy = hitbox.y - closestY;
                        if ((dx*dx + dy*dy) < (hitbox.radius*hitbox.radius)) return true;
                     }
                } else {
                    // Rect vs Rect
                    // Already overlapping due to loop range, so yes collision
                    return true;
                }
            }

            if (gameMap.grid[j][i] === TILE_TYPE.TREE) {
                const treeHitbox = getTreeTrunkHitbox(i, j);
                if (isCircle) {
                    if (checkCircleCollision(hitbox, treeHitbox)) {
                        return true;
                    }
                } else {
                    // Rect hitbox vs Circle tree
                    // checkCircleRectCollision expects (circle, rect)
                    if (checkCircleRectCollision(treeHitbox, hitbox)) {
                        return true; // Collision detected
                    }
                }
            }
        }
    }

    return false; // No collision
}