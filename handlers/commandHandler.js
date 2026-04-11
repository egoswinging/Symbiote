const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const categories = fs.readdirSync(commandsPath);
  let loaded = 0;

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
      try {
        const exported = require(path.join(categoryPath, file));
        const commands = Array.isArray(exported) ? exported : [exported];

        for (const command of commands) {
          if (!command?.name) continue;
          client.commands.set(command.name, command);
          if (command.aliases?.length) {
            for (const alias of command.aliases) client.commands.set(alias, command);
          }
          loaded++;
        }
      } catch (err) {
        console.error(`Failed to load ${file}:`, err.message);
      }
    }
  }

  console.log(`Loaded ${loaded} commands`);
}

module.exports = { loadCommands };
