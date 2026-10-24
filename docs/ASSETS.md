# VIBETIX campaign photography

All campaign photographs are original AI-generated fictional imagery created with the **built-in `image_gen` tool**. No remote image URLs, stock placeholders, CLI/API fallback, or real artist identities are used. The existing ECHOES hero was inspected as visual context; its original prompt is in `src/assets/hero-prompt.txt`.

Each of the ten new campaign photographs was generated individually. No contact sheets or montage crops are used. All use deep charcoal, midnight blue, violet and restrained vivid magenta, with premium editorial photography and centered subjects for safe card crops.

Source PNGs are retained under ignored `artifacts/image-sources/`; they are never served from `public`. Tool originals remain under the tool's generated-images directory. Final assets are stripped, compressed WebP images in `public/images/`.

## Reproduction

`scripts/optimize-images.mjs` contains the source/output manifest, target dimensions and quality. It performs deterministic centered cover resizing, preserves orientation, prevents enlargement and writes WebP at quality 80 / effort 6. Install Sharp locally or set `VIBETIX_SHARP_PATH` to the bundled Sharp `dist/index.mjs`; then run `node scripts/optimize-images.mjs`. Optional names restrict processing, for example `node scripts/optimize-images.mjs extras-lounge`.

In this workspace the verified bundled runtime is:

```sh
VIBETIX_SHARP_PATH=/home/artin85/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs /home/artin85/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/optimize-images.mjs
```

## Prompts

The full prompt for each extras photograph is the following common prefix and suffix surrounding its primary request:

> Use case: ads-marketing. Asset type: VIBETIX booking upgrade photographic card. Primary request: [request below] Style: premium photoreal editorial photography, natural materials and credible proportions. Composition: wide landscape 3:2, main subject centered with safe crop margins. Cohesive campaign palette: deep charcoal, midnight blue, violet and restrained vivid magenta, matching a premium concert campaign. No collages, no border, no watermark, no additional text or logos.

| Asset | Primary request |
|---|---|
| extras-lounge | a premium arena VIP lounge, plush dark sofas and intimate cocktail tables beside expansive glazing overlooking a live concert arena with violet stage lights. Empty foreground, convincing architectural photography. |
| extras-parking | a premium indoor concert venue parking garage, dark polished concrete, a black sedan parked neatly in foreground, blue and violet architectural strip lights, spacious clean entry. |
| extras-fast-lane | a dedicated concert entry lane, elegant velvet rope barriers with clearly open passage toward an arena entrance, subtle magenta lighting, two guests and discreet host in background, no readable signage. |
| extras-merch | a black premium tour T-shirt and folded hoodie arranged as a tasteful editorial still life on dark charcoal stone. The only lettering on shirt is ECHOES in simple clean white uppercase, violet soft edge light. |
| extras-photo | a tasteful concert photographer collectible experience, a professional camera beside a black lanyard and simple commemorative event pass on a dark surface, blurred purple concert stage lights in background. Pass has only ECHOES in simple white uppercase. |

The full prompt for each artist/venue photograph is the following common prefix and suffix surrounding its primary request:

> Use case: ads-marketing. Asset type: VIBETIX music discovery campaign photographic card. Primary request: [request below]. Style: premium photoreal editorial music photography, natural textures, credible anatomy and architecture. Composition: wide landscape 3:2, subject centered with generous crop margins, polished campaign shot. Cohesive palette: deep charcoal, midnight blue, violet and restrained vivid magenta. No collage, no border, no watermark, no text or logos. Artists are fictional, no resemblance to famous people.

| Asset | Primary request |
|---|---|
| artist-maya-chen | fictional Asian woman vocalist in her late twenties with dark shoulder-length hair, wearing elegant black stagewear, expressive mid-performance portrait holding a microphone, blue backlight and magenta rimlight |
| artist-the-midnight-collective | fictional indie quartet of four adult musicians, two women and two men, varied skin tones, understated black modern stage clothing, grouped portrait with guitars and keyboard at a backstage studio, violet lighting |
| artist-noah-blake | fictional adult male electronic producer with short dark hair, black shirt, focused at a synthesizer and mixing deck on a live stage, restrained blue and violet light |
| venue-garden | a large indoor music arena viewed from the stands, sweeping curved seating bowl and packed audience, central end stage with beams of violet and magenta light through a little haze |
| venue-harbor | a modern outdoor waterfront music venue at blue hour, open air amphitheatre with contemporary canopy roof and crowd, harbor beyond, stage glowing violet and magenta |

## Final manifest

All extras and venue assets are 768×512; artist assets are 640×426. Every source filename below is relative to `/home/artin85/.codex/generated_images/01a130ee-a488-7f00-83f9-003078c514c4/`. Workspace copies use the matching basename under `artifacts/image-sources/`.

| Final file in public/images | Dimensions | Bytes | Tool source PNG |
|---|---:|---:|---|
| extras-lounge.webp | 768×512 | 69,160 | exec-5ab9f2ab-1092-43d7-879f-5b9e173a6ef5.png |
| extras-parking.webp | 768×512 | 51,950 | exec-b4803731-3c64-4817-9c07-bab128fc27a4.png |
| extras-fast-lane.webp | 768×512 | 55,484 | exec-10a13189-c8d7-4584-b11c-eefc072fc5b4.png |
| extras-merch.webp | 768×512 | 49,022 | exec-0cd31938-14d8-4800-9f6b-fed284fa4ebd.png |
| extras-photo.webp | 768×512 | 39,874 | exec-6b2fcde4-18cf-442d-88f2-671531bb7127.png |
| artist-maya-chen.webp | 640×426 | 26,840 | exec-814de1a6-6f3c-4487-a75f-64b1d64c2a89.png |
| artist-the-midnight-collective.webp | 640×426 | 37,118 | exec-57934ab7-db0c-4795-be25-b2738256dfe0.png |
| artist-noah-blake.webp | 640×426 | 31,538 | exec-1fa190b6-e203-4f4b-bedf-e334c3aa149f.png |
| venue-garden.webp | 768×512 | 74,308 | exec-dbb78f0d-7f0d-4741-896d-355cfa4e776a.png |
| venue-harbor.webp | 768×512 | 69,554 | exec-50d9f819-33cf-411d-a392-39ba29b06887.png |

All final files are visually inspected after optimization for subject, legibility where applicable, safe crops and consistency with the ECHOES hero. Generated scenes and artists serve the frontend demo and are not documentary photographs of actual ticket inventory.

## October 14 continuation: venue correction and responsive event heroes

The prior thirteen WebP assets were retained after inspection; the campaign photography was coherent and already optimized. A specific mismatch was corrected: Northstar Hall used the outdoor harbor photograph despite being described as an indoor hall.

New image: built-in `image_gen` tool, source `/home/artin85/.codex/generated_images/01a1392b-9b01-7fd1-b9b0-128401ea1f23/exec-4c4bfdd7-465a-4456-b704-0a93d73188cb.png`, copied to ignored `artifacts/image-sources/venue-northstar.png`. Final `public/images/venue-northstar.webp` is 768×512, 57,738 bytes, 97.5% smaller than its PNG source.

Full prompt:

> Use case: ads-marketing. Asset type: VIBETIX fictional venue discovery photograph. Primary request: Northstar Hall, a believable premium indoor music hall in Seattle, viewed from rear balcony toward a live concert end-stage. Capacity about six thousand, intimate enclosed dark timber and charcoal architectural interior, two balcony levels, realistically proportioned audience and stage equipment. Purple, magenta and midnight blue concert lighting, subtle haze, warm little aisle lights, editorial architectural concert photography. Wide landscape 3:2 composition, no text, no watermark, no collage. Cohesive with the fictional ECHOES campaign: cinematic navy black surfaces, selective violet magenta stage beams. Must clearly be indoors, no waterfront, no outdoor canopy.

The three non-ECHOES artists previously reused 640×426 card images as full event heroes. Six new WebP derivatives use their already generated original PNGs. This improves hero resolution without new artist identities or unnecessary generation. Cards and review now use the artist's small image directly; event pages use desktop/mobile sources.

| New derivative | Dimensions | Bytes |
| --- | ---: | ---: |
| artist-maya-chen-hero.webp | 1280×720 | 62,276 |
| artist-maya-chen-mobile.webp | 768×960 | 61,466 |
| artist-the-midnight-collective-hero.webp | 1280×720 | 87,834 |
| artist-the-midnight-collective-mobile.webp | 768×960 | 68,484 |
| artist-noah-blake-hero.webp | 1280×720 | 68,618 |
| artist-noah-blake-mobile.webp | 768×960 | 48,662 |

The optimizer now includes every production raster, including the existing ECHOES hero/mobile/card outputs. The existing optimized ECHOES outputs were not recompressed solely to exercise the script. `npm run images:audit` reports 20 referenced WebP files, 1,136,344 bytes total, zero duplicate-content files, zero unused rasters and zero files over the 250 KB per-image review budget. No PNG/JPG is served or copied to `dist`. No production image was removed in this continuation because all twenty have a live consumer; ignored source/QA PNGs are intentional development artifacts.
