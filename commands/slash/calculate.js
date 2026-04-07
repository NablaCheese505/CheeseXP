//slash/calculate.js
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const multiplierModes = require("../../json/multiplier_modes.json");

module.exports = {
metadata: {
    name: "calculate",
    description: t('commands.calculate.metadata_description'),
    args: [
        { type: "integer", name: "target", description: t('commands.calculate.args_target_desc'), min: 1, max: 1000, required: true },
        { type: "user", name: "member", description: t('commands.calculate.args_member_desc'), required: false }
    ]
},

async run(client, int, tools) {

    let member = int.member;
    let foundUser = int.options.get("member"); 
    if (foundUser) member = foundUser.member;

    let db = await tools.fetchSettings(member.id, int.guild.id);
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!db) return tools.warn("*noData");
    else if (!db.settings.enabled) return tools.warn("*xpDisabled");

    let targetLevel = Math.min(int.options.get("target").value, db.settings.maxLevel);
    let targetXP = tools.xpForLevel(targetLevel, db.settings);
    
    let cardCol = db.settings.rankCard.embedColor;
    if (cardCol == -1) cardCol = null;

    if (db.settings.rankCard.disabled) {
        let miniEmbed = tools.createEmbed({
            title: t('commands.calculate.miniTitle', { level: tools.commafy(targetLevel) }, serverLang),
            color: cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor),
            description: t('commands.calculate.miniDesc', { xp: tools.commafy(targetXP) }, serverLang),
            footer: t('commands.calculate.miniFooter', {}, serverLang)
        });
        return int.reply({embeds: [miniEmbed]});
    }

    let currentXP = db.users[member.id];
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user);
    let xp = currentXP.xp;
    let userLevel = tools.getLevel(xp, db.settings);

    let remaining = targetXP - xp;
    let reached = remaining <= 0;
    let percent = xp / targetXP * 100;

    let barSize = 33;
    let barRepeat = Math.min(barSize, Math.round(percent / (100 / barSize)));
    let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${Number(percent.toFixed(2))}%)`;

    if (targetLevel == userLevel && userLevel >= db.settings.maxLevel) progressBar += t('commands.calculate.maxLevel', { inServer: db.settings.maxLevel < 1000 ? t('commands.calculate.inServer', {}, serverLang) : "" }, serverLang);

    let multiplierData = tools.getMultiplier(member, db.settings);
    let multiplier = multiplierData.multiplier || multiplierData.role;
    if (multiplier <= 0) return int.reply(t('commands.calculate.noMultiplier', {}, serverLang));

    let estimatedMin = Math.ceil(remaining / (db.settings.gain.min * multiplier));
    let estimatedMax = Math.ceil(remaining / (db.settings.gain.max * multiplier));
    let estimatedAvg = Math.round((estimatedMax + estimatedMin) / 2);
    let estimatedTime = estimatedAvg * db.settings.gain.time;

    let estimatedRange = (estimatedMax == estimatedMin) ? `${tools.commafy(estimatedMax)}` : `${tools.commafy(estimatedMax)} - ${tools.commafy(estimatedMin)}${t('commands.calculate.avg', { avg: tools.commafy(estimatedAvg) }, serverLang)}`;

    let levelDetails = [
        t('commands.calculate.currentXP', { xp: tools.commafy(xp), level: tools.commafy(userLevel) }, serverLang),
        t('commands.calculate.targetXP', { xp: tools.commafy(targetXP) }, serverLang),
        t('commands.calculate.remainingXP', { prefix: reached ? "0 (" : "", xp: tools.commafy(targetXP - xp), suffix: reached ? ")" : "" }, serverLang)
    ];

    if (!reached) {
        levelDetails = levelDetails.concat([
            "",
            t('commands.calculate.xpPerMsg', { xp: db.settings.gain.min == db.settings.gain.max ? tools.commafy(Math.round(db.settings.gain.min * multiplier)) : `${tools.commafy(Math.round(db.settings.gain.min * multiplier))} - ${tools.commafy(Math.round(db.settings.gain.max * multiplier))}` }, serverLang),
            t('commands.calculate.msgRemaining', { range: estimatedRange }, serverLang),
            t('commands.calculate.cooldownRemaining', { time: estimatedTime == Infinity ? t('commands.calculate.endOfTime', {}, serverLang) : tools.time(estimatedTime * 1000, 1) }, serverLang),
        ]);

        if (db.settings.enabledVoiceXp) {
            let avgBaseXp = ((db.settings.gain.min + db.settings.gain.max) / 2) * multiplier;
            let avgVoiceXpPerMin = avgBaseXp * db.settings.voice.multiplier;

            if (avgVoiceXpPerMin > 0) {
                let msRequired = (remaining / avgVoiceXpPerMin) * 60000;
                let timeString = tools.time(msRequired, 1);
                let micIcon = config.emojis?.mic || "🎤"; 
                levelDetails.push(t('commands.calculate.voice_estimate', { emoji: micIcon, time: timeString }, serverLang));
            }
        }
    }

    let embed = tools.createEmbed({
        author: { name: member.user.displayName, iconURL: member.displayAvatarURL() },
        title: t('commands.calculate.embedTitle', { level: tools.commafy(targetLevel), reached: reached ? t('commands.calculate.reached', {}, serverLang) : "" }, serverLang),
        color: cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor),
        description: levelDetails.join("\n"), footer: progressBar
    });

    return int.reply({embeds: [embed]});

}}