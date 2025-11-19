export class PlayerInventory {
    constructor() {
        // These will now hold compact data structures
        this.logs = { s: 0, d: [] }; // Delta-encoded timestamps
        this.leaves = {}; // { [timestamp]: amount }
        this.flowers = {}; // { [color_hex]: { [timestamp]: amount } }
    }

    addLog(timestamp) {
        if (this.logs.s === 0) {
            this.logs.s = timestamp;
        } else {
            const lastTimestamp = this.logs.d.reduce((acc, delta) => acc + delta, this.logs.s);
            this.logs.d.push(timestamp - lastTimestamp);
        }
    }

    getLogCount() {
        if (this.logs.s === 0) return 0;
        return 1 + this.logs.d.length;
    }

    addLeaves(amount, timestamp) {
        this.leaves[timestamp] = (this.leaves[timestamp] || 0) + amount;
    }

    getTotalLeaves() {
        return Object.values(this.leaves).reduce((sum, amount) => sum + amount, 0);
    }

    addFlower(color, amount, timestamp) {
        if (!this.flowers[color]) {
            this.flowers[color] = {};
        }
        this.flowers[color][timestamp] = (this.flowers[color][timestamp] || 0) + amount;
    }

    getTotalFlowers() {
        let total = 0;
        for (const color in this.flowers) {
            total += Object.values(this.flowers[color]).reduce((sum, amount) => sum + amount, 0);
        }
        return total;
    }

    getState() {
        return {
            logs: this.logs,
            leaves: this.leaves,
            flowers: this.flowers,
        };
    }

    loadState(state) {
        this.logs = state.logs || { s: 0, d: [] };
        this.leaves = state.leaves || {};
        this.flowers = state.flowers || {};
    }
}