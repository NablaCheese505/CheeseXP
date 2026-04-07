const config = require('../config.json');
const fs = require('fs');
const path = require('path');

const DEFAULT_LANG = config.defaultLanguage || 'en';
const locales = {};
const availableLanguages = [];

const langPath = path.join(__dirname, '../lang');
const files = fs.readdirSync(langPath).filter(f => f.endsWith('.json'));

for (const file of files) {
    const langCode = file.replace('.json', '');
    locales[langCode] = require(path.join(langPath, file));
    availableLanguages.push(langCode);
}

function getAvailableLanguages() {
    return availableLanguages.map(lang => {
        const langName = locales[lang].languageName || lang.toUpperCase(); 
        return { name: langName, value: lang };
    });
}

function t(key, variables = {}, lang = DEFAULT_LANG) {
    const selectedLang = locales[lang] ? locales[lang] : locales[DEFAULT_LANG];
    const keys = key.split('.');
    let text = selectedLang;
    
    for (const k of keys) {
        if (text[k] === undefined) return key; 
        text = text[k];
    }

    const variablesFinales = { 
        ...config.emojis, 
        ...variables 
    };

    for (const [varName, varValue] of Object.entries(variablesFinales)) {
        text = text.replaceAll(`{${varName}}`, varValue);
    }
    return text;
}

function getLocalizations(key) {
    const localizations = {};
    for (const lang of availableLanguages) {
        let discordLang = lang;
        if (lang === 'en') discordLang = 'en-US';
        if (lang === 'es') discordLang = 'es-ES';
        
        const text = t(key, {}, lang);
        if (text !== key) {
            localizations[discordLang] = text;
        }
    }
    return localizations;
}

module.exports = { t, getAvailableLanguages, availableLanguages, DEFAULT_LANG, getLocalizations };