import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TomTomMap } from "./TomTomMap";

describe("TomTomMap container", () => {
  it("positions the SDK container inline so the SDK stylesheet cannot collapse it", () => {
    // The SDK adds .mapboxgl-map { position: relative } to this element after
    // our CSS loads; a class-based `absolute inset-0` lost to it and the map
    // rendered 0 px high. Inline styles win over any stylesheet rule.
    const html = renderToStaticMarkup(<TomTomMap initialCenter={{ lat: 52.24, lng: -0.9 }} initialZoom={7} />);
    expect(html).toContain('<div style="position:absolute;inset:0"></div>');
    expect(html).not.toMatch(/<div class="absolute inset-0"><\/div>/);
  });
});
