"use client";

import { useEffect, useRef } from "react";
import scenes from "../../../landing/assets/scroll-world/runtime/scenes.json";
// Shared with the standalone landing page; no second player implementation.
// @ts-expect-error The portable browser module is plain JavaScript.
import { mountScrollWorld } from "../../../landing/assets/scroll-world/runtime/engine.mjs";
import "../../../landing/assets/scroll-world/runtime/world.css";

export default function ScrollWorld() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => mountScrollWorld(root.current, { base: "/site/scroll-world/" }), []);
  return (
    <div ref={root} className="aw-world" aria-label="One night on AfriStage">
      <div className="aw-pin">
        <div className="aw-controls"><a className="aw-skip" href="#platform">Skip the story</a></div>
        <div className="aw-scenes">
          {scenes.map((scene, i) => (
            <figure className="aw-scene" key={scene.id}>
              <div className="aw-visual">
                {/* Native images keep the same fallback and crop in both surfaces. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/site/scroll-world/web/${scene.still}`} srcSet={`/site/scroll-world/web/${scene.still} ${scene.width}w, /site/scroll-world/web/${scene.still.replace('.jpg', '@2x.jpg')} 2560w`} sizes="100vw" width={scene.width} height={scene.height} loading="lazy" decoding="async" alt={scene.alt} />
              </div>
              <figcaption className="aw-caption">
                <span className="aw-eyebrow">{scene.eyebrow}</span>
                <h2>{scene.title}</h2><p>{scene.body}</p>
                {i === scenes.length - 1 && <a className="aw-cta" href="#offer">Claim your stage</a>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
