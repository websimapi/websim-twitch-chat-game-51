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
        // Rebuild terrain if dimensions change or it doesn't exist
        if (!this.terrainMesh || this.terrainMesh.geometry.parameters.width !== map.width || this.terrainMesh.geometry.parameters.height !== map.height) {
            if (this.terrainMesh) {
                this.scene.remove(this.terrainMesh);
                this.terrainMesh.geometry.dispose();
                this.terrainMesh.material.dispose();
            }

            // Geometry: Width, Height, SegmentsW, SegmentsH
            // ThreeJS Plane is created in XY. We rotate it later.
            // Segments should correspond to map width-1, height-1 to match vertices to grid points
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
            // PlaneGeometry is centered. Shift it so (0,0) is top-left to match game coords (0 to Width)
            // Actually, game coord 0,0 is a grid point.
            // Plane created with width/height is centered at 0,0.
            // Top left corner would be -width/2, +height/2 in XY space.
            // We want corner to be 0,0 in World space.
            // Let's offset position:
            this.terrainMesh.position.set(map.width / 2 - 0.5, 0, map.height / 2 - 0.5);
            this.terrainMesh.receiveShadow = true;

            this.scene.add(this.terrainMesh);
        }

        // Update heights
        const positions = this.terrainMesh.geometry.attributes.position;
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                // PlaneGeometry vertices are ordered row by row, from top to bottom (Y decreases)?
                // Actually PlaneGeometry builds vertices: (0,0), (1,0)... (0,1)... 
                // Let's verify. Standard PlaneGeometry(w, h, sw, sh) builds row by row.
                // Vertex index = y * (width+1) + x
                const index = y * (map.width) + x;
                const h = map.getHeight(x, y);
                // Z in Plane geometry local space corresponds to Up in world space when rotated -90 X.
                positions.setZ(index, h);
            }
        }
        positions.needsUpdate = true;
        this.terrainMesh.geometry.computeVertexNormals();
        
        // Update texture if changed (e.g. asset override)
        const tex = this.getTexture(map.grassTile);
        if (tex && this.terrainMesh.material.map !== tex) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(map.width, map.height);
            this.terrainMesh.material.map = tex;
            this.terrainMesh.material.needsUpdate = true;
        }
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
        
        // Mark as seen this frame (reuse a property or set a timestamp)
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
        
        const h = this.terrainMesh ? (this.terrainMesh.geometry.attributes.position.getZ(Math.floor(player.y) * this.terrainMesh.geometry.parameters.width + Math.floor(player.x)) || 0) : 0;
        // Interpolate Z properly
        const z = player.z || 0;

        sprite.position.set(player.pixelX, z + 0.5, player.pixelY); // +0.5 for height offset of sprite
        sprite.scale.set(1.5, 1.5, 1); // Slightly larger player sprite
        sprite.userData.lastUpdate = Date.now();
    }

    render(game) {
        this.updateCamera(game);
        
        // Update Terrain if needed
        // We assume map doesn't change every frame, but check a version flag or something?
        // For now, just check if heightGrid changed? Expensive.
        // Let's assume updateTerrain is cheap enough to check texture/geo init, 
        // but expensive height updates should be explicit. 
        // We'll just run it once or if explicitly dirtied.
        this.updateTerrain(game.map); 

        const now = Date.now();

        // Render Players
        for (const player of game.players.values()) {
            if (player.isPowered()) {
                this.createOrUpdatePlayer(player);
            }
        }

        // Render Static Objects (Trees, etc) - Iterate grid
        // Optimization: Only iterate visible chunks or cache these into instanced meshes?
        // For "retro" feel with < 1000 objects, sprites are okay.
        
        // For performance, we should track objects and not scan grid every frame.
        // But to keep it consistent with 2D renderer logic which scanned:
        // We will scan the grid.
        
        const map = game.map;
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const tile = map.grid[y][x];
                const z = map.getHeight(x + 0.5, y + 0.5);
                
                if (tile === TILE_TYPE.TREE) {
                    this.createOrUpdateSprite(`t_${x}_${y}`, 'tree', x + 0.5, y + 0.5, z, map.treeTile, 1.5);
                } else if (tile === TILE_TYPE.LOGS) {
                    this.createOrUpdateSprite(`l_${x}_${y}`, 'logs', x + 0.5, y + 0.5, z, map.logsTile, 1);
                } else if (tile === TILE_TYPE.BUSHES) {
                    this.createOrUpdateSprite(`b_${x}_${y}`, 'bushes', x + 0.5, y + 0.5, z, map.bushesTile, 1);
                } else if (tile === TILE_TYPE.FLOWER_PATCH) {
                    // Flowers are flat in 2D/2.5D, maybe just a decal on terrain?
                    // Or a small sprite
                     this.createOrUpdateSprite(`f_${x}_${y}`, 'flowers', x + 0.5, y + 0.5, z, map.flowerPatchTile, 0.8);
                }
            }
        }

        // Cleanup stale sprites
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