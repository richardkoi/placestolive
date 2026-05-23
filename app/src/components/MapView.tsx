import { useEffect, useRef } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import type { ScoredCounty } from "../types";

interface Props {
  counties: ScoredCounty[];
  onSelect: (fips: string | null) => void;
  anchorFips?: string | null;     // in similar mode, highlight this county
  paletteStops?: readonly [string, string, string, string, string];   // 5-stop color ramp
  themeMode?: "light" | "dark";   // drives map bg + city label colors
}

interface CountyProps {
  fips: string;
  score: number;
  data_fips?: string;     // resolved DB FIPS via FIPS_ALIASES (may differ from fips)
  name?: string;
  state?: string;
}

// Some counties in the shipped GeoJSON have outdated FIPS codes vs the Census 2024
// gazetteer we use for the DB. Map old GeoJSON FIPS → current DB FIPS so the shape
// gets colored using the right data. Where boundary changes were structural
// (Connecticut 2022 county→planning-region reorganization), the mapping is an
// approximation to the most-overlapping new region.
const FIPS_ALIASES: Record<string, string> = {
  // Alaska borough renames + splits
  "02261": "02063",  // Valdez-Cordova → Chugach Census Area (largest fragment)
  "02270": "02158",  // Wade Hampton → Kusilvak Census Area
  // South Dakota rename
  "46113": "46102",  // Shannon → Oglala Lakota County
  // Virginia consolidation
  "51515": "51019",  // Bedford city → merged into Bedford County (2013)
  // Connecticut counties → planning regions (2022 reorganization)
  "09001": "09190",  // Fairfield → Western CT Planning Region
  "09003": "09110",  // Hartford → Capitol Planning Region
  "09005": "09160",  // Litchfield → Northwest Hills Planning Region
  "09007": "09130",  // Middlesex → Lower CT River Valley Planning Region
  "09009": "09170",  // New Haven → South Central CT Planning Region
  "09011": "09180",  // New London → Southeastern CT Planning Region
  "09013": "09110",  // Tolland → Capitol Planning Region (overlaps Hartford)
  "09015": "09150",  // Windham → Northeastern CT Planning Region
};

function resolveFips(fips: string): string {
  return FIPS_ALIASES[fips] ?? fips;
}

const DEFAULT_STOPS: readonly [string, string, string, string, string] = [
  "#1e293b", "#312e81", "#6366f1", "#fbbf24", "#f87171",
];

export function MapView({ counties, onSelect, anchorFips, paletteStops, themeMode = "dark" }: Props) {
  const stops = paletteStops ?? DEFAULT_STOPS;
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const themeModeRef = useRef(themeMode);
  themeModeRef.current = themeMode;
  const anchorFipsRef = useRef<string | null | undefined>(anchorFips);
  anchorFipsRef.current = anchorFips;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geojsonRef = useRef<FeatureCollection<Geometry, CountyProps> | null>(null);
  const loadedRef = useRef(false);
  const countiesRef = useRef(counties);
  countiesRef.current = counties;

  // Init map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color":
                getComputedStyle(document.documentElement).getPropertyValue("--map-bg").trim() ||
                "#11182a",
            },
          },
        ],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [-96, 38],
      zoom: 3.4,
      minZoom: 2.5,
      maxZoom: 8,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", async () => {
      const fc = (await fetch(new URL("counties.geojson", document.baseURI).href).then((r) => r.json())) as FeatureCollection<
        Geometry,
        CountyProps
      >;

      // Apply current scores into the feature properties.
      // For renamed/restructured counties, the alias resolves the old GeoJSON
      // FIPS to the new DB FIPS so the shape picks up the right data.
      const scoreMap: Record<string, number> = {};
      for (const c of countiesRef.current) scoreMap[c.fips] = c.score;

      for (const f of fc.features) {
        const rawId = (f as { id?: string | number }).id;
        const fips = String(rawId ?? "").padStart(5, "0");
        const dataFips = resolveFips(fips);
        f.properties = {
          ...(f.properties ?? {}),
          fips,           // original geojson FIPS (for hover/click identity)
          data_fips: dataFips,
          score: scoreMap[dataFips] ?? -1,
        };
      }
      geojsonRef.current = fc;

      map.addSource("counties", { type: "geojson", data: fc });

      // Data-driven fill — interpolates score 0-100 across the active palette;
      // -1 = no data (rendered in a neutral fill from the theme).
      const noDataColor =
        getComputedStyle(document.documentElement).getPropertyValue("--no-data").trim() ||
        "#3b3a36";
      const s = stopsRef.current;
      map.addLayer({
        id: "counties-fill",
        type: "fill",
        source: "counties",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "score"], -1],
            noDataColor,
            [
              "interpolate",
              ["linear"],
              ["get", "score"],
              0, s[0],
              25, s[1],
              50, s[2],
              75, s[3],
              100, s[4],
            ],
          ],
          "fill-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "counties-outline",
        type: "line",
        source: "counties",
        paint: { "line-color": "#475569", "line-width": 0.4 },
      });

      // Hover highlight
      let hoverId: string | number | null = null;
      map.on("mousemove", "counties-fill", (e) => {
        if (!e.features || !e.features[0]) return;
        const f = e.features[0];
        if (f.id !== hoverId) {
          if (hoverId !== null)
            map.setFeatureState({ source: "counties", id: hoverId }, { hover: false });
          hoverId = f.id ?? null;
          if (hoverId !== null)
            map.setFeatureState({ source: "counties", id: hoverId }, { hover: true });
        }
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "counties-fill", () => {
        if (hoverId !== null)
          map.setFeatureState({ source: "counties", id: hoverId }, { hover: false });
        hoverId = null;
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "counties-fill", (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties as CountyProps & { data_fips?: string };
        // Click resolves to the data-bearing FIPS so the detail drawer can fetch from the DB
        onSelect(props.data_fips ?? props.fips);
      });

      // Hover stroke layer
      map.addLayer({
        id: "counties-hover",
        type: "line",
        source: "counties",
        paint: {
          "line-color": "#f8fafc",
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0],
        },
      });

      // Anchor highlight — bold outline + pulse on the county we're finding similars to
      map.addLayer({
        id: "counties-anchor",
        type: "line",
        source: "counties",
        paint: {
          "line-color": "#fef3c7",
          "line-width": ["case", ["boolean", ["feature-state", "anchor"], false], 3.5, 0],
        },
      });

      // Major city labels — top 400 cities by population.
      // Population threshold ramps with zoom so we don't overcrowd the lower-48 view.
      try {
        const cities = await fetch(new URL("cities.geojson", document.baseURI).href).then((r) => r.json());
        map.addSource("cities", { type: "geojson", data: cities });
        map.addLayer({
          id: "cities-dot",
          type: "circle",
          source: "cities",
          filter: [
            "any",
            [">=", ["get", "population"], 500000],
            ["all", [">=", ["zoom"], 4.5], [">=", ["get", "population"], 250000]],
            ["all", [">=", ["zoom"], 5.5], [">=", ["get", "population"], 150000]],
            ["all", [">=", ["zoom"], 6.5], [">=", ["get", "population"], 100000]],
          ],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 6, 3.5],
            "circle-color": "#f1f5f9",
            "circle-stroke-color": "#0b1018",
            "circle-stroke-width": 1,
          },
        });
        map.addLayer({
          id: "cities-label",
          type: "symbol",
          source: "cities",
          filter: [
            "any",
            [">=", ["get", "population"], 500000],
            ["all", [">=", ["zoom"], 4.5], [">=", ["get", "population"], 250000]],
            ["all", [">=", ["zoom"], 5.5], [">=", ["get", "population"], 150000]],
            ["all", [">=", ["zoom"], 6.5], [">=", ["get", "population"], 100000]],
          ],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 6, 13],
            "text-anchor": "top",
            "text-offset": [0, 0.6],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": themeMode === "light" ? "#1e293b" : "#e2e8f0",
            "text-halo-color": themeMode === "light" ? "#f8fafc" : "#0b1018",
            "text-halo-width": 1.5,
          },
        });
      } catch (e) {
        console.warn("city labels failed to load:", e);
      }

      loadedRef.current = true;
      map.resize();
      // Belt-and-suspenders: a few delayed resizes to handle late layout
      [50, 200, 500].forEach((d) => setTimeout(() => map.resize(), d));
      // If the theme/palette changed between init and load, apply the latest now.
      repaintTheme();
    });

    // Notify MapLibre whenever the container resizes (handles delayed layout).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Repaint the choropleth gradient + map bg + city label colors using current
  // theme. Called both from the load handler and the [stops, themeMode] effect.
  const repaintTheme = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const mode = themeModeRef.current;
    const currentStops = stopsRef.current;
    // Don't read CSS vars here — at the moment this effect fires, the parent
    // useTheme effect may not have applied the new vars yet (child effects
    // run before parent's). Hardcoded mode-based colors are source-of-truth.
    const noDataColor = mode === "light" ? "#d6d3d1" : "#3b3a36";
    const mapBg = mode === "light" ? "#e2e8f0" : "#11182a";
    map.setPaintProperty("background", "background-color", mapBg);
    map.setPaintProperty("counties-fill", "fill-color", [
      "case",
      ["==", ["get", "score"], -1],
      noDataColor,
      [
        "interpolate",
        ["linear"],
        ["get", "score"],
        0, currentStops[0],
        25, currentStops[1],
        50, currentStops[2],
        75, currentStops[3],
        100, currentStops[4],
      ],
    ]);
    const outlineColor = mode === "light" ? "#94a3b8" : "#0b1018";
    map.setPaintProperty("counties-outline", "line-color", outlineColor);
    const cityText = mode === "light" ? "#1e293b" : "#e2e8f0";
    const cityHalo = mode === "light" ? "#f8fafc" : "#0b1018";
    if (map.getLayer("cities-label")) {
      map.setPaintProperty("cities-label", "text-color", cityText);
      map.setPaintProperty("cities-label", "text-halo-color", cityHalo);
    }
    if (map.getLayer("cities-dot")) {
      map.setPaintProperty(
        "cities-dot",
        "circle-color",
        mode === "light" ? "#1e293b" : "#f1f5f9"
      );
      map.setPaintProperty(
        "cities-dot",
        "circle-stroke-color",
        mode === "light" ? "#f8fafc" : "#0b1018"
      );
    }
  };

  useEffect(() => { repaintTheme(); }, [stops, themeMode]);

  // Apply / clear the "anchor" feature-state when anchorFips changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !geojsonRef.current) return;
    // Clear all anchors first (only one at a time)
    for (const f of geojsonRef.current.features) {
      const id = (f.properties as CountyProps).fips;
      map.setFeatureState({ source: "counties", id }, { anchor: false });
    }
    if (!anchorFips) return;
    // Set anchor on every feature whose data_fips OR fips matches (handles aliased CT counties)
    for (const f of geojsonRef.current.features) {
      const props = f.properties as CountyProps & { data_fips?: string };
      if (props.fips === anchorFips || props.data_fips === anchorFips) {
        map.setFeatureState({ source: "counties", id: props.fips }, { anchor: true });
      }
    }
  }, [anchorFips]);

  // When counties change, splice scores back into the GeoJSON and re-set the source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojsonRef.current || !loadedRef.current) return;

    const scoreMap: Record<string, number> = {};
    for (const c of counties) scoreMap[c.fips] = c.score;

    for (const f of geojsonRef.current.features) {
      const props = f.properties as CountyProps & { data_fips?: string };
      const lookupFips = props.data_fips ?? props.fips;
      props.score = scoreMap[lookupFips] ?? -1;
    }
    const src = map.getSource("counties") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(geojsonRef.current);
  }, [counties]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div
        className="absolute bottom-2 left-2 text-xs px-3 py-2 rounded border z-10 space-y-1"
        style={{
          background: "var(--panel-strong)",
          color: "var(--text)",
          borderColor: "var(--border)",
        }}
      >
        <div className="font-medium">Match score</div>
        <div className="flex items-center gap-1">
          <div
            className="h-2 w-32 rounded"
            style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }}
          />
          <span className="ml-1">0 → 100</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="h-2 w-4 rounded" style={{ background: "var(--no-data)" }} />
          <span style={{ color: "var(--text-muted)" }}>no data / filtered out</span>
        </div>
      </div>
      <div className="absolute bottom-2 right-2 text-[10px] z-10" style={{ color: "var(--text-muted)" }}>
        City data ·{" "}
        <a
          href="https://simplemaps.com/data/us-cities"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          SimpleMaps
        </a>
      </div>
    </div>
  );
}
