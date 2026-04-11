const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// --- CARGA DE FUENTES ---
try {
    // 1. Cargamos las fuentes de Google que descargaste en tu carpeta assets
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/Roboto-Bold.ttf'), 'RobotoBold');
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/Roboto-Regular.ttf'), 'RobotoRegular');
    GlobalFonts.registerFromPath(path.join(__dirname, '../app/assets/NotoColorEmoji.ttf'), 'NotoEmoji');
    
    // 2. Cargamos las fuentes nativas de Windows para leer símbolos y Emojis (solo para tu entorno local)
    GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\seguiemj.ttf', 'Segoe UI Emoji');
    GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\msgothic.ttc', 'MS Gothic');

    // NUEVO: Intentar usar las fuentes instaladas en el sistema para símbolos raros
    GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\seguisym.ttf', 'SegoeUISymbol'); // Windows
    GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVuSans'); // Linux/Azure
} catch (e) {
    console.log("Aviso: No se pudieron cargar algunas fuentes especiales.", e.message);
}

// Cola de promesas para evitar que la RAM explote
let renderQueue = Promise.resolve();

class RankCard {
    constructor(userData, serverSettings) {
        this.userData = userData; 
        this.settings = serverSettings; 
    }

    async build() {
        renderQueue = renderQueue.then(() => this._render());
        return renderQueue;
    }

    async _render() {
        // Lienzo un poco más alto (340px) para acomodar más info
        const canvas = createCanvas(930, 340);
        const ctx = canvas.getContext('2d');

        // FONDO
        if (this.settings.backgroundURL && this.settings.backgroundURL.length > 5) {
            try {
                const bg = await loadImage(this.settings.backgroundURL);
                const fitMode = this.settings.backgroundFit || 'cover';

                if (fitMode === 'stretch') {
                    // Estirar la imagen ignorando proporciones
                    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
                } 
                else if (fitMode === 'contain') {
                    // Ajustar la imagen completa dentro del canvas manteniendo proporción
                    const scale = Math.min(canvas.width / bg.width, canvas.height / bg.height);
                    const x = (canvas.width / 2) - (bg.width / 2) * scale;
                    const y = (canvas.height / 2) - (bg.height / 2) * scale;
                    
                    ctx.fillStyle = '#1e1f22'; // Fondo negro detrás por si sobran bordes
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(bg, x, y, bg.width * scale, bg.height * scale);
                } 
                else {
                    // Modo 'cover' (Por defecto): Llenar todo el canvas, centrando y recortando lo que sobre
                    const scale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
                    const x = (canvas.width / 2) - (bg.width / 2) * scale;
                    const y = (canvas.height / 2) - (bg.height / 2) * scale;
                    ctx.drawImage(bg, x, y, bg.width * scale, bg.height * scale);
                }
            } catch (e) {
                ctx.fillStyle = '#1e1f22';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }

        // PANEL DE OSCURECIMIENTO
        ctx.fillStyle = `rgba(0, 0, 0, ${this.settings.opacity || 0.6})`;
        ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);

        // AVATAR
        const avatarX = 40;
        const avatarY = 40;
        const avatarSize = 180; // Un poco más pequeño para dar espacio

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        try {
            const cleanAvatarURL = this.userData.avatarURL.replace('.webp', '.png') + '?size=256';
            const avatar = await loadImage(cleanAvatarURL);
            ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        } catch (e) {
            ctx.fillStyle = '#99aab5';
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        }
        ctx.restore();

        // TEXTOS BASE
        ctx.fillStyle = this.settings.textColor || '#FFFFFF';
        
        // Nombre
        ctx.font = '42px "RobotoBold", "NotoEmoji", "SegoeUISymbol", "DejaVuSans", sans-serif';        let displayName = this.userData.displayName || this.userData.username;
        if (displayName.length > 25) displayName = displayName.substring(0, 25) + "...";
        ctx.fillText(displayName, 250, 90);

        // Puesto en el Leaderboard (Rank)
        ctx.textAlign = 'right';
        ctx.font = '32px "RobotoBold", sans-serif';
        ctx.fillText(`#${this.userData.rank}`, canvas.width - 40, 90);

        // Nivel (Subtítulo derecho)
        ctx.fillStyle = this.settings.barColor || '#FFA500';
        ctx.font = '32px "RobotoBold", sans-serif';
        ctx.fillText(`NIVEL ${this.userData.level}`, canvas.width - 40, 135);

        // Información Extra (Izquierda, debajo del nombre)
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Texto secundario un poco transparente
        ctx.font = '22px "RobotoRegular", "Segoe UI Emoji", sans-serif';
        let infoY = 135;

        // Multiplicador
        if (this.userData.multiplierText) {
            // Limpiamos menciones feas del texto si las hay
            let cleanMult = this.userData.multiplierText.replace(/<@&[0-9]+>/g, 'Rol').replace(/<#[0-9]+>/g, 'Canal');
            ctx.fillText(`🚀 ${cleanMult}`, 250, infoY);
            infoY += 30;
        }

        // Cooldown
        if (this.userData.cooldownText) {
            ctx.fillText(`🕒 Cooldown: ${this.userData.cooldownText}`, 250, infoY);
        }

        // Progreso de XP (Arriba de la barra)
        ctx.textAlign = 'right';
        ctx.fillStyle = this.settings.textColor || '#FFFFFF';
        ctx.font = '22px "RobotoRegular", "Segoe UI Emoji", sans-serif';
        let currentLevelXP = this.userData.previousLevelXP || 0;
        let displayCurrentXP = this.settings.relativeLevel ? (this.userData.currentXP - currentLevelXP) : this.userData.currentXP;
        let displayRequiredXP = this.settings.relativeLevel ? (this.userData.requiredXP - currentLevelXP) : this.userData.requiredXP;
        
        ctx.fillText(`${displayCurrentXP} / ${displayRequiredXP} XP`, canvas.width - 40, 220);

        // BARRA DE PROGRESO
        const barX = 250;
        const barY = 235;
        const barWidth = 640;
        const barHeight = 35;
        const barRadius = 17; 

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, barRadius);
        ctx.fill();

        let percent = 1;
        if (!this.userData.isMaxLevel) {
            percent = (this.userData.currentXP - currentLevelXP) / (this.userData.requiredXP - currentLevelXP);
            percent = Math.max(0, Math.min(percent, 1)); 
        }

        if (percent > 0) {
            ctx.fillStyle = this.settings.barColor || '#FFA500';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barWidth * percent, barHeight, barRadius);
            ctx.fill();
        }

        // Mensajes faltantes (Debajo de la barra, centrado)
        if (!this.userData.isMaxLevel && this.userData.messagesText) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'italic 18px sans-serif';
            ctx.fillText(`¡Faltan ${this.userData.messagesText}!`, barX + (barWidth / 2), 300);
        }

        return canvas.toBuffer('image/png');
    }
}

module.exports = RankCard;