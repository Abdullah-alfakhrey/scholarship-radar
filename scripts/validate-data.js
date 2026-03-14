const fs = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "scholarships.json");

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  const payload = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));

  if (!payload.meta || !Array.isArray(payload.items)) {
    throw new Error("Scholarship feed must include meta and items.");
  }

  payload.items.forEach((item, index) => {
    const requiredFields = ["id", "title", "institution", "region", "url", "applyUrl", "sourceType"];

    requiredFields.forEach((field) => {
      if (!item[field]) {
        throw new Error(`Item ${index} is missing required field "${field}".`);
      }
    });

    if (!Array.isArray(item.topics)) {
      throw new Error(`Item ${index} must contain a topics array.`);
    }

    if (!Array.isArray(item.requirements)) {
      throw new Error(`Item ${index} must contain a requirements array.`);
    }
  });

  console.log(`Validated ${payload.items.length} scholarship entries.`);
}
