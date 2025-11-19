export function project(x, y, z, mode, tileSize) {
    if (mode === '2.5d') {
        // Isometric projection
        // x and y are grid coordinates (floats)
        // z is height (grid units)

        const isoX = (x - y) * tileSize * 0.5;
        const isoY = (x + y) * tileSize * 0.25;

        // Adjust for height (z)
        // In standard iso, z goes up (negative y on screen)
        const zOffset = z * tileSize * 0.5;

        return {
            x: isoX,
            y: isoY - zOffset
        };
    }

    // 2D Top-down
    return {
        x: x * tileSize,
        y: y * tileSize
    };
}

export function getSortDepth(x, y, z, mode) {
    if (mode === '2.5d') {
        // In isometric, depth is determined by diagonal distance
        return x + y + z; // Z usually affects occlusion order too
    }
    return y; // Top-down sorting
}