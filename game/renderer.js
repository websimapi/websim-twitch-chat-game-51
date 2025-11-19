import * as THREE from 'three';
import { renderPlayer } from '../player-renderer.js';
import { TILE_TYPE } from '../map-tile-types.js';

export class ThreeRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background

        // Camera will be setup in resize
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false }); // False for retro feel
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);
        this.dirLight = dirLight;

        // Caches
        this.terrainMesh = null;
        this.textureCache = {};
        this.sprites = new Map(); // id -> THREE.Sprite or THREE.Mesh
        this.playerCanvases = new Map(); // id -> { canvas, texture }
        
        this.mapVersion = -1; // To track map regeneration
    }

    resize(game) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.updateCamera(game);
    }

    updateCamera(game) {
        const cam = game.camera;
        const aspect = window.innerWidth / window.innerHeight;
        const viewHeight = cam.zoom;
        const viewWidth = viewHeight * aspect;

        this.camera.left = -viewWidth / 2;
        this.camera.right = viewWidth / 2;
        this.camera.top = viewHeight / 2;
        this.camera.bottom = -viewHeight / 2;
        this.camera.updateProjectionMatrix();

        // Position camera
        const x = cam.x;
        const z = cam.y; // Game Y is 3D Z

        const viewMode = game.settings.visuals.view_mode || '2d';
        
        if (viewMode === '2.5d' || viewMode === 'isometric') {
            // Isometric-ish angle
            this.camera.position.set(x + 20, 20, z + 20); // Offset
            this.camera.lookAt(x, 0, z);
        } else {
            // Top Down 3D
            this.camera.position.set(x, 50, z);
            this.camera.lookAt(x, 0, z);
            // Rotate Z so 'up' is -Z in game (North)
            this.camera.rotation.z = 0; 
            this.camera.up.set(0, 0, -1); 
            this.camera.lookAt(x, 0, z);
        }

        // Follow shadow light
        this.dirLight.position.set(x + 20, 50, z + 10);
        this.dirLight.target.position.set(x, 0, z);
        this.dirLight.target.updateMatrixWorld();
    }

    getTexture(img) {
        if (!img || !img.src) return null;
        if (!this.textureCache[img.src]) {
            const tex = new THREE.Texture(img);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.needsUpdate = true;
            this.textureCache[img.src] = tex;
        }
        return this.textureCache[img.src];
    }

    updateTerrain(map) {
        // Optimization: Only update terrain if strictly necessary (init or dimensions change)
        // Updating height of 65k vertices every frame is too slow.
        if (this.terrainMesh && 
            this.terrainMesh.geometry.parameters.width === map.width && 
            this.terrainMesh.geometry.parameters.height === map.height) {
            
            // Check if texture needs update
            const tex = this.getTexture(map.grassTile);
            if (tex && this.terrainMesh.material.map !== tex) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(map.width, map.height);
                this.terrainMesh.material.map = tex;
                this.terrainMesh.material.needsUpdate = true;
            }
            return;
        }

        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh.geometry.dispose();
            this.terrainMesh.material.dispose();
        }

        // Geometry: Width, Height, SegmentsW, SegmentsH
        const geometry = new THREE.PlaneGeometry(map.width, map.height, map.width - 1, map.height - 1);
        
        // Material
        const grassTex = this.getTexture(map.grassTile);
        if (grassTex) {
            grassTex.wrapS = THREE.RepeatWrapping;
            grassTex.wrapT = THREE.RepeatWrapping;
            grassTex.repeat.set(map.width, map.height);
        }
        
        const material = new THREE.MeshLambertMaterial({ 
            map: grassTex,
            color: 0xddffdd
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2; // Lay flat
        
        // Offset to align top-left of map grid (0,0) with world space 0,0
        this.terrainMesh.position.set(map.width / 2 - 0.5, 0, map.height / 2 - 0.5);
        this.terrainMesh.receiveShadow = true;

        this.scene.add(this.terrainMesh);

        // Initial height set
        const positions = this.terrainMesh.geometry.attributes.position;
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const index = y * (map.width) + x;
                const h = map.getHeight(x, y);
                positions.setZ(index, h);
            }
        }
        positions.needsUpdate = true;
        this.terrainMesh.geometry.computeVertexNormals();
    }

    createOrUpdateSprite(id, type, x, y, z, image, scale = 1) {
        let sprite = this.sprites.get(id);
        const tex = this.getTexture(image);
        
        if (!sprite) {
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            sprite = new THREE.Sprite(mat);
            sprite.center.set(0.5, 0); // Anchor at bottom center
            this.scene.add(sprite);
            this.sprites.set(id, sprite);
        }

        // Update Texture
        if (sprite.material.map !== tex) {
            sprite.material.map = tex;
        }

        // Position
        sprite.position.set(x, z, y); // Game Y -> 3D Z, Game Z (height) -> 3D Y
        sprite.scale.set(scale, scale, 1);
        
        // Mark as seen this frame
        sprite.userData.lastUpdate = Date.now();
    }
    
    createOrUpdatePlayer(player) {
        // Generate/Update Canvas Texture for player
        let canvasData = this.playerCanvases.get(player.id);
        if (!canvasData) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            canvasData = { canvas, ctx: canvas.getContext('2d'), texture: tex };
            this.playerCanvases.set(player.id, canvasData);
        }

        // Render player to 2D canvas
        const { ctx, canvas, texture } = canvasData;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Scale context so renderPlayer thinks it's drawing to a 32px tile but on a 128px canvas (high res)
        ctx.save();
        ctx.scale(4, 4); 
        ctx.translate(16, 16); // Center in the 32x32 space
        // Mock camera offset to 0,0 since we translated
        renderPlayer(ctx, player, 32, 0, 0, '2d'); 
        ctx.restore();
        
        texture.needsUpdate = true;

        // Create/Update Sprite
        const id = `p_${player.id}`;
        let sprite = this.sprites.get(id);
        if (!sprite) {
            const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
            sprite = new THREE.Sprite(mat);
            sprite.center.set(0.5, 0.3); // Adjust anchor so feet are on ground (player circle is centered)
            this.scene.add(sprite);
            this.sprites.set(id, sprite);
        }
        
        // Player uses z + 0.5 to prevent clipping and look nice
        const z = player.z || 0;

        sprite.position.set(player.pixelX, z + 0.5, player.pixelY); // +0.5 for height offset of sprite
        sprite.scale.set(1.5, 1.5, 1); // Slightly larger player sprite
        sprite.userData.lastUpdate = Date.now();
    }

    render(game) {
        this.updateCamera(game);
        
        // Only update terrain geometry on init or changes, not every frame
        this.updateTerrain(game.map); 

        const now = Date.now();

        // Render Players
        for (const player of game.players.values()) {
            if (player.isPowered()) {
                this.createOrUpdatePlayer(player);
            }
        }

        // Render Static Objects (Trees, etc) 
        // Optimization: Only iterate visible chunks
        const map = game.map;
        const camX = Math.floor(game.camera.x);
        const camY = Math.floor(game.camera.y); // Camera Y is map Y (depth)
        const renderDist = game.settings.visuals.render_distance || 30;

        const minX = Math.max(0, camX - renderDist);
        const maxX = Math.min(map.width, camX + renderDist);
        const minY = Math.max(0, camY - renderDist);
        const maxY = Math.min(map.height, camY + renderDist);

        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                const tile = map.grid[y][x];
                if (tile === TILE_TYPE.GRASS) continue; // Skip empty tiles

                const z = map.getHeight(x + 0.5, y + 0.5);
                
                if (tile === TILE_TYPE.TREE) {
                    this.createOrUpdateSprite(`t_${x}_${y}`, 'tree', x + 0.5, y + 0.5, z, map.treeTile, 1.5);
                } else if (tile === TILE_TYPE.LOGS) {
                    this.createOrUpdateSprite(`l_${x}_${y}`, 'logs', x + 0.5, y + 0.5, z, map.logsTile, 1);
                } else if (tile === TILE_TYPE.BUSHES) {
                    this.createOrUpdateSprite(`b_${x}_${y}`, 'bushes', x + 0.5, y + 0.5, z, map.bushesTile, 1);
                } else if (tile === TILE_TYPE.FLOWER_PATCH) {
                     this.createOrUpdateSprite(`f_${x}_${y}`, 'flowers', x + 0.5, y + 0.5, z, map.flowerPatchTile, 0.8);
                }
            }
        }

        // Cleanup stale sprites
        // Only run cleanup occasionally to avoid checking thousands of sprites every frame?
        // Actually, iteration over map keys is fast enough for < 5000 objects.
        // If world is huge, this might need optimization, but with render_distance, visible count is low.
        // We must ensure invisible sprites are removed so they don't clog up the scene.
        for (const [id, sprite] of this.sprites) {
            if (sprite.userData.lastUpdate !== now) {
                this.scene.remove(sprite);
                if(sprite.material.map) sprite.material.map.dispose();
                sprite.material.dispose();
                this.sprites.delete(id);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}