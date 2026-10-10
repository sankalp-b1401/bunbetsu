"""Topologically correct pedestrian graph construction.

Constructs an undirected NetworkX graph from eligible OSM pedestrian ways,
projecting coordinates to a local metric Azimuthal Equidistant coordinate system,
preserving genuine node topology, clipping strictly to the campus boundary polygon,
and avoiding false grade-separated crossings.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional
import networkx as nx
from pyproj import CRS, Transformer
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import transform

logger = logging.getLogger(__name__)


def create_local_metric_transformers(centroid_lon: float, centroid_lat: float) -> tuple[Transformer, Transformer]:
    """Create forward and inverse transformers for local Azimuthal Equidistant projection (metres)."""
    local_crs = CRS.from_proj4(
        f"+proj=aeqd +lat_0={centroid_lat:.7f} +lon_0={centroid_lon:.7f} "
        "+datum=WGS84 +units=m +no_defs"
    )
    forward = Transformer.from_crs(CRS.from_epsg(4326), local_crs, always_xy=True)
    inverse = Transformer.from_crs(local_crs, CRS.from_epsg(4326), always_xy=True)
    return forward, inverse


def project_geometry_to_metric(geom: Any, forward_transform: Transformer) -> Any:
    """Project a Shapely geometry from WGS84 to local metric projection."""
    return transform(lambda x, y, z=None: forward_transform.transform(x, y), geom)


def project_geometry_to_wgs84(geom: Any, inverse_transform: Transformer) -> Any:
    """Project a Shapely geometry from local metric projection back to WGS84."""
    return transform(lambda x, y, z=None: inverse_transform.transform(x, y), geom)


def get_linestring_wgs84_coords(line_m: LineString, inverse_transform: Transformer) -> list[list[float]]:
    """Convert a metric LineString to a list of [longitude, latitude] coordinates in WGS84."""
    coords = []
    for x, y in line_m.coords:
        lon, lat = inverse_transform.transform(x, y)
        coords.append([round(float(lon), 7), round(float(lat), 7)])
    return coords


class PedestrianGraphNetwork:
    """Represents the campus pedestrian network graph and its spatial context."""

    def __init__(
        self,
        graph: nx.Graph,
        boundary_wgs84: Polygon | MultiPolygon,
        boundary_m: Polygon | MultiPolygon,
        forward_transform: Transformer,
        inverse_transform: Transformer,
        building_polygons_m: list[Polygon],
        barrier_lines_m: list[LineString],
        discarded_segments_count: int = 0,
    ):
        self.graph = graph
        self.boundary_wgs84 = boundary_wgs84
        self.boundary_m = boundary_m
        self.forward_transform = forward_transform
        self.inverse_transform = inverse_transform
        self.building_polygons_m = building_polygons_m
        self.barrier_lines_m = barrier_lines_m
        self.discarded_segments_count = discarded_segments_count

    @property
    def node_count(self) -> int:
        return self.graph.number_of_nodes()

    @property
    def edge_count(self) -> int:
        return self.graph.number_of_edges()

    @property
    def total_length_m(self) -> float:
        return sum(data.get("length_m", 0.0) for _, _, data in self.graph.edges(data=True))

    @property
    def components_count(self) -> int:
        if self.graph.number_of_nodes() == 0:
            return 0
        return nx.number_connected_components(self.graph)


def build_pedestrian_graph(
    boundary_geojson: dict[str, Any],
    nodes_dict: dict[int, dict[str, float]],
    pedestrian_ways: list[dict[str, Any]],
    obstacle_ways: list[dict[str, Any]],
) -> PedestrianGraphNetwork:
    """Build a topologically validated pedestrian graph clipped to campus boundaries."""
    # 1. Parse and validate campus boundary shape
    boundary_wgs84 = shape(boundary_geojson)
    if not isinstance(boundary_wgs84, (Polygon, MultiPolygon)):
        raise ValueError(f"Boundary must be Polygon or MultiPolygon, received {boundary_wgs84.geom_type}.")
    if boundary_wgs84.is_empty or not boundary_wgs84.is_valid:
        raise ValueError("Campus boundary geometry is empty or invalid.")

    centroid = boundary_wgs84.centroid
    forward_trans, inverse_trans = create_local_metric_transformers(centroid.x, centroid.y)
    boundary_m = project_geometry_to_metric(boundary_wgs84, forward_trans)

    # 2. Build obstacle geometries in metric space for connector validation
    building_polygons_m: list[Polygon] = []
    barrier_lines_m: list[LineString] = []

    for obs in obstacle_ways:
        obs_nodes = obs.get("nodes", [])
        pts_m = []
        for nid in obs_nodes:
            if nid in nodes_dict:
                nd = nodes_dict[nid]
                mx, my = forward_trans.transform(nd["lon"], nd["lat"])
                pts_m.append((mx, my))

        if len(pts_m) < 2:
            continue

        if obs.get("type") == "building":
            # If closed ring
            if len(pts_m) >= 4 and pts_m[0] == pts_m[-1]:
                poly = Polygon(pts_m)
                if poly.is_valid and poly.area > 1.0:
                    building_polygons_m.append(poly)
            elif len(pts_m) >= 3:
                poly = Polygon(pts_m + [pts_m[0]])
                if poly.is_valid and poly.area > 1.0:
                    building_polygons_m.append(poly)
        elif obs.get("type") == "barrier":
            line = LineString(pts_m)
            if line.length > 0.5:
                barrier_lines_m.append(line)

    # 3. Construct Graph
    G = nx.Graph()
    discarded_segments_count = 0
    clip_node_counter = 0

    # Cache for node metric coordinates
    node_metric_coords: dict[str, tuple[float, float]] = {}

    for way in pedestrian_ways:
        osm_way_id = way.get("id", 0)
        way_nodes = way.get("nodes", [])
        highway = way.get("highway", "path")
        layer = way.get("layer", 0)
        bridge = way.get("bridge", False)
        tunnel = way.get("tunnel", False)

        for i in range(len(way_nodes) - 1):
            n1_id = way_nodes[i]
            n2_id = way_nodes[i + 1]

            if n1_id not in nodes_dict or n2_id not in nodes_dict:
                discarded_segments_count += 1
                continue

            node1 = nodes_dict[n1_id]
            node2 = nodes_dict[n2_id]

            u_name = f"osm_node_{n1_id}"
            v_name = f"osm_node_{n2_id}"

            if u_name not in node_metric_coords:
                ux, uy = forward_trans.transform(node1["lon"], node1["lat"])
                node_metric_coords[u_name] = (ux, uy)
            else:
                ux, uy = node_metric_coords[u_name]

            if v_name not in node_metric_coords:
                vx, vy = forward_trans.transform(node2["lon"], node2["lat"])
                node_metric_coords[v_name] = (vx, vy)
            else:
                vx, vy = node_metric_coords[v_name]

            seg_line_m = LineString([(ux, uy), (vx, vy)])
            if seg_line_m.length < 1e-4:
                discarded_segments_count += 1
                continue

            # Clip segment to campus boundary
            clipped_geom = seg_line_m.intersection(boundary_m)
            if clipped_geom.is_empty:
                discarded_segments_count += 1
                continue

            # Handle single LineString vs MultiLineString
            sub_lines: list[LineString] = []
            if isinstance(clipped_geom, LineString):
                sub_lines = [clipped_geom]
            elif isinstance(clipped_geom, MultiLineString):
                sub_lines = list(clipped_geom.geoms)
            else:
                discarded_segments_count += 1
                continue

            for sub_idx, sub_line in enumerate(sub_lines):
                if sub_line.length < 0.05:
                    # Discard tiny slivers
                    discarded_segments_count += 1
                    continue

                p_start = sub_line.coords[0]
                p_end = sub_line.coords[-1]

                # Identify start node
                start_node_id: str
                if math.hypot(p_start[0] - ux, p_start[1] - uy) < 0.1:
                    start_node_id = u_name
                elif math.hypot(p_start[0] - vx, p_start[1] - vy) < 0.1:
                    start_node_id = v_name
                else:
                    clip_node_counter += 1
                    start_node_id = f"clip_{osm_way_id}_{n1_id}_{n2_id}_{clip_node_counter}_start"
                    node_metric_coords[start_node_id] = (p_start[0], p_start[1])

                # Identify end node
                end_node_id: str
                if math.hypot(p_end[0] - vx, p_end[1] - vy) < 0.1:
                    end_node_id = v_name
                elif math.hypot(p_end[0] - ux, p_end[1] - uy) < 0.1:
                    end_node_id = u_name
                else:
                    clip_node_counter += 1
                    end_node_id = f"clip_{osm_way_id}_{n1_id}_{n2_id}_{clip_node_counter}_end"
                    node_metric_coords[end_node_id] = (p_end[0], p_end[1])

                if start_node_id == end_node_id:
                    discarded_segments_count += 1
                    continue

                # Add nodes to G with coordinates
                for nid in (start_node_id, end_node_id):
                    if nid not in G:
                        nx_c, ny_c = node_metric_coords[nid]
                        n_lon, n_lat = inverse_trans.transform(nx_c, ny_c)
                        G.add_node(
                            nid,
                            x=nx_c,
                            y=ny_c,
                            longitude=round(float(n_lon), 7),
                            latitude=round(float(n_lat), 7),
                        )

                # Add edge
                wgs84_coords = get_linestring_wgs84_coords(sub_line, inverse_trans)
                length_m = round(float(sub_line.length), 3)

                # If edge already exists (e.g. parallel or reverse way segment), avoid zeroing or duplicate
                edge_id = f"way_{osm_way_id}_{start_node_id}_{end_node_id}_{sub_idx}"
                if G.has_edge(start_node_id, end_node_id):
                    # Keep shorter or combine
                    existing_length = G[start_node_id][end_node_id].get("length_m", float("inf"))
                    if length_m < existing_length:
                        G[start_node_id][end_node_id].update({
                            "id": edge_id,
                            "length_m": length_m,
                            "osm_way_id": osm_way_id,
                            "highway": highway,
                            "geometry_m": sub_line,
                            "geometry_wgs84": wgs84_coords,
                            "layer": layer,
                            "bridge": bridge,
                            "tunnel": tunnel,
                            "provenance": "osm_mapped",
                        })
                else:
                    G.add_edge(
                        start_node_id,
                        end_node_id,
                        id=edge_id,
                        length_m=length_m,
                        osm_way_id=osm_way_id,
                        highway=highway,
                        geometry_m=sub_line,
                        geometry_wgs84=wgs84_coords,
                        layer=layer,
                        bridge=bridge,
                        tunnel=tunnel,
                        provenance="osm_mapped",
                    )

    logger.info(
        "Built pedestrian graph: %d nodes, %d edges, %d components, %d discarded segments",
        G.number_of_nodes(),
        G.number_of_edges(),
        nx.number_connected_components(G) if G.number_of_nodes() > 0 else 0,
        discarded_segments_count,
    )

    return PedestrianGraphNetwork(
        graph=G,
        boundary_wgs84=boundary_wgs84,
        boundary_m=boundary_m,
        forward_transform=forward_trans,
        inverse_transform=inverse_trans,
        building_polygons_m=building_polygons_m,
        barrier_lines_m=barrier_lines_m,
        discarded_segments_count=discarded_segments_count,
    )

