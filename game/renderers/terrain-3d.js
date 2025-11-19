import * as THREE from 'three';

export class Terrain3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.mesh = null;
    }

    update(map) {
        // Optimization: Only update terrain if strictly necessary (init or dimensions change)
        // We expect dimensions to be map.width - 1 to align vertices with integer coordinates
        const expectedWidth = map.width - 1;
        const expectedHeight = map.height - 1;

        if (!map.needs3DUpdate && this.mesh && 
            this.mesh.geometry.parameters.width === expectedWidth && 
            this.mesh.geometry.parameters.height === expectedHeight) {
            
            // Check if texture needs update
            const tex = this.renderer.getTexture(map.grassTile);
            if (tex && this.mesh.material.map !== tex) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(expectedWidth, expectedHeight);
                this.mesh.material.map = tex;
                this.mesh.material.needsUpdate = true;
            }
            return;
        }

        // If dimensions match but we need an update (e.g. live view scrolling), update vertices in place
        if (map.needs3DUpdate && this.mesh &&
            this.mesh.geometry.parameters.width === expectedWidth &&
            this.mesh.geometry.parameters.height === expectedHeight) {
            
            const positions = this.mesh.geometry.attributes.position;
            for (let y = 0; y < map.height; y++) {
                for (let x = 0; x < map.width; x++) {
                    const index = y * (map.width) + x;
                    const h = map.getHeight(x, y);
                    positions.setZ(index, h);
                }
            }
            positions.needsUpdate = true;
            this.mesh.geometry.computeVertexNormals();
            map.needs3DUpdate = false;
            return;
        }

        if (this.mesh) {
            this.renderer.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        // Geometry: Width, Height, SegmentsW, SegmentsH
        // Use (width-1) as size and segments so that vertices are spaced exactly 1 unit apart
        // This ensures vertices align with integer grid coordinates, matching object placement logic
        const geometry = new THREE.PlaneGeometry(expectedWidth, expectedHeight, expectedWidth, expectedHeight);
        
        // Material
        const grassTex = this.renderer.getTexture(map.grassTile);
        if (grassTex) {
            grassTex.wrapS = THREE.RepeatWrapping;
            grassTex.wrapT = THREE.RepeatWrapping;
            // Repeat texture 1:1 with grid cells
            grassTex.repeat.set(expectedWidth, expectedHeight);
        }
        
        const material = new THREE.MeshLambertMaterial({ 
            map: grassTex,
            color: 0xddffdd
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2; // Lay flat
        
        // Offset to align top-left of map grid (0,0) with world space 0,0
        // PlaneGeometry is centered, so we shift by half the size
        this.mesh.position.set(expectedWidth / 2, 0, expectedHeight / 2);
        this.mesh.receiveShadow = true;

        this.renderer.scene.add(this.mesh);

        // Initial height set
        const positions = this.mesh.geometry.attributes.position;
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const index = y * (map.width) + x;
                const h = map.getHeight(x, y);
                positions.setZ(index, h);
            }
        }
        positions.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
    }
}