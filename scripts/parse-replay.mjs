import { readFileHeader } from "@kant/node-boxcars";
import { Decoder } from "cbor-x";

// Keep native parsing outside the web server so malformed replays and timeouts are isolated.
try {
  const filename = process.argv[2];
  if (!filename) throw new Error("Falta la ruta de la repetición.");
  const decoder = new Decoder({ mapsAsObjects: true });
  const replay = decoder.decode(readFileHeader(filename));
  process.stdout.write(
    JSON.stringify(replay, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Error del lector de repeticiones.");
  process.exitCode = 1;
}
