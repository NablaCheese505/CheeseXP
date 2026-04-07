const PageEmbed = require("../../classes/PageEmbed.js");
const Discord = require("discord.js");
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');

module.exports = {
metadata: {
    name: "button:list_multipliers",
},

async run(client, int, tools) {
    let db = await tools.fetchSettings(int.user.id, int.guild.id);
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!db) return tools.warn("*noData");
    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod");

    let isChannel = int.customId.split("~")[1] == "channels";
    let mList = db.settings.multipliers[isChannel ? "channels" : "roles"];
    
    let typeName = isChannel ? t('commands.list_multipliers.typeChannel', {}, serverLang) : t('commands.list_multipliers.typeRole', {}, serverLang);

    if (!mList.length) return tools.warn(t('commands.list_multipliers.noMultipliers', { type: typeName.toLowerCase() }, serverLang));

    let embed = tools.createEmbed({
        title: t('commands.list_multipliers.title', { type: typeName, count: mList.length }, serverLang),
        color: tools.COLOR,
        footer: t('commands.list_multipliers.footer', {}, serverLang)
    });

    let multipliers = mList.sort((a, b) => a.boost - b.boost);

    let categories;
    if (isChannel) {
        categories = await int.guild.channels.fetch().then(x => x.filter(c => c.type == Discord.ChannelType.GuildCategory).map(x => x.id));
    }

    let multiplierEmbed = new PageEmbed(embed, multipliers, {
        size: 20, owner: int.user.id,
        mapFunction: (x) => {
            let formattedId = isChannel ? (categories.includes(x.id) ? `**<#${x.id}>** ${t('commands.list_multipliers.category', {}, serverLang)}` : `<#${x.id}>`) : `<@&${x.id}>`;
            return `**${x.boost}x:** ${formattedId}`;
        }
    });

    multiplierEmbed.post(int);
}}