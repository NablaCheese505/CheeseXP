# 🧀 CheeseXP Bot

<div align="center">
  <img src="https://komarev.com/ghpvc/?username=NablaCheese505-CheeseXP&label=Profile%20Views&color=00ff80&style=for-the-badge" alt="View Counter" />
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Discord.js-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js" />
  <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</div>

<br>

## 📖 Description
A fully customizable, bullshit-free, and open-source levelling bot for Discord. 

**CheeseXP** is a modernized, heavily upgraded fork based on the original architecture of [Polaris by GD Colon](https://github.com/GDColon/Polaris). As the original project became increasingly difficult to host and maintain, this repository steps in to pass the torch. 

Maintained and expanded for the modern Discord ecosystem, CheeseXP provides server administrators with a powerful web dashboard and users with deep personalization tools, all while remaining 100% open-source so anyone can easily host their own instance.

<div align="center">
  <img src="./docs/images/hero.png" alt="CheeseXP Dashboard and Rankcard Preview" width="700">
</div>

## ✨ What makes CheeseXP different?

While keeping the core philosophy of the original Polaris, CheeseXP introduces several major architectural upgrades and community-requested features:

1. **🌍 Internationalization (i18n & l10n)**
   * **Native Multi-language:** Full support for English and Spanish across all Discord slash commands, bot responses, and the interactive web dashboard.
   * **Custom Emojis:** Replaced static bot emojis with a configurable system, allowing you to use your own server's custom emojis for bot UI elements.

2. **🎨 Global Custom Rankcards**
   * **User-Driven Design:** Members get access to a dedicated `/profile` web dashboard to design their own Rank Cards.
   * **Live Preview:** Real-time visual editor for custom background images, colors, overlay opacity, and avatar shapes. These settings sync globally across any server hosting the bot that permits custom cards.

3. **🎙️ Voice XP Integration**
   * **Beyond Text:** Members can now earn XP natively by participating in Voice Channels.
   * **Configurable:** Server admins can set specific Voice Multipliers (e.g., granting 1.5x the text XP per minute) and implement continuous hour limits to prevent AFK farming.

4. **🐳 Docker Ready**
   * **Painless Deployment:** Say goodbye to dependency hell. CheeseXP is fully Dockerized, meaning you can spin up the bot, the web server, and the database environment with a single `docker-compose` command.

5. **🛡️ Security & QoL Patches**
   * **Session Isolation & XSS Protection:** Fixed critical cache-leaking bugs from the original web server to ensure robust, isolated user sessions, alongside rigorous input sanitization to prevent Cross-Site Scripting (XSS) vulnerabilities.
   * **Responsive Dashboard UI:** Overhauled the web interface's CSS to ensure full mobile compatibility and a seamless, responsive experience across all devices.
   * **Database Optimization:** Implemented Mongoose `.lean()` queries and atomic updates to prevent memory leaks and ensure instant synchronization between the web dashboard and Discord commands.

***
## 🚀 Quick Start: Use the Official Instance!

If you just want to use CheeseXP without the hassle of setting up a server, database, and managing updates, you can invite the official, 24/7 hosted version of the bot to your server right now:

**🔗 [Visit the Official CheeseXP Dashboard & Invite](https://cheesexp.duckdns.org/)**

---

## 🛠️ Hosting Your Own Instance (Docker / Recommended)

CheeseXP is fully containerized. The included Dockerfile automatically handles tricky dependencies like Node.js v20, Python/C++ build tools (required for `canvas`), and all necessary fonts for generating beautiful custom Rankcards.

### Step 1: Prerequisites
1. **Discord Application:** Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new app.
   - Go to the **Bot** tab, generate a **Token**, and enable the required intents.
   - Go to the **OAuth2** tab and generate a **Client Secret**.
   - In the OAuth2 tab, add your redirect URI (e.g., `http://your-ip:6880/auth` or `https://yourdomain.com/auth`).
2. **MongoDB Database:** You need a MongoDB instance. You can use a free cloud cluster from [MongoDB Atlas](https://cloud.mongodb.com/) or host it locally. 
   > **Note:** CheeseXP includes a DNS workaround (`dns.setServers(['8.8.8.8', '1.1.1.1']);`) by default to prevent connection timeouts with newer Node.js + Mongoose versions.
3. **Docker & Git:** Ensure you have Docker, Docker Compose, and Git installed on your VPS or local machine.

### Step 2: Clone and Configure
Before booting up the bot, you must set up your environment variables and configuration files.

```bash
git clone [https://github.com/NablaCheese505/CheeseXP.git](https://github.com/NablaCheese505/CheeseXP.git)
cd CheeseXP
```

**1. Environment Variables (`.env`)**
Copy the `.env.example` file and rename it to `.env`. Fill in your specific details:

```env
DISCORD_ID=your_bot_client_id
DISCORD_TOKEN=your_bot_token
DISCORD_SECRET=your_oauth2_secret

# MongoDB connection
MONGO_DB_NAME=cheesexp
MONGO_DB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
```

**2. Bot Configuration (`config.json`)**
Open `config.json` and adjust the crucial settings:
- `developer_ids`: Add your personal Discord User ID (this grants you access to dev commands like `/deploy`).
- `siteURL`: Set this to your public URL (e.g., `https://cheesexp.duckdns.org` or `http://localhost:6880`).
- `emojis`: Replace the default Discord emoji IDs with your own server's custom emojis.
- `defaultLanguage`: Set to `"en"` or `"es"`.

### Step 3: Lift Off! 🐳
Once your `.env` and `config.json` are ready, simply build and start the container:

```bash
docker compose up -d --build
```
This will build the image, install all dependencies, and start the bot in the background. Check the logs with `docker compose logs -f` to ensure it connected to Discord and MongoDB successfully.

**Final Step:** In your Discord server, run the `/deploy global:True` command (available only to the IDs listed in `developer_ids`) to register all slash commands.

### 🔄 How to Update
Updating your instance is as simple as pulling the latest changes and rebuilding the container:

```bash
git pull origin main
# Modify config.json or .env here if there are new required fields
docker compose up -d --build
```

---

## 💻 Development & Modifying (The Manual Way)

If you want to modify the code, test new features, or run it "bare metal" without Docker, you'll need to set up the environment manually. 

**Requirements:**
- **Node.js 20+**
- **Python 3 & C++ Build Tools** (Strictly required to compile the `canvas` package).
- **System Fonts** (Ensure your OS has standard fonts and emoji fonts installed, otherwise the Rankcards will fail to render text/emojis).

**Setup:**
1. Clone the repo and configure your `.env` and `config.json` exactly as shown in Step 2 above.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the bot:
   ```bash
   node polaris.js
   ```
---

## 🗃️ Transferring Data (From Original Polaris)

If you are migrating from the original Polaris bot to your own CheeseXP instance, you can easily transfer your server's XP and settings. 

**NOTE**: You must be listed in `developer_ids` to use the JSON import feature (for security reasons).
1. On the original Polaris dashboard, go to the **Data** tab of your server settings and press **Download all data** to get a `.json` file.
2. On your hosted CheeseXP dashboard, navigate to the same **Data** tab and scroll down to the import section.
3. Upload the `.json` file and click import.
4. All your previous data is now safely stored in CheeseXP!

---

## 🛠️ Developer Commands

If your ID is listed in the `developer_ids` array inside `config.json`, you gain access to exclusive slash commands to manage the bot:

- `/deploy` - Deploys or updates the slash commands. Run this with `global:True` when you first start the bot or after adding new commands.
- `/db` - Allows you to view or modify a server's raw data directly.
  - *Example:* `/db property:settings.multipliers` returns the multiplier data.
  - *Example:* `/db property:users.123456.xp new_value:10` manually sets a user's XP.
- `/setactivity` - Changes the bot's custom status (Playing, Watching, etc.).
- `/setversion` - Updates the version number displayed in `/botstatus`.
- `/run` - Evaluates raw JavaScript code (use with extreme caution).

---

## 📜 Credits & Modifying the Bot

**CheeseXP** is a fork of the original **[Polaris](https://github.com/GDColon/Polaris)** bot. 

A massive thank you to the original creator, **[GD Colon](https://github.com/GDColon)**, for building the incredible foundation, the web dashboard architecture, and the core leveling logic that made this project possible.

If you want to modify this bot, fork the repo and do whatever you want, provided you follow the original author's rules:
* **Credit the original creator (GD Colon) and this fork (CheeseXP / NablaCheese505) clearly.**
* **Do NOT add any paid or monetized features.** This project must remain free and open-source.
* Issues and PRs on this repo are welcome if they fix bugs, update dependencies, or improve the open-source code.

*If the code is bad, forgive us.*