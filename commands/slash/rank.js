//slash/rank.js
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const multiplierModes = require("../../json/multiplier_modes.json")

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

    let db = await tools.fetchSettings(member?.id || int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'es';

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

    let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value
    return int.reply({embeds: [embed], ephemeral: isHidden})

}}