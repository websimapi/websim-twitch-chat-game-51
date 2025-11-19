import * as THREE from 'three';
import { TILE_TYPE } from '../../map-tile-types.js';

export class Entities3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.sprites = new Map(); // id -> THREE.Mesh

        // Billboard geometry for trees/standing props (vertical plane anchored at bottom)
        this.billboardGeometry = new THREE.PlaneGeometry(1, 1);
        this.billboardGeometry.translate(0, 0.5, 0);

        // New: flat ground quad (we will create per-instance geometries for ground objects)
        this.groundGeometry = null; // no shared geometry; kept for backward compatibility if needed
    }

    render(game, frameId) {
        const map = game.map;
        const camX = Math.floor(game.camera.x);
        const camY = Math.floor(game.camera.y);
        const renderDist = game.settings.visuals.render_distance || 30;

        const minX = Math.max(0, camX - renderDist);
        const maxX = Math.min(map.width, camX + renderDist);
        const minY = Math.max(0, camY - renderDist);
        const maxY = Math.min(map.height, camY + renderDist);

        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                const tile = map.grid[y][x];
                if (tile === TILE_TYPE.GRASS) continue;

                const h = map.getHeight(x + 0.5, y + 0.5);

                if (tile === TILE_TYPE.TREE) {
                    // Standing sprite (paper-style)
                    this.createOrUpdateSprite(
                        `t_${x}_${y}`,
                        'tree',
                        x + 0.5,
                        y + 0.5,
                        h,
                        map.treeTile,
                        1.5,
                        map,
                        frameId
                    );
                } else if (tile === TILE_TYPE.LOGS) {
                    // Ground sprite (conforms to terrain)
                    this.createOrUpdateSprite(
                        `l_${x}_${y}`,
                        'logs',
                        x + 0.5,
                        y + 0.5,
                        h,
                        map.logsTile,
                        0.9,
                        map,
                        frameId
                    );
                } else if (tile === TILE_TYPE.BUSHES) {
                    // Ground sprite
                    this.createOrUpdateSprite(
                        `b_${x}_${y}`,
                        'bushes',
                        x + 0.5,
                        y + 0.5,
                        h,
                        map.bushesTile,
                        0.9,
                        map,
                        frameId
                    );
                } else if (tile === TILE_TYPE.FLOWER_PATCH) {
                    // Ground sprite
                    this.createOrUpdateSprite(
                        `f_${x}_${y}`,
                        'flowers',
                        x + 0.5,
                        y + 0.5,
                        h,
                        map.flowerPatchTile,
                        0.8,
                        map,
                        frameId
                    );
                }
            }
        }

        // Cleanup
        for (const [id, sprite] of this.sprites) {
            if (sprite.userData.lastFrameId !== frameId) {
                this.renderer.scene.remove(sprite);
                if (sprite.geometry) sprite.geometry.dispose();
                if (sprite.material) sprite.material.dispose();
                this.sprites.delete(id);
            }
        }
    }

    createOrUpdateSprite(id, logicalType, x, y, height, image, scale = 1, map, frameId) {
        // logicalType: 'tree' -> standing, others -> ground
        const renderKind = (logicalType === 'tree') ? 'standing' : 'ground';

        let mesh = this.sprites.get(id);
        const tex = this.renderer.getTexture(image);

        if (!mesh) {
            let geometry;
            if (renderKind === 'ground') {
                // Create a per-instance ground quad that we will deform to match terrain
                geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
                geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane
            } else {
                geometry = this.billboardGeometry;
            }

            const matOptions = { 
                map: tex, 
                transparent: true, 
                alphaTest: 0.5,
                side: THREE.DoubleSide
            };

            // Use polygonOffset for ground items to prevent z-fighting and ensure they sit "on top" of the terrain
            if (renderKind === 'ground') {
                matOptions.polygonOffset = true;
                matOptions.polygonOffsetFactor = -1.0; // Pull forward
                matOptions.polygonOffsetUnits = -4.0;
            }

            const mat = new THREE.MeshLambertMaterial(matOptions);
            mesh = new THREE.Mesh(geometry, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.renderer.scene.add(mesh);
            this.sprites.set(id, mesh);
        }

        // Update Texture if changed
        if (mesh.material.map !== tex) {
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
        }

        if (renderKind === 'ground') {
            // Conform the quad to the terrain height mesh:
            // sample height at each corner of the 1x1 tile area.
            const posAttr = mesh.geometry.attributes.position;
            const vertexCount = posAttr.count;
            // Physical lift to assist polygonOffset in preventing Z-fighting
            const yOffset = 0.05; 

            for (let i = 0; i < vertexCount; i++) {
                const localX = posAttr.getX(i); // in range [-0.5, 0.5]
                const localZ = posAttr.getZ(i); // in range [-0.5, 0.5]
                const worldX = x + localX;
                const worldZ = y + localZ;

                const terrainH = map.getHeight(worldX, worldZ) + yOffset;
                posAttr.setY(i, terrainH);
            }
            posAttr.needsUpdate = true;
            mesh.geometry.computeVertexNormals();

            // Ground mesh position: center over the tile in XZ, Y handled in vertices
            mesh.position.set(x, 0, y);
        } else {
            // Position:
            // X/Z are map coordinates, Y is height from terrain
            let yOffset = 0;
            if (logicalType === 'logs' || logicalType === 'bushes' || logicalType === 'flowers') {
                // This branch is now technically unused for logs/bushes/flowers as they are 'ground',
                // but kept for safety if types change.
                yOffset = -0.02;
            }

            mesh.position.set(x, height + yOffset, y);
            mesh.scale.set(scale, scale, scale);

            // Orientation:
            // Slight fixed angle for trees, no camera-facing rotation to avoid "arcing in"
            if (logicalType === 'tree') {
                mesh.rotation.set(0, Math.PI * 0.1, 0);
            } else {
                mesh.rotation.set(0, 0, 0);
            }
        }

        // For standing sprites, ensure scale is set (ground quads use native 1x1 tile size)
        if (renderKind === 'standing') {
            mesh.scale.set(scale, scale, scale);
        }

        mesh.userData.lastFrameId = frameId;
    }
}