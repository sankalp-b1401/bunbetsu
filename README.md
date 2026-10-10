# Bunbetsu (分別)

Intelligent Waste Management & Spatial Planning Platform for College Events

---

## System Components

### 1. Waste Prediction Model (Phase 1)
- Evidence-backed mathematical model predicting total waste generation based on footfall, duration, and activity intensity.
- Predicts stream composition (Food, Plastic, Paper, Glass, Others) and recyclability breakdown.
- Prepares spatial allocation across configured event zones.
- Frozen deterministic contract: mathematical implementation remains unchanged.

### 2. Bin Distribution Model
- Converts predicted stream masses to volume and required bin capacities.
- Computes perimeter spacing and samples inward-offset polygon boundaries.
- Produces venue-constrained bin coordinate placements.

### 3. Pedestrian Routes Pipeline (Phase 2)
- **OSM Acquisition**: Retrieves eligible walkable ways and obstacle geometries (buildings, barriers) via Overpass API with caching, bounded retries, and conservative access filtering.
- **Pedestrian Graph Construction**: Builds a metric NetworkX graph in local Azimuthal Equidistant projection, strictly preserves OSM node topology, clips paths to campus boundaries, and prevents false 2D crossing connections (grade separation).
- **Activity Connectors**: Connects Point and Polygon event locations to the graph via nearest suitable edge points, splits edges in topological order, reuses shared junctions, and flags obstacle crossings.
- **Route Scoring**: Evaluates shortest pedestrian paths between activity locations, allocates demand weights via symmetric geometric mean attraction proxies, and normalizes scores to `[0, 1]`.
- **Interactive Visualization**: Renders color-coded route demand corridors, dashed access connectors, and priority junctions on MapLibre.

---

## API Reference

### Pedestrian Routes Planning
`POST /api/routes/plan`

#### Request Body
```json
{
  "boundary": {
    "type": "Polygon",
    "coordinates": [[[81.859, 25.490], [81.868, 25.490], [81.868, 25.498], [81.859, 25.498], [81.859, 25.490]]]
  },
  "locations": [
    {
      "id": "loc-stage",
      "name": "Main Stage",
      "activities": ["Music Concert"],
      "geometry": { "type": "Point", "coordinates": [81.862, 25.494] }
    },
    {
      "id": "loc-food",
      "name": "Food Quad",
      "activities": ["Food Stalls"],
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[81.865, 25.494], [81.867, 25.494], [81.867, 25.496], [81.865, 25.496], [81.865, 25.494]]]
      }
    }
  ],
  "config": {
    "max_snap_distance_m": 50.0,
    "overpass_timeout_s": 25.0,
    "check_barriers": true
  }
}
```

#### Response Structure
```json
{
  "success": true,
  "boundary_geojson": { ... },
  "paths_geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "way_1001_osm_node_1_osm_node_2_0",
        "geometry": { "type": "LineString", "coordinates": [...] },
        "properties": {
          "id": "way_1001_osm_node_1_osm_node_2_0",
          "osm_way_id": 1001,
          "highway": "footway",
          "length_m": 124.5,
          "raw_score": 0.894,
          "normalized_score": 1.0,
          "provenance": "osm_mapped"
        }
      }
    ]
  },
  "connectors_geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "connector_loc-stage",
        "geometry": { "type": "LineString", "coordinates": [...] },
        "properties": {
          "location_id": "loc-stage",
          "snap_distance_m": 14.2,
          "connector_length_m": 14.2,
          "status": "connected",
          "provenance": "connector"
        }
      }
    ]
  },
  "location_connectivity": [
    {
      "location_id": "loc-stage",
      "location_name": "Main Stage",
      "status": "connected",
      "snap_distance_m": 14.2,
      "snap_point": [81.8621, 25.4941]
    }
  ],
  "diagnostics": {
    "graph": {
      "nodes_count": 45,
      "edges_count": 52,
      "total_length_m": 3420.5,
      "components_count": 1
    },
    "scoring": {
      "evaluated_pairs": 1,
      "connected_pairs": 1,
      "unreachable_pairs": 0,
      "max_raw_score": 0.894
    }
  },
  "metadata": {
    "score_interpretation": "Modelled relative route importance index in range [0, 1]. Indicates relative pedestrian corridor demand under event layout assumptions, not empirical sensor footfall."
  },
  "warnings": []
}
```

---

## Configuration & Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `OVERPASS_API_URL` | `https://overpass-api.de/api/interpreter` | Upstream OpenStreetMap Overpass QL endpoint |
| `VITE_API_BASE_URL` | `""` (proxied or direct) | FastAPI backend URL for frontend client |

---

## Running the Application

### Backend
```bash
# Activate virtual environment
backend\.venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Run FastAPI server
uvicorn server:app --app-dir backend --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Running Tests
```bash
# Run all backend unit and API tests
backend\.venv\Scripts\python -m pytest -c backend/pytest.ini backend

# Run frontend type-check
npm --prefix frontend run lint

# Run frontend production build
npm --prefix frontend run build
```
