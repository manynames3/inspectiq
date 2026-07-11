import { existsSync } from "node:fs";
import path from "node:path";
import type { PhotoAngle } from "@inspectiq/shared";

export type SampleImage = {
  key: string;
  filename: string;
  storageKey?: string;
  label: string;
  angle: PhotoAngle;
  mimeType: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceLicense?: string;
  referenceAngleConfidence?: number;
  referenceQualityGrade?: "pass" | "review" | "retake";
  referenceRetakeRequired?: boolean;
  referenceQualityWarnings?: string[];
  referenceQualityNotes?: string[];
  evaluationOnly?: boolean;
};

export type SamplePhotoSet = {
  key: string;
  label: string;
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string;
  };
  sampleKeys: string[];
};

const externalGalleryLicense = "External OEM gallery URL; image is referenced for model-matched review and not copied into this repository.";
const externalListingLicense = "External dealer listing URL; image is referenced for source provenance and not copied into this repository.";
const cc0License = "CC0 1.0 Universal Public Domain Dedication; resized for the evaluation corpus.";
const publicDomainLicense = "Public domain; resized for the evaluation corpus.";
const skodaRoomsterDamageSourceUrl = "https://commons.wikimedia.org/wiki/File:%C5%A0koda_Roomster_Blue_Dented.jpg";
const passengerDoorDamageSourceUrl = "https://commons.wikimedia.org/wiki/File:Damaged_car_door.jpg";
const interiorWearSourceUrl = "https://commons.wikimedia.org/wiki/File:Car_gear_shift_in_an_old_vehicle_interior_showing_signs_of_wear_and_tear_during_a_repair_session_in_an_auto_shop.jpg";
const hyundaiTucsonCarfaxListingUrl = "https://www.carfax.com/vehicle/5NMJF3DE5RH407769";
const toyotaCamryCarfaxListingUrl = "https://www.carfax.com/vehicle/4T1G11AK6MU422639";
const toyotaCamryAutoNationListingUrl = "https://www.mercedesbenzofbellevue.com/used/Toyota/2021-Toyota-Camry-c2974925ac182b914f329186316cc6dd.htm";
const hondaAccordCarfaxListingUrl = "https://www.carfax.com/vehicle/1HGCV1F49LA129627";
const fordEscapeDealerListingUrl = "https://www.dchkayhonda.com/inventory/used-2022-ford-escape-sel-awd-sport-utility-1fmcu9h6xnub81389/";
const nissanRogueDealerListingUrl = "https://www.westherr.com/inventory/used-2019-nissan-rogue-sv-awd-sport-utility-knmat2mv6kp514068/";
const subaruOutbackDealerListingUrl = "https://www.akarautosales.com/details-2023-subaru-outback-premium_cvt-used-4s4btafc8p3204430.html";

function carsDirect(
  key: string,
  filename: string,
  storageKey: string,
  label: string,
  angle: PhotoAngle,
  sourceUrl: string,
  analysis: Partial<Pick<SampleImage, "referenceAngleConfidence" | "referenceQualityGrade" | "referenceRetakeRequired" | "referenceQualityWarnings" | "referenceQualityNotes">> = {}
): SampleImage {
  return {
    key,
    filename,
    storageKey,
    label,
    angle,
    mimeType: "image/jpeg",
    sourceName: "CarsDirect OEM photo gallery",
    sourceUrl,
    sourceLicense: externalGalleryLicense,
    ...analysis
  };
}

function dealerListing(
  key: string,
  filename: string,
  storageKey: string,
  label: string,
  angle: PhotoAngle,
  sourceUrl: string,
  sourceName = "Dealer listing photo set",
  analysis: Partial<Pick<SampleImage, "referenceAngleConfidence" | "referenceQualityGrade" | "referenceRetakeRequired" | "referenceQualityWarnings" | "referenceQualityNotes">> = {}
): SampleImage {
  return {
    key,
    filename,
    storageKey,
    label,
    angle,
    mimeType: "image/jpeg",
    sourceName,
    sourceUrl,
    sourceLicense: externalListingLicense,
    ...analysis
  };
}

export const sampleImages: SampleImage[] = [
  dealerListing("hyundai-tucson-front", "2024-hyundai-tucson-front.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/27/640x480", "2024 Hyundai Tucson SEL front", "front", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("hyundai-tucson-rear", "2024-hyundai-tucson-rear.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/3/640x480", "2024 Hyundai Tucson SEL rear", "rear", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("hyundai-tucson-driver-side", "2024-hyundai-tucson-driver-side.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/25/640x480", "2024 Hyundai Tucson SEL driver side", "driver_side", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("hyundai-tucson-passenger-side", "2024-hyundai-tucson-passenger-side.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/20/640x480", "2024 Hyundai Tucson SEL passenger side", "passenger_side", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set", {
    referenceAngleConfidence: 0.84,
    referenceQualityGrade: "review",
    referenceQualityWarnings: ["Passenger-side listing photo is angled; reviewer should confirm required-angle match before release."],
    referenceQualityNotes: ["Dealer listing source is usable, but not a clean perpendicular passenger-side capture."]
  }),
  dealerListing("hyundai-tucson-interior", "2024-hyundai-tucson-interior.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/2/640x480", "2024 Hyundai Tucson SEL interior", "interior", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set"),
  carsDirect("hyundai-tucson-engine-bay", "2024-hyundai-tucson-engine-bay.jpg", "https://cdcssl.ibsrv.net/autodata/images/?img=USD40HYS021B021025.jpg&width=536", "2024 Hyundai Tucson SEL engine bay", "engine_bay", "https://www.carsdirect.com/hyundai/tucson/2024/pictures"),
  dealerListing("hyundai-tucson-odometer", "2024-hyundai-tucson-odometer.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/8/640x480", "2024 Hyundai Tucson SEL odometer", "odometer", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("hyundai-tucson-vin-plate", "2024-hyundai-tucson-vin-plate.jpg", "https://carfax-img.vast.com/carfax/v2/-8689993197238208383/22/640x480", "2024 Hyundai Tucson SEL VIN plate", "vin_plate", hyundaiTucsonCarfaxListingUrl, "CARFAX listing photo set"),

  dealerListing("toyota-camry-front", "2021-toyota-camry-front.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/0484/002c87ec96ae6c3cb575e0ce2e4029f0x.jpg", "2021 Toyota Camry SE front", "front", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing", {
    referenceAngleConfidence: 0.78,
    referenceQualityGrade: "review",
    referenceQualityWarnings: ["Front listing photo is a three-quarter angle; reviewer should request a direct front retake if buyer-facing standards require it."],
    referenceQualityNotes: ["Matched the vehicle, but the capture angle is not a clean direct-front inspection photo."]
  }),
  dealerListing("toyota-camry-rear", "2021-toyota-camry-rear.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/0274/c85cb9ecfb1627d962c96e9293214f3cx.jpg", "2021 Toyota Camry SE rear", "rear", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing"),
  dealerListing("toyota-camry-driver-side", "2021-toyota-camry-driver-side.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/1322/e6e4b282530332636ec5b08a9deb7917x.jpg", "2021 Toyota Camry SE driver side", "driver_side", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing"),
  dealerListing("toyota-camry-passenger-side", "2021-toyota-camry-passenger-side.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/0256/5b85963c8e93f790932729eee709cbaex.jpg", "2021 Toyota Camry SE passenger side", "passenger_side", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing"),
  dealerListing("toyota-camry-interior", "2021-toyota-camry-interior.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/1478/acf95babc0bd21723a567dcf7fc726cdx.jpg", "2021 Toyota Camry SE interior", "interior", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing"),
  carsDirect("toyota-camry-engine-bay", "2021-toyota-camry-engine-bay.jpg", "https://cdcssl.ibsrv.net/autodata/images/?img=USD10TOC021B021025.jpg&width=536", "2021 Toyota Camry SE engine bay", "engine_bay", "https://www.carsdirect.com/toyota/camry/2021/pictures"),
  dealerListing("toyota-camry-odometer", "2021-toyota-camry-odometer.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/1087/23aaef15ca8e6caf937d1c854527efe5x.jpg", "2021 Toyota Camry SE odometer", "odometer", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing"),
  dealerListing("toyota-camry-vin-label", "2021-toyota-camry-vin-label.jpg", "https://pictures.dealer.com/a/autonationhondaofrenton/1997/03bd033704c33346e31d53b0156e4ee9x.jpg", "2021 Toyota Camry SE driver-door VIN label area", "vin_plate", toyotaCamryAutoNationListingUrl, "AutoNation Honda Renton dealer listing"),

  dealerListing("honda-accord-front", "2020-honda-accord-front.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/6/640x480", "2020 Honda Accord EX front", "front", hondaAccordCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("honda-accord-rear", "2020-honda-accord-rear.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/3/640x480", "2020 Honda Accord EX rear", "rear", hondaAccordCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("honda-accord-driver-side", "2020-honda-accord-driver-side.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/8/640x480", "2020 Honda Accord EX driver side", "driver_side", hondaAccordCarfaxListingUrl, "CARFAX listing photo set", {
    referenceAngleConfidence: 0.86,
    referenceQualityGrade: "review",
    referenceQualityWarnings: ["Driver-side listing photo is angled; reviewer should confirm it satisfies the required side-view standard."],
    referenceQualityNotes: ["Dealer listing source is useful for context, but should not be treated as a high-confidence direct side capture."]
  }),
  dealerListing("honda-accord-passenger-side", "2020-honda-accord-passenger-side.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/1/640x480", "2020 Honda Accord EX passenger side", "passenger_side", hondaAccordCarfaxListingUrl, "CARFAX listing photo set", {
    referenceAngleConfidence: 0.82,
    referenceQualityGrade: "review",
    referenceQualityWarnings: ["Passenger-side listing photo is rear three-quarter; reviewer should confirm angle before release."],
    referenceQualityNotes: ["This is a real vehicle listing photo, but not a clean perpendicular passenger-side capture."]
  }),
  dealerListing("honda-accord-interior", "2020-honda-accord-interior.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/12/640x480", "2020 Honda Accord EX interior", "interior", hondaAccordCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("honda-accord-engine-bay", "2020-honda-accord-engine-bay.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/25/640x480", "2020 Honda Accord EX engine bay", "engine_bay", hondaAccordCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("honda-accord-odometer", "2020-honda-accord-odometer.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/31/640x480", "2020 Honda Accord EX odometer", "odometer", hondaAccordCarfaxListingUrl, "CARFAX listing photo set"),
  dealerListing("honda-accord-vin-label", "2020-honda-accord-vin-label.jpg", "https://carfax-img.vast.com/carfax/v2/866048677535386941/24/640x480", "2020 Honda Accord EX driver-door VIN label", "vin_plate", hondaAccordCarfaxListingUrl, "CARFAX listing photo set"),

  dealerListing("ford-escape-front", "2022-ford-escape-front.jpg", "https://vehicle-images.carscommerce.inc/53ad-110006979/1FMCU9H6XNUB81389/00dd817e4b3b4f1907469b70ad97b6aa.jpg", "2022 Ford Escape SEL front", "front", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),
  dealerListing("ford-escape-rear", "2022-ford-escape-rear.jpg", "https://vehicle-images.carscommerce.inc/4da7-110006979/1FMCU9H6XNUB81389/e1a886cba14ca3135ca1fc54f8c26291.jpg", "2022 Ford Escape SEL rear", "rear", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),
  dealerListing("ford-escape-driver-side", "2022-ford-escape-driver-side.jpg", "https://vehicle-images.carscommerce.inc/b912-110006979/1FMCU9H6XNUB81389/2cd3a53658104227b0d66866f0f56d26.jpg", "2022 Ford Escape SEL driver side", "driver_side", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),
  dealerListing("ford-escape-passenger-side", "2022-ford-escape-passenger-side.jpg", "https://vehicle-images.carscommerce.inc/7e3f-110006979/1FMCU9H6XNUB81389/4d84a2fe768c6e1cacbf520565c49ec7.jpg", "2022 Ford Escape SEL passenger side", "passenger_side", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),
  dealerListing("ford-escape-interior", "2022-ford-escape-interior.jpg", "https://vehicle-images.carscommerce.inc/d897-110006979/1FMCU9H6XNUB81389/2728ca967ac38a487484bf2323507737.jpg", "2022 Ford Escape SEL interior", "interior", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),
  carsDirect("ford-escape-engine-bay", "2022-ford-escape-engine-bay.jpg", "https://cdcssl.ibsrv.net/autodata/images/?img=USD00FOS131D021025.jpg&width=536", "2022 Ford Escape SEL engine bay", "engine_bay", "https://www.carsdirect.com/ford/escape/2022/pictures"),
  dealerListing("ford-escape-odometer", "2022-ford-escape-odometer.jpg", "https://vehicle-images.carscommerce.inc/7fe5-110006979/1FMCU9H6XNUB81389/74fd6ba808c60e592976dcf3457f9a3c.jpg", "2022 Ford Escape SEL odometer", "odometer", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),
  dealerListing("ford-escape-vin-plate", "2022-ford-escape-vin-plate.jpg", "https://vehicle-images.carscommerce.inc/b5ad-110006979/1FMCU9H6XNUB81389/358534806f7d00b077b8918e6bb229dd.jpg", "2022 Ford Escape SEL VIN plate", "vin_plate", fordEscapeDealerListingUrl, "DCH Kay Honda dealer listing"),

  dealerListing("nissan-rogue-front", "2019-nissan-rogue-front.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562738--L6YDQ-ltid2/1451562738.jpg", "2019 Nissan Rogue SV front", "front", nissanRogueDealerListingUrl, "West Herr dealer listing"),
  dealerListing("nissan-rogue-rear", "2019-nissan-rogue-rear.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562778--HZXGD-ltid2/1451562778.jpg", "2019 Nissan Rogue SV rear", "rear", nissanRogueDealerListingUrl, "West Herr dealer listing"),
  dealerListing("nissan-rogue-driver-side", "2019-nissan-rogue-driver-side.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562758--TAJAH-ltid2/1451562758.jpg", "2019 Nissan Rogue SV driver side", "driver_side", nissanRogueDealerListingUrl, "West Herr dealer listing"),
  dealerListing("nissan-rogue-passenger-side", "2019-nissan-rogue-passenger-side.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562818--13WUF-ltid2/1451562818.jpg", "2019 Nissan Rogue SV passenger side", "passenger_side", nissanRogueDealerListingUrl, "West Herr dealer listing"),
  dealerListing("nissan-rogue-interior", "2019-nissan-rogue-interior.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562998---W1HO-ltid2/1451562998.jpg", "2019 Nissan Rogue SV interior", "interior", nissanRogueDealerListingUrl, "West Herr dealer listing"),
  carsDirect("nissan-rogue-engine-bay", "2019-nissan-rogue-engine-bay.jpg", "https://cdcssl.ibsrv.net/autodata/images/?img=USC70NIS111A021025.jpg&width=536", "2019 Nissan Rogue SV engine bay", "engine_bay", "https://www.carsdirect.com/nissan/rogue/2019/pictures"),
  dealerListing("nissan-rogue-odometer", "2019-nissan-rogue-odometer.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562918--ULAIS-ltid2/1451562918.jpg", "2019 Nissan Rogue SV odometer", "odometer", nissanRogueDealerListingUrl, "West Herr dealer listing"),
  dealerListing("nissan-rogue-vin-label", "2019-nissan-rogue-vin-label.jpg", "https://cdn-img.vincue.net/image/opt-dealerid14606-photoid1451562848--H6RK--ltid2/1451562848.jpg", "2019 Nissan Rogue SV driver-door VIN label area", "vin_plate", nissanRogueDealerListingUrl, "West Herr dealer listing"),

  dealerListing("subaru-outback-front", "2023-subaru-outback-front.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-2-640.jpg", "2023 Subaru Outback Premium front", "front", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing"),
  dealerListing("subaru-outback-rear", "2023-subaru-outback-rear.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-5-640.jpg", "2023 Subaru Outback Premium rear", "rear", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing"),
  dealerListing("subaru-outback-driver-side", "2023-subaru-outback-driver-side.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-7-640.jpg", "2023 Subaru Outback Premium driver side", "driver_side", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing", {
    referenceAngleConfidence: 0.86,
    referenceQualityGrade: "review",
    referenceQualityWarnings: ["Driver-side listing photo is angled; reviewer should confirm required-angle match."],
    referenceQualityNotes: ["Listing photo is vehicle-specific but closer to a three-quarter view than a direct inspection side photo."]
  }),
  dealerListing("subaru-outback-passenger-side", "2023-subaru-outback-passenger-side.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-3-640.jpg", "2023 Subaru Outback Premium passenger side", "passenger_side", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing", {
    referenceAngleConfidence: 0.86,
    referenceQualityGrade: "review",
    referenceQualityWarnings: ["Passenger-side listing photo is angled; reviewer should confirm required-angle match."],
    referenceQualityNotes: ["Listing photo is vehicle-specific but closer to a three-quarter view than a direct inspection side photo."]
  }),
  dealerListing("subaru-outback-interior", "2023-subaru-outback-interior.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-12-640.jpg", "2023 Subaru Outback Premium interior", "interior", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing"),
  dealerListing("subaru-outback-engine-bay", "2023-subaru-outback-engine-bay.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-38-640.jpg", "2023 Subaru Outback Premium engine bay", "engine_bay", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing"),
  dealerListing("subaru-outback-odometer", "2023-subaru-outback-odometer.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-24-640.jpg", "2023 Subaru Outback Premium odometer", "odometer", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing"),
  dealerListing("subaru-outback-vin-label", "2023-subaru-outback-vin-label.jpg", "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-10-640.jpg", "2023 Subaru Outback Premium driver-door VIN label area", "vin_plate", subaruOutbackDealerListingUrl, "A-Kar Auto Sales dealer listing"),

  { key: "front-clean", filename: "front-clean.jpg", label: "Front clean", angle: "front", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "skoda-roomster-rear-quarter-dent", filename: "skoda-roomster-rear-quarter-dent.jpg", label: "Offline rear-damage evaluation case", angle: "rear", mimeType: "image/jpeg", sourceName: "Wikimedia Commons - AVDLCZ", sourceUrl: skodaRoomsterDamageSourceUrl, sourceLicense: cc0License, evaluationOnly: true },
  { key: "odometer-closeup-64231", filename: "odometer-closeup-64231.png", label: "Odometer 64,231", angle: "odometer", mimeType: "image/png", sourceName: "Reference identity capture" },
  { key: "vin-plate-4t1g11ak8mu123456", filename: "vin-plate-4t1g11ak8mu123456.png", label: "VIN plate", angle: "vin_plate", mimeType: "image/png", sourceName: "Reference identity capture" },
  { key: "passenger-door-severe-dent", filename: "passenger-door-severe-dent.jpg", label: "Passenger door collision damage", angle: "passenger_side", mimeType: "image/jpeg", sourceName: "Wikimedia Commons - Garitzko", sourceUrl: passengerDoorDamageSourceUrl, sourceLicense: publicDomainLicense },
  { key: "passenger-side-clean", filename: "passenger-side-clean.jpg", label: "Passenger side clean", angle: "passenger_side", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "interior-overview", filename: "interior-overview.jpg", label: "Interior overview", angle: "interior", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "interior-wear", filename: "interior-wear.jpg", label: "Interior wear and disassembly review", angle: "interior", mimeType: "image/jpeg", sourceName: "Wikimedia Commons - Shixart1985", sourceUrl: interiorWearSourceUrl, sourceLicense: "CC BY 2.0; resized for the evaluation corpus." },
  { key: "engine-bay-clean", filename: "engine-bay-clean.jpg", label: "Engine bay clean", angle: "engine_bay", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "blurry-front", filename: "blurry-front.jpg", label: "Blurry front retake", angle: "front", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "glare-front", filename: "glare-front.jpg", storageKey: "/sample-images/front-clean.jpg", label: "Front glare review", angle: "front", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "dark-interior", filename: "dark-interior.jpg", storageKey: "/sample-images/interior-wear.jpg", label: "Dark interior review", angle: "interior", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "partial-vin-plate", filename: "partial-vin-plate.jpg", storageKey: "/sample-images/vin-plate.jpg", label: "Partial VIN plate retake", angle: "vin_plate", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "dirty-odometer", filename: "dirty-odometer.jpg", storageKey: "/sample-images/odometer-64231.jpg", label: "Dirty odometer retake", angle: "odometer", mimeType: "image/jpeg", sourceName: "InspectIQ local fixture" },
  { key: "auction-lane-front", filename: "auction-lane-front.jpg", storageKey: "https://carfax-img.vast.com/carfax/v2/5361285687015803058/8/640x480", label: "Auction lane front", angle: "front", mimeType: "image/jpeg", sourceName: "CARFAX listing photo set", sourceUrl: toyotaCamryCarfaxListingUrl, sourceLicense: externalListingLicense },
  { key: "bad-angle-side", filename: "bad-angle-side.jpg", storageKey: "https://cdn.ebizautos.media/used-2023-subaru-outback-premiumcvt-14413-23008396-4-640.jpg", label: "Side angle review", angle: "driver_side", mimeType: "image/jpeg", sourceName: "A-Kar Auto Sales dealer listing", sourceUrl: subaruOutbackDealerListingUrl, sourceLicense: externalListingLicense }
];

export const sampleBundles: Record<string, string[]> = {
  "complete-clean-set": [
    "hyundai-tucson-front",
    "hyundai-tucson-rear",
    "odometer-closeup-64231",
    "vin-plate-4t1g11ak8mu123456",
    "hyundai-tucson-driver-side",
    "hyundai-tucson-passenger-side",
    "hyundai-tucson-interior",
    "hyundai-tucson-engine-bay",
    "hyundai-tucson-vin-plate"
  ],
  "hyundai-tucson-sel-set": [
    "hyundai-tucson-front",
    "hyundai-tucson-rear",
    "hyundai-tucson-driver-side",
    "hyundai-tucson-passenger-side",
    "hyundai-tucson-interior",
    "hyundai-tucson-engine-bay",
    "hyundai-tucson-odometer",
    "hyundai-tucson-vin-plate"
  ],
  "toyota-camry-se-set": [
    "toyota-camry-front",
    "toyota-camry-rear",
    "toyota-camry-driver-side",
    "toyota-camry-passenger-side",
    "toyota-camry-interior",
    "toyota-camry-engine-bay",
    "toyota-camry-odometer",
    "toyota-camry-vin-label"
  ],
  "honda-accord-ex-set": [
    "honda-accord-front",
    "honda-accord-rear",
    "honda-accord-driver-side",
    "honda-accord-passenger-side",
    "honda-accord-interior",
    "honda-accord-engine-bay",
    "honda-accord-odometer",
    "honda-accord-vin-label"
  ],
  "ford-escape-sel-set": [
    "ford-escape-front",
    "ford-escape-rear",
    "ford-escape-driver-side",
    "ford-escape-passenger-side",
    "ford-escape-interior",
    "ford-escape-engine-bay",
    "ford-escape-odometer",
    "ford-escape-vin-plate"
  ],
  "nissan-rogue-sv-set": [
    "nissan-rogue-front",
    "nissan-rogue-rear",
    "nissan-rogue-driver-side",
    "nissan-rogue-passenger-side",
    "nissan-rogue-interior",
    "nissan-rogue-engine-bay",
    "nissan-rogue-odometer",
    "nissan-rogue-vin-label"
  ],
  "subaru-outback-premium-set": [
    "subaru-outback-front",
    "subaru-outback-rear",
    "subaru-outback-driver-side",
    "subaru-outback-passenger-side",
    "subaru-outback-interior",
    "subaru-outback-engine-bay",
    "subaru-outback-odometer",
    "subaru-outback-vin-label"
  ],
  "offsite-retake-set": [
    "blurry-front",
    "vin-plate-4t1g11ak8mu123456",
    "odometer-closeup-64231"
  ],
  "arbitration-risk-set": [
    "passenger-door-severe-dent",
    "interior-overview",
    "odometer-closeup-64231",
    "vin-plate-4t1g11ak8mu123456"
  ],
  "gate-imaging-partial-set": [
    "front-clean",
    "passenger-side-clean",
    "vin-plate-4t1g11ak8mu123456"
  ],
  "high-mile-repo-set": [
    "front-clean",
    "interior-overview",
    "odometer-closeup-64231",
    "vin-plate-4t1g11ak8mu123456"
  ]
};

export const samplePhotoSets: SamplePhotoSet[] = [
  {
    key: "hyundai-tucson-sel-set",
    label: "2024 Hyundai Tucson SEL required angles",
    vehicle: { year: 2024, make: "Hyundai", model: "Tucson", trim: "SEL" },
    sampleKeys: sampleBundles["hyundai-tucson-sel-set"]
  },
  {
    key: "toyota-camry-se-set",
    label: "2021 Toyota Camry SE required angles",
    vehicle: { year: 2021, make: "Toyota", model: "Camry", trim: "SE" },
    sampleKeys: sampleBundles["toyota-camry-se-set"]
  },
  {
    key: "honda-accord-ex-set",
    label: "2020 Honda Accord EX required angles",
    vehicle: { year: 2020, make: "Honda", model: "Accord", trim: "EX" },
    sampleKeys: sampleBundles["honda-accord-ex-set"]
  },
  {
    key: "ford-escape-sel-set",
    label: "2022 Ford Escape SEL required angles",
    vehicle: { year: 2022, make: "Ford", model: "Escape", trim: "SEL" },
    sampleKeys: sampleBundles["ford-escape-sel-set"]
  },
  {
    key: "nissan-rogue-sv-set",
    label: "2019 Nissan Rogue SV required angles",
    vehicle: { year: 2019, make: "Nissan", model: "Rogue", trim: "SV" },
    sampleKeys: sampleBundles["nissan-rogue-sv-set"]
  },
  {
    key: "subaru-outback-premium-set",
    label: "2023 Subaru Outback Premium required angles",
    vehicle: { year: 2023, make: "Subaru", model: "Outback", trim: "Premium" },
    sampleKeys: sampleBundles["subaru-outback-premium-set"]
  }
];

function normalized(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function sampleSetForInspection(input: {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}): SamplePhotoSet | undefined {
  return samplePhotoSets.find((set) =>
    set.vehicle.year === input.year &&
    normalized(set.vehicle.make) === normalized(input.make) &&
    normalized(set.vehicle.model) === normalized(input.model) &&
    (!input.trim || normalized(set.vehicle.trim) === normalized(input.trim))
  );
}

export function findSamplePhotoSet(sampleKey: string): SamplePhotoSet | undefined {
  return samplePhotoSets.find((set) => set.key === sampleKey);
}

export function findSampleImage(sampleKey: string): SampleImage | undefined {
  return sampleImages.find((sample) => sample.key === sampleKey);
}

export function findSampleImageByObjectKey(objectKey: string | null | undefined): SampleImage | undefined {
  const match = objectKey?.match(/^sample-images\/(.+)$/);
  if (!match) return undefined;
  return findSampleImage(match[1]);
}

export function sampleImageDirectory(): string {
  const candidates = [
    process.env.SAMPLE_IMAGE_DIR,
    path.resolve(process.cwd(), "sample-images"),
    path.resolve(process.cwd(), "sample-data/images"),
    path.resolve(process.cwd(), "../../sample-data/images")
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1];
}

export function sampleImageFilePath(filename: string): string {
  return path.join(sampleImageDirectory(), path.basename(filename));
}
