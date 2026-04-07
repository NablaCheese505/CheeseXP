const PageEmbed = require("../../classes/PageEmbed.js");
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');

module.exports = {
metadata: {
    name: "button:list_reward_roles",
},

async run(client, int, tools) {
    let db = await tools.fetchSettings(int.user.id, int.guild.id);
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!db) return tools.warn("*noData");
    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod");

    if (!db.settings.rewards.length) return tools.warn(t('commands.list_rewards.noRewardRoles', {}, serverLang));

    let embed = tools.createEmbed({
        title: t('commands.list_rewards.title', { count: db.settings.rewards.length }, serverLang),
        color: tools.COLOR,
        footer: t('commands.list_rewards.footer', {}, serverLang)
    });

    let rewards = db.settings.rewards.sort((a, b) => a.level - b.level);

    let rewardEmbed = new PageEmbed(embed, rewards, {
        size: 20, owner: int.user.id,
        mapFunction: (x) => t('commands.list_rewards.item', {
            level: x.level,
            id: x.id,
            keep: x.keep ? t('commands.list_rewards.keep', {}, serverLang) : "",
            noSync: x.noSync ? t('commands.list_rewards.noSync', {}, serverLang) : ""
        }, serverLang)
    });

    rewardEmbed.post(int);
}}