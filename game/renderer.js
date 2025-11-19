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

        // New: frame counter to track which sprites are used each render
        this.frameId = 0;

        // NEW: icons for chop / gather indicator in label
        this.icons = {
            woodcutting: null,
            gathering: null,
        };
        this.iconsLoaded = false;
        this._loadIcons();
    }

    // NEW: helper to load icons for label timer indicator
    _loadIcons() {
        if (this.iconsLoaded) return;
        const loadImg = (src) => new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
        });
        Promise.all([
            loadImg('./woodcutting_icon.png'),
            loadImg('./gathering_icon.png'),
        ]).then(([woodcutting, gathering]) => {
            this.icons.woodcutting = woodcutting;
            this.icons.gathering = gathering;
            this.iconsLoaded = true;
            console.log('ThreeRenderer label icons loaded.');
        });
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

        const viewMode = game.settings.visuals.view_mode || 'top-down';
        
        if (viewMode === 'isometric') {
            // Isometric-ish angle that orbits around the focused player
            const angleRad = (cam.orbitAngle * Math.PI) / 180;
            const radius = 30;
            const height = 20;

            const camX = x + Math.cos(angleRad) * radius;
            const camZ = z + Math.sin(angleRad) * radius;

            this.camera.position.set(camX, height, camZ);
            this.camera.up.set(0, 1, 0); // standard Y-up
            this.camera.lookAt(x, 0, z);
        } else {
            // Top Down 3D, directly above the player focus
            const height = 50;
            this.camera.position.set(x, height, z);
            this.camera.up.set(0, 0, -1); 
            this.camera.lookAt(x, 0, z);
        }

        // Follow shadow light roughly from above/side
        this.dirLight.position.set(this.camera.position.x + 10, this.camera.position.y + 20, this.camera.position.z + 10);
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

    // Helper to get or create a canvas/texture pair for a player label
    getPlayerLabelCanvas(playerId) {
        let entry = this.playerCanvases.get(playerId);
        if (!entry) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 96;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            entry = { canvas, ctx, texture };
            this.playerCanvases.set(playerId, entry);
        }
        return entry;
    }

    // NEW: small helper to decide which icon to show based on player state
    getPlayerSkillIcon(player) {
        if (!this.iconsLoaded) return null;
        // Chopping = woodcutting icon
        if (player.state === 'chopping') {
            return this.icons.woodcutting;
        }
        // Any harvesting = gathering icon
        if (
            player.state === 'harvesting_logs' ||
            player.state === 'harvesting_bushes' ||
            player.state === 'harvesting_flowers'
        ) {
            return this.icons.gathering;
        }
        return null;
    }

    // Draw username, energy bar, and action timer indicator into the label canvas
    drawPlayerLabel(player, labelEntry) {
        const ctx = labelEntry.ctx;
        const canvas = labelEntry.canvas;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Username
        const nameY = h * 0.4; // Slightly higher, closer to sphere
        ctx.font = '20px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(player.username, w / 2, nameY);
        ctx.fillText(player.username, w / 2, nameY);

        // Energy bar (narrower, no background container)
        const energy = player.energy;
        const maxSlots = 12;
        if (energy && energy.timestamps && energy.timestamps.length > 0) {
            // Make bar noticeably narrower than before
            const barWidth = w * 0.45;
            const barHeight = 8;
            const barX = (w - barWidth) / 2;
            const barY = nameY + 4;

            const filledSlots = Math.min(maxSlots, energy.timestamps.length);
            const slotWidth = barWidth / maxSlots;
            const remainingRatio = 1 - (energy.currentCellDrainRatio || 0);

            for (let i = 0; i < maxSlots; i++) {
                const x = barX + i * slotWidth;
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.strokeRect(Math.round(x) + 0.5, Math.round(barY) + 0.5, Math.floor(slotWidth) - 1, barHeight);

                if (i < filledSlots) {
                    if (i === 0) {
                        // draining cell
                        const width = slotWidth * remainingRatio;
                        const alpha = 0.6 + (energy.flashState || 0) * 0.4;
                        ctx.fillStyle = `rgba(173,216,230,${alpha})`;
                        ctx.fillRect(Math.round(x) + 1, barY + 1, Math.max(0, width - 2), barHeight - 2);
                    } else {
                        ctx.fillStyle = 'rgb(173,216,230)';
                        ctx.fillRect(Math.round(x) + 1, barY + 1, Math.floor(slotWidth) - 2, barHeight - 2);
                    }
                } else {
                    ctx.fillStyle = 'rgba(173,216,230,0.25)';
                    ctx.fillRect(Math.round(x) + 1, barY + 1, Math.floor(slotWidth) - 2, barHeight - 2);
                }
            }
        }

        // Action timer circle indicator with icon inside
        const total = player.actionTotalTime || 0;
        const remaining = player.actionTimer || 0;
        if (total > 0 && remaining > 0) {
            const progress = Math.min(1, Math.max(0, (total - remaining) / total));
            const radius = 14;
            const centerX = w * 0.18; // a bit left of center
            const centerY = nameY - 6;

            // Background circle (lighter so it's less heavy)
            ctx.beginPath();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();

            // Choose color for progress arc
            let color;
            if (progress < 0.33) {
                color = `rgb(255, ${Math.floor(255 * (progress / 0.33))}, 0)`; // Red -> Orange
            } else if (progress < 0.66) {
                color = `rgb(${255 - Math.floor(255 * ((progress - 0.33) / 0.33))}, 255, 0)`; // Orange -> Yellow
            } else {
                color = 'rgb(0, 255, 0)'; // Green
            }

            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + progress * Math.PI * 2;

            // Progress arc
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.arc(centerX, centerY, radius - 2, startAngle, endAngle);
            ctx.stroke();

            // Draw icon inside circle if available
            const icon = this.getPlayerSkillIcon(player);
            if (icon) {
                const iconSize = radius * 1.3;
                const iconX = centerX - iconSize / 2;
                const iconY = centerY - iconSize / 2;
                ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
            }
        }
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
        
        // Mark as seen this frame (use frameId instead of timestamp)
        sprite.userData.lastFrameId = this.frameId;
    }
    
    createOrUpdatePlayer(player) {
        // 3D sphere representation for players in the main scene
        const id = `p_${player.id}`;
        let mesh = this.sprites.get(id);

        if (!mesh) {
            const geometry = new THREE.SphereGeometry(0.4, 16, 16);
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(player.color || '#ffffff'),
                metalness: 0.0,
                roughness: 0.4
            });
            mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = false;
            this.scene.add(mesh);
            this.sprites.set(id, mesh);
        } else {
            // Update color if player's color changed
            if (mesh.material && mesh.material.color) {
                mesh.material.color.set(player.color || '#ffffff');
            }
        }

        // Use map height as Y (3D up) so player follows terrain
        const z = player.z || 0;
        mesh.position.set(player.pixelX, z + 0.5, player.pixelY);
        mesh.userData.lastFrameId = this.frameId;

        // --- Label sprite above player ---
        const labelId = `p_label_${player.id}`;
        let labelSprite = this.sprites.get(labelId);

        const labelCanvasEntry = this.getPlayerLabelCanvas(player.id);
        this.drawPlayerLabel(player, labelCanvasEntry);
        labelCanvasEntry.texture.needsUpdate = true;

        if (!labelSprite) {
            const mat = new THREE.SpriteMaterial({
                map: labelCanvasEntry.texture,
                transparent: true,
                depthTest: false,    // Always render on top of world
                depthWrite: false
            });
            labelSprite = new THREE.Sprite(mat);
            labelSprite.center.set(0.5, 0); // bottom center
            labelSprite.renderOrder = 999;  // above most things
            this.scene.add(labelSprite);
            this.sprites.set(labelId, labelSprite);
        } else if (labelSprite.material.map !== labelCanvasEntry.texture) {
            labelSprite.material.map = labelCanvasEntry.texture;
        }

        // Position label slightly above the sphere (closer than before)
        const labelHeightWorld = 0.7; // was 1.2, bring label closer to player
        labelSprite.position.set(
            mesh.position.x,
            mesh.position.y + labelHeightWorld,
            mesh.position.z
        );

        // Scale label so it is readable but not huge; scale with distance a bit by using fixed world size
        const labelWorldWidth = 3.0;
        const aspect = labelCanvasEntry.canvas.height > 0
            ? labelCanvasEntry.canvas.width / labelCanvasEntry.canvas.height
            : 256 / 96;
        const labelWorldHeight = labelWorldWidth / aspect;
        labelSprite.scale.set(labelWorldWidth, labelWorldHeight, 1);

        labelSprite.userData.lastFrameId = this.frameId;
    }

    render(game) {
        // Increment frame counter at the start of each render
        this.frameId += 1;
        const currentFrameId = this.frameId;

        this.updateCamera(game);
        
        // Only update terrain geometry on init or changes, not every frame
        this.updateTerrain(game.map); 

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

        // Cleanup stale sprites: remove anything not updated this frame
        for (const [id, sprite] of this.sprites) {
            if (sprite.userData.lastFrameId !== currentFrameId) {
                this.scene.remove(sprite);
                if (sprite.material) {
                    if (sprite.material.map && sprite.material.map.isTexture && !sprite.material.map.isCanvasTexture) {
                        sprite.material.map.dispose();
                    }
                    sprite.material.dispose();
                }
                this.sprites.delete(id);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}