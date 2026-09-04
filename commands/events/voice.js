// commands/events/voice.js
const config = require("../../config.json");

module.exports = {
    async run(client, oldState, newState, tools) {
        if (oldState.member.user.bot) return;
        if (config.lockBotToDevOnly && !tools.isDev(oldState.member.user)) return;

        const guildId = oldState.guild.id;

        // Validar si el server tiene Voice XP activado
        let db = await tools.fetchSettings(oldState.member.user.id, guildId);
        if (!db || !db.settings?.enabled || !db.settings.enabledVoiceXp) return;

        // Usamos un Set para no evaluar el mismo canal dos veces si solo se muteó/desmuteó
        const channelsToEvaluate = new Set();
        if (oldState.channelId) channelsToEvaluate.add(oldState.channel);
        if (newState.channelId) channelsToEvaluate.add(newState.channel);

        // Iterador optimizado (for...of) sin callbacks
        for (const channel of channelsToEvaluate) {
            if (!channel) continue;
            
            const isAFKChannel = channel.guild.afkChannelId && channel.id === channel.guild.afkChannelId;
            
            // Contamos humanos en el canal optimizadamente
            let humanCount = 0;
            for (const [id, member] of channel.members) {
                if (!member.user.bot) humanCount++;
            }
            
            const isLurking = humanCount < 2;

            // Evaluamos a cada humano en el canal
            for (const [memberId, member] of channel.members) {
                if (member.user.bot) continue;

                // Verificamos tanto muteo personal como muteo por servidor
                const voiceState = member.voice;
                const isDeafOrMute = voiceState.selfDeaf || voiceState.selfMute || voiceState.serverDeaf || voiceState.serverMute;
                
                const isEligibleForXP = !isAFKChannel && !isDeafOrMute && !isLurking;

                if (isEligibleForXP) {
                    if (!client.activeVoiceUsers.has(memberId)) {
                        client.activeVoiceUsers.set(memberId, { 
                            guildId: guildId, 
                            channelId: channel.id,
                            joinTime: Date.now() // Guardamos el timestamp para que Tools.js evalúe el hoursLimit
                        });
                    }
                    client.startVoiceHeartbeat();
                } else {
                    client.activeVoiceUsers.delete(memberId);
                }
            }
        }
    }
}