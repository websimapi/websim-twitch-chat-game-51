import * as THREE from 'three';

import { Terrain3D } from './renderers/terrain-3d.js';
import { Entities3D } from './renderers/entities-3d.js';
import { Players3D } from './renderers/players-3d.js';

export class ThreeRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background

        // Camera will be setup in resize
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 2000);
        
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
        this.textureCache = {};
        
        this.frameId = 0;

        // Sub-renderers
        this.terrainRenderer = new Terrain3D(this);
        this.entitiesRenderer = new Entities3D(this);
        this.playersRenderer = new Players3D(this);
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

        // Position camera based on target (cam.x, cam.y) and rotation/pitch
        const x = cam.x;
        const z = cam.y; // Game Y is 3D Z
        const rot = cam.rotation;
        const pitch = cam.pitch || Math.PI / 3;

        // Determine target height (player if focused, otherwise terrain)
        let targetY = 0;
        if (cam.focusedPlayerId && game.players && game.players.has(cam.focusedPlayerId)) {
            const p = game.players.get(cam.focusedPlayerId);
            // Player z is terrain height; add a bit so we look at torso/head
            const playerZ = p.z || 0;
            targetY = playerZ + 1.0;
        } else if (game.map && typeof game.map.getHeight === 'function') {
            const groundH = game.map.getHeight(x, z) || 0;
            targetY = groundH + 0.5;
        }

        // Distance from target for the orbit (scaled with zoom for better 3rd‑person feel)
        const baseDist = 18;
        const zoomFactor = cam.zoom / 20; // 20 is our default view height
        const dist = Math.min(40, Math.max(6, baseDist * zoomFactor));

        // Spherical to Cartesian: pitch from horizontal plane
        const horizontalRadius = dist * Math.cos(pitch);
        const offsetY = dist * Math.sin(pitch);

        const offsetX = horizontalRadius * Math.sin(rot);
        const offsetZ = horizontalRadius * Math.cos(rot);

        // Set position: target + offset, raised slightly
        this.camera.position.set(
            x + offsetX,
            targetY + offsetY,
            z + offsetZ
        );
        this.camera.up.set(0, 1, 0);

        // Always look directly at the target point (player/terrain)
        this.camera.lookAt(x, targetY, z);

        // Update shadow light to follow camera target but keep consistent direction relative to world
        this.dirLight.position.set(x + 20, targetY + 30, z + 20);
        this.dirLight.target.position.set(x, targetY, z);
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

    render(game) {
        // Increment frame counter at the start of each render
        this.frameId += 1;
        const currentFrameId = this.frameId;

        this.updateCamera(game);
        
        // Delegate rendering to sub-systems
        this.terrainRenderer.update(game.map);
        this.entitiesRenderer.render(game, currentFrameId);
        this.playersRenderer.render(game, currentFrameId);

        this.renderer.render(this.scene, this.camera);
    }
}