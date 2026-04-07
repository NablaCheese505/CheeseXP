const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const PageEmbed = require('../../classes/PageEmbed.js');

module.exports = {
    metadata: {
        name: "help",
        description: t('commands.help.metadata_description')
    },

    async run(client, int, tools) {
        let db = await tools.fetchSettings(int.user.id, int.guild.id);
        let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

        let commands = Array.from(client.application.commands.cache.values())
            .filter(cmd => cmd.type === 1); 

        commands.sort((a, b) => a.name.localeCompare(b.name));

        let commandList = commands.map(cmd => {
            let tag = `</${cmd.name}:${cmd.id}>`;
            
            let desc = t(`commands.${cmd.name}.metadata_description`, {}, serverLang);
            if (desc === `commands.${cmd.name}.metadata_description`) desc = cmd.description;
            
            return `${tag} - ${desc}`;
        });

        let embed = tools.createEmbed({
            title: t('commands.help.title', {}, serverLang),
            color: tools.COLOR,
            author: { name: client.user.username, iconURL: client.user.displayAvatarURL() }
        });

        let pager = new PageEmbed(embed, commandList, {
            size: 8, 
            owner: int.user.id, 
            timeoutSecs: 60, 
            mapFunction: (item) => item,
            lang: serverLang
        });

        pager.post(int);
    }
}