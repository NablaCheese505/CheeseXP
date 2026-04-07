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

        // 1. Obtener todos los Slash Commands registrados
        let commands = Array.from(client.application.commands.cache.values())
            .filter(cmd => cmd.type === 1); // 1 = ChatInput (Comandos de barra)

        // 2. Ordenarlos alfabéticamente
        commands.sort((a, b) => a.name.localeCompare(b.name));

        // 3. Formatear la lista usando las traducciones en vivo
        let commandList = commands.map(cmd => {
            // Etiqueta nativa clickeable de Discord
            let tag = `</${cmd.name}:${cmd.id}>`;
            
            // Buscar la traducción dinámica. Si no existe, usar la descripción cruda de Discord.
            let desc = t(`commands.${cmd.name}.metadata_description`, {}, serverLang);
            if (desc === `commands.${cmd.name}.metadata_description`) desc = cmd.description;
            
            return `${tag} - ${desc}`;
        });

        // 4. Crear el Embed base
        let embed = tools.createEmbed({
            title: t('commands.help.title', {}, serverLang),
            color: tools.COLOR,
            author: { name: client.user.username, iconURL: client.user.displayAvatarURL() }
        });

        // 5. Instanciar el paginador interactivo
        let pager = new PageEmbed(embed, commandList, {
            size: 8, 
            owner: int.user.id, 
            timeoutSecs: 60, 
            mapFunction: (item) => item,
            lang: serverLang
        });

        // 6. Enviar al chat
        pager.post(int);
    }
}