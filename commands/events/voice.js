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

        let userData = db.users[userId] || { xp: 0, cooldown: 0, voiceTime: 0 };
        let needsSave = false;

        if (leftVoice || movedChannel) {
            
            if (userData.voiceTime && (Date.now() - userData.voiceTime > 30000)) {
                
                const multiplierData = tools.getMultiplier(oldState.member, settings, oldState.channel);
                
                if (multiplierData.multiplier > 0 && settings.voice.multiplier > 0) {
                    const oldXP = userData.xp;
                    
                    let xpRange = [settings.gain.min, settings.gain.max].map(x => Math.round(x * multiplierData.multiplier));
                    let baseXP = tools.rng(...xpRange); 
                    
                    baseXP = Math.round(settings.voice.multiplier * baseXP);
                    
                    let timeSpentMs = Date.now() - userData.voiceTime;
                    
                    if (settings.voice.hoursLimit > 0) {
                        const maxMsAllowed = settings.voice.hoursLimit * 3600000;
                        if (timeSpentMs > maxMsAllowed) {
                            timeSpentMs = maxMsAllowed;
                        }
                    }
                    
                    let minutesSpent = timeSpentMs / 60000;
                    let xpGained = Math.round(baseXP * minutesSpent);
                    
                    if (xpGained > 0) {
                        userData.xp += xpGained;
                        
                        userData.cooldown = Date.now() + (settings.gain.time * 1000);
                        
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
            
            userData.voiceTime = 0;
            needsSave = true;
        }

        if (joinedVoice || movedChannel) {
            userData.voiceTime = Date.now();
            needsSave = true;
        }

        if (needsSave) {
            client.db.update(guildId, { $set: { [`users.${userId}`]: userData } }).catch(err => {
                console.error(`Error guardando Voice XP para ${userId}:`, err);
            });
        }
    }
}