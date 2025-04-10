import { AppleNotesImporter } from "./importer";

async function main() {
  const importer = new AppleNotesImporter();

  try {
    await importer.import();
    console.log("Import completed successfully");
  } catch (error) {
    console.error("Import failed:", error);
  }
}

main();
