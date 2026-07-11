# Sample Image Credits

The reference inspection queue uses source-documented vehicle-angle images from external dealer listings and OEM-style galleries. Local development can optionally load those reference sets for controlled walkthrough records; deployed production disables that path so users upload captured photos instead. Local static fixtures are served from `/sample-images/...` only for tests, retake-policy evaluation, and edge-case workflows. External images are referenced by URL and are not copied into this repository.

Unsplash photos are free to use under the Unsplash License. Attribution is not required by the license, but sources are documented here for reviewability.

| Fixture | Source | Author |
| --- | --- | --- |
| `front-clean.jpg` | https://unsplash.com/photos/the-front-of-a-car-mlPlAg_hvw4 | Erik Mclean |
| `blurry-front.jpg` | https://unsplash.com/photos/the-front-of-a-car-mlPlAg_hvw4 | Erik Mclean |
| `skoda-roomster-rear-quarter-dent.jpg` | https://commons.wikimedia.org/wiki/File:%C5%A0koda_Roomster_Blue_Dented.jpg (CC0 1.0; offline evaluator only, never attachable inspection evidence) | AVDLCZ |
| `passenger-door-severe-dent.jpg` | https://commons.wikimedia.org/wiki/File:Damaged_car_door.jpg (public domain) | Garitzko |
| `passenger-side-clean.jpg` | https://unsplash.com/photos/a-close-up-of-the-side-of-a-sports-car-PcL1r4f83TI | DAVIDCOHEN |
| `interior-overview.jpg` | https://unsplash.com/photos/the-interior-of-a-car-6Fa1uCl7aNs | Markus Spiske |
| `interior-wear.jpg` | https://commons.wikimedia.org/wiki/File:Car_gear_shift_in_an_old_vehicle_interior_showing_signs_of_wear_and_tear_during_a_repair_session_in_an_auto_shop.jpg (CC BY 2.0) | Shixart1985 |
| `engine-bay-clean.jpg` | https://unsplash.com/photos/car-engine-bay-VurHDpO4VYI | Tim Mossholder |
| `odometer-64231.jpg` | https://unsplash.com/photos/a-close-up-of-a-dashboard-of-a-car-ezk7U9drpWA | Jason Leung |
| `vin-plate.jpg` | https://unsplash.com/photos/yellow-and-black-car-license-plate-doVWn0pJ4ic | Oleksandr Horbach |
| `odometer-closeup-64231.png` | Generated OCR fixture in this repo | InspectIQ |
| `vin-plate-4t1g11ak8mu123456.png` | Generated OCR fixture in this repo | InspectIQ |
| `glare-front` eval case | Reuses `front-clean.jpg` with glare-retake labeling | InspectIQ |
| `dark-interior` eval case | Reuses `interior-wear.jpg` with low-light retake labeling | InspectIQ |
| `partial-vin-plate` eval case | Reuses `vin-plate.jpg` with partial-VIN retake labeling | InspectIQ |
| `dirty-odometer` eval case | Reuses `odometer-64231.jpg` with dirty/illegible odometer labeling | InspectIQ |

Exact-model and listing sources used by reference inspections:

| Vehicle | Source |
| --- | --- |
| 2024 Hyundai Tucson SEL exterior/interior/odometer/VIN label | https://www.carfax.com/vehicle/5NMJF3DE5RH407769 |
| 2024 Hyundai Tucson SEL engine bay reference | https://www.carsdirect.com/hyundai/tucson/2024/pictures |
| 2021 Toyota Camry SE exterior/interior/odometer/VIN-label area | https://www.mercedesbenzofbellevue.com/used/Toyota/2021-Toyota-Camry-c2974925ac182b914f329186316cc6dd.htm |
| 2021 Toyota Camry SE engine bay reference | https://www.carsdirect.com/toyota/camry/2021/pictures |
| 2020 Honda Accord EX exterior/interior/engine bay/odometer/VIN label | https://www.carfax.com/vehicle/1HGCV1F49LA129627 |
| 2022 Ford Escape SEL exterior/interior/odometer/VIN plate | https://www.dchkayhonda.com/inventory/used-2022-ford-escape-sel-awd-sport-utility-1fmcu9h6xnub81389/ |
| 2022 Ford Escape SEL engine bay reference | https://www.carsdirect.com/ford/escape/2022/pictures |
| 2019 Nissan Rogue SV exterior/interior/odometer/VIN-label area | https://www.westherr.com/inventory/used-2019-nissan-rogue-sv-awd-sport-utility-knmat2mv6kp514068/ |
| 2019 Nissan Rogue SV engine bay reference | https://www.carsdirect.com/nissan/rogue/2019/pictures |
| 2023 Subaru Outback Premium exterior/interior/engine bay/odometer/VIN-label area | https://www.akarautosales.com/details-2023-subaru-outback-premium_cvt-used-4s4btafc8p3204430.html |

Live marketplace damage proof:

| Vehicle | Source | Repository handling |
| --- | --- | --- |
| 2022 Ford Escape SE, Copart lot `51175056`, rear-end damage | https://www.copart.com/lot/51175056/Photos/salvage-2022-ford-escape-se-ca-hayward | Direct rear photo uploaded to private S3 for the live inspection; external image URL and model trace are recorded in `evals/marketplace-bedrock-proof.json`; image bytes are not committed. |

Notes:

- Reference Hyundai, Toyota, Honda, Ford, Nissan, and Subaru records use VIN-specific listing metadata for VIN, mileage, color, and the primary source photo set.
- Public listings do not always expose tight VIN-plate closeups. When only a door-jamb label area is available, the source is labeled as VIN-label-area evidence instead of being presented as a perfect OCR closeup. Missing engine-bay images use exact year/make/model gallery references where documented.
- Local-only reference vehicle-angle photos should not be presented as production capture evidence; the deployed flow expects user-uploaded S3 objects.
- The Hyundai reference record uses VIN-specific CARFAX listing photos for front, rear, driver side, passenger side, interior, odometer, and VIN label. The listing did not publish an engine-bay photo, so that slot uses a documented exact-model fallback.
- The Toyota Camry reference record uses VIN-specific AutoNation dealer listing photos for front, rear, driver side, passenger side, interior, odometer, and the driver-door/VIN-label area. The listing did not publish an engine-bay photo, so that slot uses a documented exact-model CarsDirect fallback.
- The Honda Accord reference record uses VIN-specific CARFAX listing photos for front, rear, driver side, passenger side, interior, engine bay, odometer, and VIN label.
- The Ford Escape reference record uses VIN-specific DCH Kay Honda dealer listing photos for front, rear, driver side, passenger side, interior, odometer, and VIN plate. The listing did not publish an engine-bay photo, so the engine-bay slot remains an exact-model CarsDirect reference.
- The Nissan Rogue reference record uses VIN-specific West Herr dealer listing photos for front, rear, driver side, passenger side, interior, odometer, and the driver-door/VIN-label area. The listing did not publish an engine-bay photo, so the engine-bay slot remains an exact-model CarsDirect reference.
- The Subaru Outback reference record uses VIN-specific A-Kar Auto Sales listing photos for front, rear, driver side, passenger side, interior, engine bay, odometer, and the driver-door/VIN-label area.
- External images are source-provenance references. They are not copied into this repository and should be replaced by customer-uploaded S3 objects in production.
- Generated OCR fixtures still exist for local tests and retake edge cases where exact expected text is required.
- Damage-positive labels are limited to images whose visible condition and source descriptions support the label. The prior Prius "severe dent" and duplicated clean-panel "scratch" labels were removed because the pixels did not support those claims.
