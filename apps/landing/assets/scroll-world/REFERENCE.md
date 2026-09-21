# ScrollWorld — continuity reference

**The approved anchor is the reference image for every other scene.**
Prose continuity was tried first and failed outright: scene 3 v1 came back with a
different woman in a different venue. Passing the anchor as a reference image
fixed it in one attempt.

- Anchor file: `generated/anchor-live-stage-v1.png` (approved)
- Higgsfield media_id: `2f1d0d44-d1e2-42db-888f-6e6bb2aa2609`
- Pass as: `medias: [{ role: "image", value: "<media_id>" }]`
- Model: `nano_banana_pro` (roles: `image`; ratios incl. 3:2, 9:16; res 1k/2k/4k)

All iteration frames so far are **1k (1264x848)** — the model default. That is
fine for judging composition and wrong for a landing hero. Regenerate or upscale
the approved selects at 2k/4k before they ship.
