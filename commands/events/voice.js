// commands/events/voice.js
const config = require("../../config.json");

module.exports = {
    async run(client, oldState, newState, tools) {
        if (oldState.member.user.bot) return;
        if (config.lockBotToDevOnly && !tools.isDev(oldState.member.user)) return;

        const userId = oldState.member.user.id;
        const guildId = oldState.guild.id;

        let db = await tools.fetchSettings(userId, guildId);
        
        if (!db || !db.settings?.enabled || !db.settings.enabledVoiceXp) return;

        let settings = db.settings;

        const joinedVoice = !oldState.channelId && newState.channelId;
        const leftVoice = oldState.channelId && !newState.channelId;
        const movedChannel = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;
        
        const stateChanged = oldState.channelId === newState.channelId && 
                             (oldState.selfDeaf !== newState.selfDeaf || oldState.selfMute !== newState.selfMute);

        let userData = db.users[userId] || { xp: 0, cooldown: 0, voiceTime: 0 };
        let needsSave = false;

        if (leftVoice || movedChannel || stateChanged) {
            
            if (userData.voiceTime && userData.voiceTime > 0) {
                
                const timeSpentMs = Date.now() - userData.voiceTime;
                
                if (timeSpentMs > 30000) {
                    
                    const oldChannel = oldState.channel;
                    
                    const isAFKChannel = oldState.guild.afkChannelId && oldState.channelId === oldState.guild.afkChannelId;
                    
                    const wasDeafOrMute = oldState.selfDeaf || oldState.selfMute;
                    
                    const wasAlone = !oldChannel; 

                    let exceededLimit = false;
                    if (settings.voice.hoursLimit > 0) {
                        const maxMsAllowed = settings.voice.hoursLimit * 3600000;
                        if (timeSpentMs > maxMsAllowed) exceededLimit = true;
                    }

                    if (!isAFKChannel && !wasDeafOrMute && !wasAlone && !exceededLimit) {
                        const multiplierData = tools.getMultiplier(oldState.member, settings, oldChannel);
                        
                        if (multiplierData.multiplier > 0 && settings.voice.multiplier > 0) {
                            const oldXP = userData.xp;
                            
                            let xpRange = [settings.gain.min, settings.gain.max].map(x => Math.round(x * multiplierData.multiplier));
                            let baseXP = tools.rng(...xpRange); 
                            
                            let minutesSpent = timeSpentMs / 60000;
                            let xpGained = Math.round(baseXP * settings.voice.multiplier * minutesSpent);
                            
                            if (xpGained > 0) {
                                userData.xp += xpGained;
                                
                                const oldLevel = tools.getLevel(oldXP, settings);
                                const newLevel = tools.getLevel(userData.xp, settings);
        
                                if (newLevel > oldLevel) {
                                    let syncMode = settings.rewardSyncing.sync;
                                    if (syncMode === "xp" || syncMode === "level") {
                                        let roleCheck = tools.checkLevelRoles(oldState.guild.roles.cache, oldState.member.roles.cache, newLevel, settings.rewards, null, oldLevel);
                                        tools.syncLevelRoles(oldState.member, roleCheck).catch(() => {});
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            userData.voiceTime = 0;
            needsSave = true;
        }

        if (joinedVoice || movedChannel || stateChanged) {
            
            const isAFKChannel = newState.guild.afkChannelId && newState.channelId === newState.guild.afkChannelId;
            const isDeafOrMute = newState.selfDeaf || newState.selfMute;

            if (newState.channelId && !isAFKChannel && !isDeafOrMute) {
                userData.voiceTime = Date.now();
                needsSave = true;
            } else if (userData.voiceTime > 0) {
                userData.voiceTime = 0;
                needsSave = true;
            }
        }

        if (needsSave) {
            client.db.update(guildId, { $set: { [`users.${userId}`]: userData } }).catch(err => {
                console.error(`Error guardando Voice XP para ${userId}:`, err);
            });
        }
    }
}