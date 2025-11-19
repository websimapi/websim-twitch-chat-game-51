// This file was extracted from map.js

export class MapFinder {
    constructor(map) {
        this.map = map;
    }

    findAll(tileTypes) {
        if (!Array.isArray(tileTypes)) tileTypes = [tileTypes];
        const locations = [];
        for (let j = 0; j < this.map.height; j++) {
            for (let i = 0; i < this.map.width; i++) {
                const tileType = this.map.grid[j][i];
                if (tileTypes.includes(tileType)) {
                    locations.push({ x: i, y: j, type: tileType });
                }
            }
        }
        return locations;
    }

    findAllInRadius(x, y, tileTypes, radius) {
        if (!Array.isArray(tileTypes)) tileTypes = [tileTypes];
        const locations = [];

        const startX = Math.max(0, Math.floor(x - radius));
        const endX = Math.min(this.map.width - 1, Math.ceil(x + radius));
        const startY = Math.max(0, Math.floor(y - radius));
        const endY = Math.min(this.map.height - 1, Math.ceil(y + radius));
        const radiusSq = radius * radius;

        for (let j = startY; j <= endY; j++) {
            for (let i = startX; i <= endX; i++) {
                const tileType = this.map.grid[j][i];
                if (tileTypes.includes(tileType)) {
                    const dx = i - x;
                    const dy = j - y;
                    if (dx * dx + dy * dy <= radiusSq) {
                        locations.push({ x: i, y: j, type: tileType });
                    }
                }
            }
        }
        return locations;
    }

    findNearest(x, y, tileType) {
        let nearest = null;
        let minDistance = Infinity;

        for (let j = 0; j < this.map.height; j++) {
            for (let i = 0; i < this.map.width; i++) {
                if (this.map.grid[j][i] === tileType) {
                    const dx = i - x;
                    const dy = j - y;
                    const distance = dx * dx + dy * dy; // Use squared distance for efficiency
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearest = { x: i, y: j };
                    }
                }
            }
        }
        return nearest;
    }

    findNearestInRadius(x, y, tileTypes, radius) {
        let nearest = null;
        let minDistance = Infinity;

        const startX = Math.max(0, Math.floor(x - radius));
        const endX = Math.min(this.map.width - 1, Math.ceil(x + radius));
        const startY = Math.max(0, Math.floor(y - radius));
        const endY = Math.min(this.map.height - 1, Math.ceil(y + radius));

        for (let j = startY; j <= endY; j++) {
            for (let i = startX; i <= endX; i++) {
                const tileType = this.map.grid[j][i];
                if (tileTypes.includes(tileType)) {
                    const dx = i - x;
                    const dy = j - y;
                    const distance = dx * dx + dy * dy;
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearest = { x: i, y: j, type: tileType };
                    }
                }
            }
        }
        return nearest;
    }
}