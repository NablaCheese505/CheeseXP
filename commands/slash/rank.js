//slash/rank.js
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const multiplierModes = require("../../json/multiplier_modes.json")
const RankCard = require('../../classes/RankCard.js');

module.exports = {
metadata: {
    name: "rank",
    description: t('commands.rank.metadata_description'),
    args: [
        { type: "user", name: "member", description: t('commands.rank.args_member_desc'), required: false },
        { type: "bool", name: "hidden", description: t('commands.rank.args_hidden_desc'), required: false }
    ]
},

async run(client, int, tools) {

    let member = int.member
    let foundUser = int.options.get("user") || int.options.get("member") 
    if (foundUser) member = foundUser.member

    let db = await tools.fetchAll(int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!member) return tools.warn(t('commands.rank.notFound', {}, serverLang))

    if (!db) return tools.warn("*noData")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    let currentXP = db.users[member.id]

    if (db.settings.rankCard.disabled) return tools.warn(t('commands.rank.disabled', {}, serverLang))
    
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)

    let xp = currentXP.xp

    let levelData = tools.getLevel(xp, db.settings, true)       
    let maxLevel = levelData.level >= db.settings.maxLevel      

    let remaining = levelData.xpRequired - xp
    let levelPercent = maxLevel ? 100 : (xp - levelData.previousLevel) / (levelData.xpRequired - levelData.previousLevel) * 100

    let multiplierData = tools.getMultiplier(member, db.settings)
    let multiplier = multiplierData.multiplier

    let barSize = 33    
    let barRepeat = Math.round(levelPercent / (100 / barSize)) 
    let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${!maxLevel ? Number(levelPercent.toFixed(2)) + "%" : t('commands.rank.max', {}, serverLang)})`

    let estimatedMin = Math.ceil(remaining / (db.settings.gain.min * (multiplier || multiplierData.role)))
    let estimatedMax = Math.ceil(remaining / (db.settings.gain.max * (multiplier || multiplierData.role)))

    let estimatedRange = (estimatedMax == estimatedMin) ? 
        t(estimatedMax === 1 ? 'commands.rank.msgSingle' : 'commands.rank.msgPlural', { count: tools.commafy(estimatedMax) }, serverLang) : 
        t('commands.rank.msgRange', { max: tools.commafy(estimatedMax), min: tools.commafy(estimatedMin) }, serverLang)

    let nextLevelXP = (db.settings.rankCard.relativeLevel ? `${tools.commafy(xp - levelData.previousLevel)}/${tools.commafy(levelData.xpRequired - levelData.previousLevel)}` : `${tools.commafy(levelData.xpRequired)}`) + t('commands.rank.moreXP', { remaining: tools.commafy(remaining) }, serverLang)

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    let memberAvatar = member.displayAvatarURL()
    let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)

    let embed = tools.createEmbed({
        author: { name: member.user.displayName, iconURL: memberAvatar },
        color: memberColor,
        footer: maxLevel ? progressBar : ((estimatedMin == Infinity || estimatedMin < 0) ? t('commands.rank.unableToGain', {}, serverLang) : `${progressBar}\n${t('commands.rank.toGo', { range: estimatedRange }, serverLang)}`),
        fields: [
            { name: t('commands.rank.fieldXP', {}, serverLang), value: `${tools.commafy(xp)} (lv. ${levelData.level})`, inline: true },
            { name: t('commands.rank.fieldNext', {}, serverLang), value: !maxLevel ? nextLevelXP : t('commands.rank.maxLevel', {}, serverLang), inline: true },
        ]
    })

    if (!db.settings.rankCard.hideCooldown) {
        let foundCooldown = currentXP.cooldown || 0
        let cooldown = foundCooldown > Date.now() ? tools.timestamp(foundCooldown - Date.now()) : t('commands.rank.none', {}, serverLang)
        embed.addFields([{ name: t('commands.rank.fieldCooldown', {}, serverLang), value: cooldown, inline: true }])
    }

    let hideMult = db.settings.hideMultipliers

    let multRoles = multiplierData.roleList
    let multiplierInfo = []
    if ((!hideMult || multiplierData.role == 0) && multRoles.length) {
        let xpStr = multiplierData.role > 0 ? `${multiplierData.role}x XP` : t('commands.rank.cannotGainXP', {}, serverLang)
        let roleMultiplierStr = multRoles.length == 1 ? `${int.guild.id != multRoles[0].id ? `<@&${multRoles[0].id}>` : t('commands.rank.everyone', {}, serverLang)} - ${xpStr}` : t('commands.rank.roleCount', { count: multRoles.length, xpStr: xpStr }, serverLang)
        multiplierInfo.push(roleMultiplierStr)
    }

    let multChannels = multiplierData.channelList
    if ((!hideMult || multiplierData.channel == 0) && multChannels.length && multiplierData.role > 0 && (multiplierData.role != 1 || multiplierData.channel != 1)) {
        let chXPStr = multChannels[0].boost > 0 ? `${multiplierData.channel}x XP` : t('commands.rank.cannotGainXP', {}, serverLang)
        let chMultiplierStr = `<#${multChannels[0].id}> - ${chXPStr}` 
        multiplierInfo.push(chMultiplierStr)
        if (multRoles.length) multiplierInfo.push(t('commands.rank.totalMult', { multiplier: multiplier, stacking: multiplierModes.channelStacking[multiplierData.channelStacking].toLowerCase() }, serverLang))
    }

    if (multiplierInfo.length) embed.addFields([{ name: t('commands.rank.fieldMult', {}, serverLang), value: multiplierInfo.join("\n") }])

    else if (!db.settings.rewardSyncing.noManual && !db.settings.rewardSyncing.noWarning) {
        let syncCheck = tools.checkLevelRoles(int.guild.roles.cache, member.roles.cache, levelData.level, db.settings.rewards)
        if (syncCheck.incorrect.length || syncCheck.missing.length) embed.addFields([{ name: t('commands.rank.fieldNote', {}, serverLang), value: t('commands.rank.syncWarning', { command: tools.commandTag("sync") }, serverLang) }])
    }

    let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value;

    // --- NUEVA LÓGICA: SWITCH EXPLICITO ---
    if (db.settings.rankCard.useImageCard) {
        await int.deferReply({ ephemeral: isHidden });

        // 1. Calcular el puesto (Rank) usando las herramientas estándar (como en top.js)
        let minLeaderboardXP = db.settings.leaderboard.minLevel > 1 ? tools.xpForLevel(db.settings.leaderboard.minLevel, db.settings) : 0;
        
        let rankings = tools.xpObjToArray(db.users || {});
        rankings = rankings.filter(x => x.xp > minLeaderboardXP && !x.hidden).sort((a, b) => b.xp - a.xp);
        
        let userRankIndex = rankings.findIndex(x => x.id == member.id);
        let userRank = userRankIndex !== -1 ? userRankIndex + 1 : "?";

        // 2. Extraer textos adicionales
        let cooldownText = null;
        if (!db.settings.rankCard.hideCooldown) {
            let foundCooldown = currentXP.cooldown || 0;
            if (foundCooldown > Date.now()) cooldownText = tools.timestamp(foundCooldown - Date.now());
        }
        let multiplierText = multiplierInfo.length > 0 ? multiplierInfo[0] : null;

        let userDataForImage = {
            username: member.user.username,
            displayName: member.user.displayName,
            avatarURL: memberAvatar,
            currentXP: xp,
            requiredXP: levelData.xpRequired,
            previousLevelXP: levelData.previousLevel,
            level: levelData.level,
            isMaxLevel: maxLevel,
            rank: userRank,
            messagesText: estimatedRange,
            cooldownText: cooldownText,
            multiplierText: multiplierText
        };
        
        let cardSettingsToUse = db.settings.rankCard; 
        
        if (db.settings.rankCard.allowUserCards) {
            // 1. Verificación de Rol
            let reqRole = db.settings.rankCard.requiredRole;
            let hasRequiredRole = (!reqRole || reqRole === "none") ? true : member.roles.cache.has(reqRole);
            
            // 2. Verificación de Nivel (NUEVA)
            let reqLevel = db.settings.rankCard.requiredLevel || 0;
            let hasRequiredLevel = levelData.level >= reqLevel;

            // Solo si cumple ambos requisitos, buscamos su perfil global
            if (hasRequiredRole && hasRequiredLevel) {
                let userGlobalProfile = await client.userDB.fetch(member.id);
                
                if (userGlobalProfile && userGlobalProfile.rankCard && userGlobalProfile.rankCard.backgroundColor) {
                    cardSettingsToUse = userGlobalProfile.rankCard;
                }
            }
        }
        try {
            // Le pasamos a la clase RankCard la configuración ganadora
            const rankCardGenerator = new RankCard(userDataForImage, cardSettingsToUse);
            const imageBuffer = await rankCardGenerator.build();
            return int.editReply({ files: [{ attachment: imageBuffer, name: 'rank.png' }] });
        } catch (error) {
            console.error("Error generando RankCard:", error);
            return int.editReply({ content: "Error al generar la imagen.", embeds: [embed] });
        }
    } 
    else {
        // MODO CLÁSICO (Texto/Embed original)
        return int.reply({embeds: [embed], ephemeral: isHidden});
    }

}}