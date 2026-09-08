// commands/events/voice.js
const config = require("../../config.json");

module.exports = {
    async run(client, oldState, newState, tools) {
        if (oldState.member.user.bot) return;
        if (config.lockBotToDevOnly && !tools.isDev(oldState.member.user)) return;

        // If the user left the voice channel, remove them from the activeVoiceUsers map
        if (!newState.channelId) {
            client.activeVoiceUsers.delete(oldState.member.user.id);
        }

        const guildId = oldState.guild.id;

        // Validate if the voice XP module is enabled for this guild and user
        let db = await tools.fetchSettings(oldState.member.user.id, guildId);
        if (!db || !db.settings?.enabled || !db.settings.enabledVoiceXp) {
            // If the module is disabled, ensure the user is removed from the activeVoiceUsers map
            client.activeVoiceUsers.delete(oldState.member.user.id);
            return;
        }

        // We use a Set to avoid processing the same channel multiple times
        const channelsToEvaluate = new Set();
        if (oldState.channelId) channelsToEvaluate.add(oldState.channel);
        if (newState.channelId) channelsToEvaluate.add(newState.channel);

        // oPtimized evaluation of each channel
        for (const channel of channelsToEvaluate) {
            if (!channel) continue;
            
            const isAFKChannel = channel.guild.afkChannelId && channel.id === channel.guild.afkChannelId;
            
            // Count the number of human users in the channel
            let humanCount = 0;
            for (const [id, member] of channel.members) {
                if (!member.user.bot) humanCount++;
            }
            
            const isLurking = humanCount < 2;

            // Evaluate each member in the channel for XP eligibility
            for (const [memberId, member] of channel.members) {
                if (member.user.bot) continue;

                // Verifiy if the member is in the AFK channel, is deafened, or is muted
                const voiceState = member.voice;
                const isDeafOrMute = voiceState.selfDeaf || voiceState.selfMute || voiceState.serverDeaf || voiceState.serverMute;
                
                const isEligibleForXP = !isAFKChannel && !isDeafOrMute && !isLurking;

                if (isEligibleForXP) {
                    if (!client.activeVoiceUsers.has(memberId)) {
                        client.activeVoiceUsers.set(memberId, { 
                            guildId: guildId, 
                            channelId: channel.id,
                            joinTime: Date.now() 
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