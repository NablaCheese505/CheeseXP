// classes/LeaderboardCard.js
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/Roboto-Bold.ttf'), 'RobotoBold');
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/Roboto-Regular.ttf'), 'RobotoRegular');
    
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/seguiemj.ttf'), 'Segoe UI Emoji');
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/seguisym.ttf'), 'SegoeUISymbol');
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/msgothic.ttc'), 'MS Gothic');
    
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/NotoColorEmoji.ttf'), 'NotoEmoji');
} catch (e) {
    console.log("Aviso: Fallo menor al cargar fuentes en Leaderboard:", e.message);
}

let renderQueue = Promise.resolve();

class LeaderboardCard {
    constructor(rankingsData, serverSettings, pageInfo, i18nTexts) {
        this.rankings = rankingsData; 
        this.settings = serverSettings;
        this.pageInfo = pageInfo;
        
        this.texts = i18nTexts || {
            title: "Leaderboard - Page",
            unknown: "Unknown User",
            level: "Level"
        };
    }

    async build() {
        renderQueue = renderQueue.then(() => this._render());
        return renderQueue;
    }

    async _render() {
        const canvas = createCanvas(800, 650);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = this.settings.leaderboard.embedColor === -1 ? '#1e1f22' : (this.settings.leaderboard.embedColor || '#1e1f22');
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '32px "RobotoBold", "Segoe UI Emoji", "SegoeUISymbol", "NotoEmoji", "MS Gothic", sans-serif';
        ctx.textAlign = 'left';
        
        ctx.fillText(`${this.texts.title} ${this.pageInfo.page}/${this.pageInfo.totalPages}`, 30, 50);

        const startY = 80;
        const rowHeight = 100;
        const rowSpacing = 10;

        for (let i = 0; i < this.rankings.length; i++) {
            const user = this.rankings[i];
            const currentY = startY + (i * (rowHeight + rowSpacing));

            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.roundRect(30, currentY, canvas.width - 60, rowHeight, 15);
            ctx.fill();

            ctx.fillStyle = i === 0 && this.pageInfo.page === 1 ? '#FFD700' : 
                            i === 1 && this.pageInfo.page === 1 ? '#C0C0C0' : 
                            i === 2 && this.pageInfo.page === 1 ? '#CD7F32' : '#FFFFFF';
            ctx.font = '36px "RobotoBold", "Segoe UI Emoji", "SegoeUISymbol", "NotoEmoji", "MS Gothic", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`#${user.rank}`, 70, currentY + 65);

            const avatarX = 120;
            const avatarY = currentY + 15;
            const avatarSize = 70;
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();

            try {
                const cleanAvatarURL = user.avatarURL.replace('.webp', '.png') + '?size=128';
                const avatar = await loadImage(cleanAvatarURL);
                ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            } catch (e) {
                ctx.fillStyle = '#99aab5';
                ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
            }
            ctx.restore();

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.font = '28px "RobotoBold", "Segoe UI Emoji", "SegoeUISymbol", "NotoEmoji", "MS Gothic", sans-serif';
            
            let name = user.displayName || user.username || this.texts.unknown;
            if (name.length > 20) name = name.substring(0, 18) + "...";
            ctx.fillText(name, 210, currentY + 45);

            ctx.fillStyle = '#AAAAAA';
            ctx.font = '22px "RobotoRegular", "Segoe UI Emoji", "SegoeUISymbol", "NotoEmoji", "MS Gothic", sans-serif';
            
            ctx.fillText(`${this.texts.level} ${user.level}  |  ${user.xpFormatted} XP`, 210, currentY + 80);
        }

        return canvas.toBuffer('image/png');
    }
}

module.exports = LeaderboardCard;