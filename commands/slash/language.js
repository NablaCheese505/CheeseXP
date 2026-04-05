const { t, getAvailableLanguages } = require('../../utils/i18n.js');

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "language",
    description: "Cambia el idioma del bot en este servidor / Change bot language",
    args: [ // <-- CAMBIADO DE 'options' A 'args'
        {
            type: "string", // <-- CAMBIADO DE '3' a '"string"'
            name: "idioma",
            description: "Selecciona el idioma",
            required: true,
            choices: getAvailableLanguages() // ¡Carga automática desde la carpeta lang/!
        }
    ]
},

async run(client, int, tools) {
    let db = await tools.fetchSettings(int.user.id, int.guild.id);
    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod");

    // Extraemos el valor usando el mismo método que usa addxp.js
    const newLang = int.options.get("idioma")?.value;

    if (!newLang) return; // Por seguridad

    // Guardar en la base de datos (MongoDB)
    await client.db.update(int.guild.id, { $set: { "settings.lang": newLang } }).exec();

    // Responder en el NUEVO idioma seleccionado
    return int.reply({ 
        content: t('commands.language.success', { lang: newLang }, newLang), 
        ephemeral: true 
    });
}}