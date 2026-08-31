import GargoyleSlashCommandBuilder from "@src/system/backend/builders/gargoyleSlashCommandBuilder";
import GargoyleClient from "@src/system/backend/classes/gargoyleClient";
import GargoyleModule from "@src/system/backend/classes/gargoyleModule";
import { ChatInputCommandInteraction } from "discord.js";

// Main goal is to store all guns, all attachments, all ammo in memory
// Automatically map all items downloaded over steamcmd
// And produce the mathematically best builds
// Reference can be found here: https://docs.smartlydressedgames.com/en/stable/items/introduction.html
//
// Gun Assets: https://docs.smartlydressedgames.com/en/stable/items/gun-asset.html
// Grip Assets: https://docs.smartlydressedgames.com/en/stable/items/grip-asset.html
// Magazine Assets: https://docs.smartlydressedgames.com/en/stable/items/magazine-asset.html
// Sight Assets: https://docs.smartlydressedgames.com/en/stable/items/sight-asset.html
// Tactical Assets: https://docs.smartlydressedgames.com/en/stable/items/tactical-asset.html
// Barrel Assets: https://docs.smartlydressedgames.com/en/stable/items/barrel-asset.html
//
// Eventually I want this:
// /hephaestus build [optional gun] <dps|recoil|ttk>
// Where it will build it based off of all compatibilities automatically, optimized for DPS, Recoil or TTK
// And it gives you all the IDs of the things it chooses, names and calibers.
//
// So first things first is to ingest all .dat files to memory

export default class Hephaestus extends GargoyleModule {
    public override name: string = 'hephaestus';
    public override category: string = 'entropy';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder().setName('hephaestus').setDescription('Hephaestus Manager').addGuild('1009048008857493624').addSubcommand(s =>
            s.setName('actualize').setDescription('Actualize Inventory')
        ) as GargoyleSlashCommandBuilder

    ]

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        if (interaction.options.getSubcommand() === "actualize") {
            await interaction.editReply(await this.actualizeNordic())
        }
    }

    private async actualizeNordic() {
        const process = Bun.spawnSync({
            cmd: ["/opt/steamcmd/steamcmd.sh",
                "+force_install_dir \"/tmp/steam\"",
                "+login anonymous",
                "+workshop_download_item 304930 1959614756",
                "+quit"
            ],
            stdout: "pipe",
            stderr: "pipe"
        })

        const exitCode = await process.exitCode;
        if (exitCode === 0) {
            return "actualized"
            // The files will now be located at:
            // /tmp/steam/steamapps/workshop/content/304930/1959614756/
        } else {
            return `SteamCMD failed with exit code: ${exitCode}`;
        }
    }


}