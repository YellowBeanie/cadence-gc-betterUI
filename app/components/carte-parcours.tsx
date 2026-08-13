'use client';

import { useEffect, useRef, useState } from 'react';
// `maplibre-gl` (v6) n'a pas d'export par défaut, seulement des exports
// nommés — `MapLibreMap` (alias fourni par le paquet lui-même) évite
// d'ombrer le `Map` global de JavaScript.
import { MapLibreMap, setWorkerUrl, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PointTraceGps } from '@/lib/types';

// Le worker module de MapLibre n'est pas emporté par le bundle Turbopack :
// sans ceci, le navigateur demandait son URL interne au serveur Next, qui
// répondait la page 404 en text/html → « Failed to load module script » →
// worker mort → la source GeoJSON n'était JAMAIS parsée (tuiles raster
// visibles — elles passent par le thread principal — mais tracé absent,
// diagnostic CDP tâche 27). Worker + bundle partagé sont donc servis en
// assets statiques : `public/maplibre/` (copies versionnées de
// node_modules/maplibre-gl/dist/ — à recopier lors d'un upgrade maplibre).
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const COULEUR_TRACE = '#ec3013';
const COULEUR_DEPART = '#2f9e44';
const COULEUR_ARRIVEE = '#201e1d';

// Vie privée (brief tâche 27) : les tuiles ci-dessous sont chargées
// directement par le NAVIGATEUR du client, pas par le serveur de l'app — seules
// les zones de tuiles couvrant la trace transitent vers ces services publics
// (OpenTopoMap, AWS Open Data Terrain Tiles). La trace GPS elle-même
// (coordonnées lat/lon) reste un aller-retour classique serveur→client de
// l'app, jamais envoyée à un tiers. Aucune clé d'API n'est utilisée.
//
// Fond OpenTopoMap (retour l'utilisateur : « quelque chose qui ressemble aux cartes
// d'AllTrails ») : rendu topographique — courbes de niveau, ombrage,
// sentiers — là où le fond OSM standard est un plan de ville.
function construireStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      topo: {
        type: 'raster',
        tiles: [
          'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
      },
      terrain: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
        attribution: 'Terrain : Mapzen/AWS',
      },
    },
    layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
  };
}

/** Carte 3D du parcours (tâche 27, restylée façon AllTrails sur retour l'utilisateur) —
 *  MapLibre GL JS : fond topographique OpenTopoMap, terrain Terrarium (AWS
 *  Open Data, sans clé), tracé accent à liseré blanc, marqueurs départ/arrivée.
 *  Chargée en `next/dynamic` `ssr:false` par `components/section-parcours.tsx` :
 *  MapLibre a besoin de WebGL/`window`, absents côté serveur.
 *
 *  Repli honnête : si WebGL est indisponible, l'initialisation échoue et le
 *  composant retourne `null`. Une tuile isolée qui échoue (429, zone sans
 *  donnée) ne tue PAS la carte : l'évènement `error` de MapLibre se déclenche
 *  pour chaque tuile manquante et n'est pas un état fatal — première version
 *  trop stricte, la carte disparaissait entière sur un aléa réseau. */
export function CarteParcours({ trace }: { trace: PointTraceGps[] }) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const carteRef = useRef<MapLibreMap | null>(null);
  const [enErreur, setEnErreur] = useState(false);
  const [troisD, setTroisD] = useState(false);

  // Bascule 2D ↔ 3D : le terrain n'est actif QUE en 3D — drapée dessus, la
  // ligne est partiellement occluse par le relief (comportement physique
  // normal du drapage, vérifié par sonde), donc jamais en vue par défaut.
  const basculer = () => {
    const map = carteRef.current;
    if (!map) return;
    if (troisD) {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      setTroisD(false);
    } else {
      map.setTerrain({ source: 'terrain', exaggeration: 1.15 });
      map.easeTo({ pitch: 45, bearing: -15, duration: 600 });
      setTroisD(true);
    }
  };

  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur) return;

    let map: MapLibreMap | null = null;
    try {
      map = new MapLibreMap({
        container: conteneur,
        style: construireStyle(),
      });

      // Poignée de diagnostic pour la vérification pilotée (contrôleur) :
      // permet d'interroger sources/couches/features depuis la console sans
      // exposer quoi que ce soit de sensible.
      (conteneur as HTMLDivElement & { __carte?: MapLibreMap }).__carte = map;
      carteRef.current = map;

      map.on('load', () => {
        if (!map) return;
        try {
          const coords = trace.map((p) => [p.lon, p.lat] as [number, number]);
          map.addSource('trace', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: coords },
            },
          });
          // Liseré blanc sous le tracé accent : lisibilité sur fond topo
          // chargé (convention AllTrails), extrémités arrondies.
          map.addLayer({
            id: 'trace-liseret',
            type: 'line',
            source: 'trace',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
          });
          map.addLayer({
            id: 'trace-line',
            type: 'line',
            source: 'trace',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': COULEUR_TRACE, 'line-width': 4 },
          });
          map.addSource('bornes', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', properties: { role: 'depart' }, geometry: { type: 'Point', coordinates: coords[0] } },
                { type: 'Feature', properties: { role: 'arrivee' }, geometry: { type: 'Point', coordinates: coords[coords.length - 1] } },
              ],
            },
          });
          map.addLayer({
            id: 'bornes',
            type: 'circle',
            source: 'bornes',
            paint: {
              'circle-radius': 7,
              'circle-color': ['match', ['get', 'role'], 'depart', COULEUR_DEPART, COULEUR_ARRIVEE],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2.5,
            },
          });

          const lons = trace.map((p) => p.lon);
          const lats = trace.map((p) => p.lat);
          const bounds: LngLatBoundsLike = [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ];
          // Vue par défaut 2D À PLAT (convention AllTrails) : vérifié par
          // sonde A/B — en 3D incliné, la ligne drapée sur le terrain est
          // OCCLUSE par segments derrière les crêtes (retour l'utilisateur : « le tracé
          // n'est pas placé dessus », parcours de montagne). Le 3D reste
          // disponible via le bouton, en connaissance de cause. `animate:
          // false` : captures headless stables (leçon tâche 22, CLAUDE.md).
          map.fitBounds(bounds, { padding: 64, animate: false });
        } catch {
          setEnErreur(true);
        }
      });
    } catch {
      // Échec synchrone de `new maplibregl.Map(...)` (WebGL indisponible) :
      // reporté au micro-tâche suivant pour ne pas appeler setState de façon
      // synchrone dans le corps de l'effet (react-hooks/set-state-in-effect).
      queueMicrotask(() => setEnErreur(true));
      return;
    }

    return () => {
      carteRef.current = null;
      map?.remove();
    };
    // `trace` est stable pour la durée de vie du composant (une page de détail
    // de séance rendue une fois par activité) : dépendance volontairement
    // limitée au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (enErreur) return null;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={conteneurRef} style={{ width: '100%', height: '100%' }} />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={basculer}
        aria-pressed={troisD}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 5,
          background: 'var(--color-bg)', fontSize: 12, letterSpacing: '.06em',
          textTransform: 'uppercase', padding: '6px 12px',
        }}
      >
        {troisD ? 'Vue 2D' : 'Relief 3D'}
      </button>
    </div>
  );
}
