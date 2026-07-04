# Sample Image Credits

The bundled inspection photos are fixtures used for local and Cloudflare Pages workflows. They are served from `/sample-images/...` and classified by filename by the mock vision provider.

Unsplash photos are free to use under the Unsplash License. Attribution is not required by the license, but sources are documented here for reviewability.

| Fixture | Source | Author |
| --- | --- | --- |
| `front-clean.jpg` | https://unsplash.com/photos/the-front-of-a-car-mlPlAg_hvw4 | Erik Mclean |
| `blurry-front.jpg` | https://unsplash.com/photos/the-front-of-a-car-mlPlAg_hvw4 | Erik Mclean |
| `rear-severe-damage.jpg` | https://unsplash.com/photos/damaged-toyota-prius-rear-with-a-dent-is8MAQ5uLxc | Macourt Media |
| `driver-side-scratch.jpg` | https://unsplash.com/photos/a-close-up-of-the-side-of-a-sports-car-PcL1r4f83TI | DAVIDCOHEN |
| `passenger-side-clean.jpg` | https://unsplash.com/photos/a-close-up-of-the-side-of-a-sports-car-PcL1r4f83TI | DAVIDCOHEN |
| `interior-overview.jpg` | https://unsplash.com/photos/the-interior-of-a-car-6Fa1uCl7aNs | Markus Spiske |
| `engine-bay-clean.jpg` | https://unsplash.com/photos/car-engine-bay-VurHDpO4VYI | Tim Mossholder |
| `odometer-64231.jpg` | https://unsplash.com/photos/a-close-up-of-a-dashboard-of-a-car-ezk7U9drpWA | Jason Leung |
| `vin-plate.jpg` | https://unsplash.com/photos/yellow-and-black-car-license-plate-doVWn0pJ4ic | Oleksandr Horbach |
| `odometer-closeup-64231.png` | Generated OCR fixture in this repo | InspectIQ |
| `vin-plate-4t1g11ak8mu123456.png` | Generated OCR fixture in this repo | InspectIQ |

Notes:

- The vehicle records, VIN values, odometer values, and inspection metadata remain synthetic.
- The generated OCR fixtures exist because the photographic speedometer/license-plate images do not contain reliable odometer or VIN text. They keep OCR evaluation honest instead of expecting invisible data.
