import * as THREE from 'three';

export class Players3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.meshes = new Map(); // p_{id} -> THREE.Mesh
        this.labels = new Map(); // p_label_{id} -> THREE.Sprite
        this.playerCanvases = new Map(); // id -> { canvas, ctx, texture }

        this.icons = {
            woodcutting: null,
            gathering: null,
        };
        this.iconsLoaded = false;
        this._loadIcons();
    }

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
        });
    }

    render(game, frameId) {
        for (const player of game.players.values()) {
            if (player.isPowered()) {
                this.createOrUpdatePlayer(player, frameId);
            }
        }

        // Cleanup
        for (const [id, mesh] of this.meshes) {
            if (mesh.userData.lastFrameId !== frameId) {
                this.renderer.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.meshes.delete(id);
            }
        }

        for (const [id, sprite] of this.labels) {
            if (sprite.userData.lastFrameId !== frameId) {
                this.renderer.scene.remove(sprite);
                if (sprite.material) sprite.material.dispose();
                this.labels.delete(id);
            }
        }
    }

    createOrUpdatePlayer(player, frameId) {
        // 3D sphere representation
        const meshId = `p_${player.id}`;
        let mesh = this.meshes.get(meshId);

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
            this.renderer.scene.add(mesh);
            this.meshes.set(meshId, mesh);
        } else {
            if (mesh.material && mesh.material.color) {
                mesh.material.color.set(player.color || '#ffffff');
            }
        }

        const z = player.z || 0;
        const sphereRadius = 0.4;
        mesh.position.set(player.pixelX, z + sphereRadius, player.pixelY);
        mesh.userData.lastFrameId = frameId;

        // Label sprite
        const labelId = `p_label_${player.id}`;
        let labelSprite = this.labels.get(labelId);

        const labelCanvasEntry = this.getPlayerLabelCanvas(player.id);
        this.drawPlayerLabel(player, labelCanvasEntry);
        labelCanvasEntry.texture.needsUpdate = true;

        if (!labelSprite) {
            const mat = new THREE.SpriteMaterial({
                map: labelCanvasEntry.texture,
                transparent: true,
                depthTest: false,
                depthWrite: false
            });
            labelSprite = new THREE.Sprite(mat);
            labelSprite.center.set(0.5, 0);
            labelSprite.renderOrder = 999;
            this.renderer.scene.add(labelSprite);
            this.labels.set(labelId, labelSprite);
        } else if (labelSprite.material.map !== labelCanvasEntry.texture) {
            labelSprite.material.map = labelCanvasEntry.texture;
        }

        const labelHeightWorld = 0.7; 
        labelSprite.position.set(
            mesh.position.x,
            mesh.position.y + labelHeightWorld,
            mesh.position.z
        );

        const labelWorldWidth = 3.0;
        const aspect = labelCanvasEntry.canvas.height > 0
            ? labelCanvasEntry.canvas.width / labelCanvasEntry.canvas.height
            : 256 / 96;
        const labelWorldHeight = labelWorldWidth / aspect;
        labelSprite.scale.set(labelWorldWidth, labelWorldHeight, 1);

        labelSprite.userData.lastFrameId = frameId;
    }

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

    getPlayerSkillIcon(player) {
        if (!this.iconsLoaded) return null;
        if (player.state === 'chopping') return this.icons.woodcutting;
        if (player.state === 'harvesting_logs' ||
            player.state === 'harvesting_bushes' ||
            player.state === 'harvesting_flowers'
        ) return this.icons.gathering;
        return null;
    }

    drawPlayerLabel(player, labelEntry) {
        const ctx = labelEntry.ctx;
        const canvas = labelEntry.canvas;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const nameY = h * 0.4;
        ctx.font = '20px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(player.username, w / 2, nameY);
        ctx.fillText(player.username, w / 2, nameY);

        const energy = player.energy;
        const maxSlots = 12;
        if (energy && energy.timestamps && energy.timestamps.length > 0) {
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
                    const isLastFilledSlot = (i === filledSlots - 1);
                    if (isLastFilledSlot) {
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

        const total = player.actionTotalTime || 0;
        const remaining = player.actionTimer || 0;
        if (total > 0 && remaining > 0) {
            const progress = Math.min(1, Math.max(0, (total - remaining) / total));
            const radius = 22;
            const centerX = w * 0.18;
            const centerY = nameY - 6;

            ctx.beginPath();
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();

            let color;
            if (progress < 0.33) color = `rgb(255, ${Math.floor(255 * (progress / 0.33))}, 0)`;
            else if (progress < 0.66) color = `rgb(${255 - Math.floor(255 * ((progress - 0.33) / 0.33))}, 255, 0)`;
            else color = 'rgb(0, 255, 0)';

            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + progress * Math.PI * 2;

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.arc(centerX, centerY, radius - 2, startAngle, endAngle);
            ctx.stroke();

            const icon = this.getPlayerSkillIcon(player);
            if (icon) {
                const iconSize = 32;
                const iconX = centerX - iconSize / 2;
                const iconY = centerY - iconSize / 2;
                ctx.drawImage(icon, Math.floor(iconX), Math.floor(iconY), iconSize, iconSize);
            }
        }
    }
}