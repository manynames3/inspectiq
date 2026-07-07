#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const photoSets = {
  "hyundai-tucson-sel": {
    sourcePage: "https://www.carfax.com/vehicle/5NMJF3DE5RH407769",
    defaultOut: "/tmp/inspectiq-live-photos-hyundai",
    vehicle: {
      vin: "5NMJF3DE5RH407769",
      year: 2024,
      make: "Hyundai",
      model: "Tucson",
      trim: "SEL",
      mileage: 22687,
      exteriorColor: "Gray"
    },
    photos: [
      ["front.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/27/640x480"],
      ["rear.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/3/640x480"],
      ["driver-side.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/20/640x480"],
      ["passenger-side.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/25/640x480"],
      ["interior.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/2/640x480"],
      ["engine-bay.jpg", "https://cdcssl.ibsrv.net/autodata/images/?img=USD40HYS021B021025.jpg&width=536"],
      ["odometer.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/8/640x480"],
      ["vin-plate.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/22/640x480"]
    ]
  },
  "ford-escape-sel": {
    sourcePage: "https://www.dchkayhonda.com/inventory/used-2022-ford-escape-sel-awd-sport-utility-1fmcu9h6xnub81389/",
    defaultOut: "/tmp/inspectiq-live-photos-ford",
    vehicle: {
      vin: "1FMCU9H6XNUB81389",
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SEL",
      mileage: 31992,
      exteriorColor: "Iced Blue Silver Metallic"
    },
    photos: [
      ["front.jpg", "https://vehicle-images.carscommerce.inc/53ad-110006979/1FMCU9H6XNUB81389/00dd817e4b3b4f1907469b70ad97b6aa.jpg"],
      ["rear.jpg", "https://vehicle-images.carscommerce.inc/4da7-110006979/1FMCU9H6XNUB81389/e1a886cba14ca3135ca1fc54f8c26291.jpg"],
      ["driver-side.jpg", "https://vehicle-images.carscommerce.inc/b912-110006979/1FMCU9H6XNUB81389/2cd3a53658104227b0d66866f0f56d26.jpg"],
      ["passenger-side.jpg", "https://vehicle-images.carscommerce.inc/7e3f-110006979/1FMCU9H6XNUB81389/4d84a2fe768c6e1cacbf520565c49ec7.jpg"],
      ["interior.jpg", "https://vehicle-images.carscommerce.inc/a4a0-110006979/1FMCU9H6XNUB81389/ee1db5f810765249e83164d570d74f20.jpg"],
      ["engine-bay.jpg", "https://cdcssl.ibsrv.net/autodata/images/?img=USD00FOS131D021025.jpg&width=536"],
      ["odometer.jpg", "https://vehicle-images.carscommerce.inc/7fe5-110006979/1FMCU9H6XNUB81389/74fd6ba808c60e592976dcf3457f9a3c.jpg"],
      ["vin-plate.jpg", "https://vehicle-images.carscommerce.inc/b5ad-110006979/1FMCU9H6XNUB81389/358534806f7d00b077b8918e6bb229dd.jpg"]
    ]
  }
};

function usage() {
  const setNames = Object.keys(photoSets).join(", ");
  return `
Prepare a source-documented photo directory for npm run test:live-upload.

Usage:
  npm run prepare:live-photos -- [--set hyundai-tucson-sel] [--out /tmp/inspectiq-live-photos-hyundai]

Available sets:
  ${setNames}
`;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function download(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "InspectIQ live proof image fetcher"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) {
    throw new Error(`Downloaded ${url} but the file is unexpectedly small (${bytes.length} bytes).`);
  }
  await writeFile(targetPath, bytes);
  return bytes.length;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage().trim());
    return;
  }

  const setName = argValue("--set") ?? "ford-escape-sel";
  const photoSet = photoSets[setName];
  if (!photoSet) throw new Error(`Unknown photo set "${setName}".\n\n${usage()}`);

  const outDir = path.resolve(argValue("--out") ?? photoSet.defaultOut);
  await mkdir(outDir, { recursive: true });

  const sourceLines = [`sourcePage ${photoSet.sourcePage}`];
  await writeFile(path.join(outDir, "metadata.json"), `${JSON.stringify({
    set: setName,
    sourcePage: photoSet.sourcePage,
    vehicle: photoSet.vehicle
  }, null, 2)}\n`);
  const downloaded = [];
  for (const [filename, url] of photoSet.photos) {
    const targetPath = path.join(outDir, filename);
    const byteSize = await download(url, targetPath);
    downloaded.push({ filename, byteSize });
    sourceLines.push(`${filename} ${url}`);
  }
  await writeFile(path.join(outDir, "sources.txt"), `${sourceLines.join("\n")}\n`);

  console.log(JSON.stringify({
    ok: true,
    set: setName,
    outDir,
    photos: downloaded
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
