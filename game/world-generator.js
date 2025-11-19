import * as StorageManager from '../storage-manager.js';
import { Map } from '../map.js';
import { TILE_TYPE } from '../map-tile-types.js';
import { createNoise2D } from 'https://esm.sh/simplex-noise';

export async function regenerateMapFeature(channel, worldName, feature, settings = null) {
    console.log(`Regenerating ${feature} for world ${worldName}...`);
    const worldState = await StorageManager.loadGameState(channel, worldName);
    if (!worldState) {
        alert(`Could not load world data for ${worldName}.`);
        return;
    }

    // Use a temporary Map instance to run the logic
    const tempMap = new Map(32); // tileSize is arbitrary here
    if (worldState.map && worldState.map.grid && worldState.map.grid.length > 0) {
        tempMap.grid = worldState.map.grid;
        // Sync dimensions to the loaded grid
        tempMap.height = tempMap.grid.length;
        tempMap.width = tempMap.grid[0].length;
    } else {
        // If map is empty, create a base grass grid
        tempMap.grid = Array(tempMap.height).fill(0).map(() => Array(tempMap.width).fill(TILE_TYPE.GRASS));
    }
    
    // Load existing height grid if available, or init new one
    if (worldState.map && worldState.map.heightGrid && worldState.map.heightGrid.length > 0) {
        tempMap.heightGrid = worldState.map.heightGrid;
        // Ensure heightGrid matches dimensions if resizing happened (basic check)
        while (tempMap.heightGrid.length < tempMap.height) {
             tempMap.heightGrid.push(Array(tempMap.width).fill(0));
        }
    } else {
        tempMap.heightGrid = Array(tempMap.height).fill(0).map(() => Array(tempMap.width).fill(0));
    }

    if (feature === 'trees') {
        tempMap.regenerateTrees();
    } else if (feature === 'flowers') {
        tempMap.regenerateFlowers();
    } else if (feature === 'terrain') {
        generateTerrain(tempMap, settings || { scale: 20, height_multiplier: 0, seed: Math.random() });
    }

    // Save the updated map back
    worldState.map.grid = tempMap.grid;
    worldState.map.heightGrid = tempMap.heightGrid;
    
    // We need to pass a Map-like object to saveGameState, not the full Player instances
    const dummyPlayers = new window.Map();
    for (const id in worldState.players) {
        dummyPlayers.set(id, { getState: () => worldState.players[id] });
    }
    const dummyMap = { 
        grid: tempMap.grid, 
        heightGrid: tempMap.heightGrid,
        treeRespawns: worldState.map.treeRespawns || [] 
    };

    await StorageManager.saveGameState(
        channel,
        worldName,
        dummyPlayers,
        dummyMap,
        worldState.assets || {},
        worldState.assetsGenerated || [],
        worldState.assetTypes || {}
    );

    if (feature !== 'terrain') {
        alert(`${feature.charAt(0).toUpperCase() + feature.slice(1)} have been regenerated for "${worldName}"! The changes will be visible the next time you load the world.`);
    }
}

export function generateTerrain(map, settings) {
    console.log("Generating terrain with settings:", settings);
    let seed = settings.seed || Math.random();
    const noise2D = createNoise2D(() => {
        // Simple seeded random. Not perfect but sufficient.
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    });

    const scale = Math.max(1, settings.scale);
    const heightMult = settings.height_multiplier;

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const value = noise2D(x / scale, y / scale);
            // Normalize from [-1,1] to [0,1]
            const norm = (value + 1) / 2;
            // Store continuous height so we can render smooth slopes
            const height = norm * heightMult;
            if (!map.heightGrid[y]) {
                map.heightGrid[y] = [];
            }
            map.heightGrid[y][x] = Math.max(0, height);
        }
    }
    console.log("Terrain generation complete.");
}