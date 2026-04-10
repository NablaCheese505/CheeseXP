const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

let renderQueue = Promise.resolve();

class RankCard {
    constructor(userData, serverSettings) {
        this.userData = userData; // { username, avatarURL, currentXP, requiredXP, level, rank }
        this.settings = serverSettings; // { backgroundURL, barColor, textColor, opacity }
    }

    async build() {
        renderQueue = renderQueue.then(() => this._render());
        return renderQueue;
    }

    async _render() {
        const canvas = createCanvas(930, 280);
        const ctx = canvas.getContext('2d');
        
        
        return canvas.toBuffer('image/png');
    }
}

module.exports = RankCard;