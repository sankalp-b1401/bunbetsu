"""Activity location snapping and connector generation.

Connects Point and Polygon activity locations to the pedestrian graph via validated access points,
splits edges at snap points in correct topological order, detects obstacle crossings,
and preserves the distinction between mapped paths and inferred connectors.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional
import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import nearest_points, transform

from .graph_builder import PedestrianGraphNetwork, project_geometry_to_metric
from .schemas import LocationConnectivityStatus, LocationRouteRequest

logger = logging.getLogger(__name__)


class ActivityConnector:
    """Represents a generated connector between an activity location and the graph."""

    def __init__(
        self,
        location_id: str,
        location_name: str,
        activity_node_id: str,
        junction_node_id: str,
        snap_point_m: tuple[float, float],
        snap_point_wgs84: list[float],
        connector_line_m: LineString,
        connector_line_wgs84: list[list[float]],
        snap_distance_m: float,
        status: str,  # 'connected', 'flagged', 'unmatched'
        reason: Optional[str] = None,
    ):
        self.location_id = location_id
        self.location_name = location_name
        self.activity_node_id = activity_node_id
        self.junction_node_id = junction_node_id
        self.snap_point_m = snap_point_m
        self.snap_point_wgs84 = snap_point_wgs84
        self.connector_line_m = connector_line_m
        self.connector_line_wgs84 = connector_line_wgs84
        self.snap_distance_m = snap_distance_m
        self.status = status
        self.reason = reason


def determine_candidate_access_point(
    loc_geom_m: Any,
    network_graph: nx.Graph,
) -> Point:
    """Determine the most plausible pedestrian access point for a location in metric space.

    - For Point: returns the point itself.
    - For Polygon/MultiPolygon:
      Checks if any mapped pedestrian path intersects the polygon boundary.
      If so, uses the closest boundary intersection.
      Otherwise, evaluates the polygon's exterior boundary and picks the point closest to
      any mapped edge in the graph (avoiding blind centroid snapping).
    """
    if isinstance(loc_geom_m, Point):
        return loc_geom_m

    if isinstance(loc_geom_m, (Polygon, MultiPolygon)):
        boundary = loc_geom_m.boundary

        # Check intersection with mapped edges
        best_intersection_pt: Optional[Point] = None
        min_dist_to_center = float("inf")
        center_pt = loc_geom_m.centroid

        for _, _, data in network_graph.edges(data=True):
            if data.get("provenance") != "osm_mapped":
                continue
            edge_geom: Optional[LineString] = data.get("geometry_m")
            if edge_geom is None:
                continue

            # Does this edge intersect the polygon boundary?
            inter = edge_geom.intersection(boundary)
            if not inter.is_empty:
                candidates: list[Point] = []
                if isinstance(inter, Point):
                    candidates.append(inter)
                elif hasattr(inter, "geoms"):
                    for g in inter.geoms:
                        if isinstance(g, Point):
                            candidates.append(g)
                for cand in candidates:
                    d = cand.distance(center_pt)
                    if d < min_dist_to_center:
                        min_dist_to_center = d
                        best_intersection_pt = cand

        if best_intersection_pt is not None:
            return best_intersection_pt

        # If no edge intersects boundary, find point on boundary closest to any edge
        best_boundary_pt: Optional[Point] = None
        min_edge_dist = float("inf")

        for _, _, data in network_graph.edges(data=True):
            if data.get("provenance") != "osm_mapped":
                continue
            edge_geom = data.get("geometry_m")
            if edge_geom is None:
                continue
            d = boundary.distance(edge_geom)
            if d < min_edge_dist:
                min_edge_dist = d
                near_pts = nearest_points(boundary, edge_geom)
                best_boundary_pt = near_pts[0]

        if best_boundary_pt is not None:
            return best_boundary_pt

        # Fallback to centroid if graph has no edges or boundary failed
        return loc_geom_m.centroid

    return Point(0, 0)


def check_obstacle_crossings(
    connector_line_m: LineString,
    location_geom_m: Any,
    building_polygons_m: list[Polygon],
    barrier_lines_m: list[LineString],
) -> Optional[str]:
    """Check if candidate connector line crosses buildings or barriers outside the activity area."""
    if connector_line_m.length < 0.5:
        return None

    # Check buildings
    for b_poly in building_polygons_m:
        if location_geom_m is not None and location_geom_m.intersects(b_poly):
            # Building is part of or contains the activity area itself
            continue
        # Does connector cross the building?
        if connector_line_m.crosses(b_poly) or b_poly.contains(connector_line_m):
            return "Connector crosses building obstacle"

    # Check barriers
    for b_line in barrier_lines_m:
        if connector_line_m.crosses(b_line):
            return "Connector crosses barrier obstacle"

    return None


def connect_activity_locations(
    network: PedestrianGraphNetwork,
    locations: list[LocationRouteRequest],
    max_snap_distance_m: float = 50.0,
    check_barriers: bool = True,
) -> tuple[nx.Graph, list[ActivityConnector], list[LocationConnectivityStatus]]:
    """Connect all activity locations to the pedestrian graph.

    Snaps to the closest point along eligible mapped edges, splits edges in proper topological order,
    and returns the augmented graph and connector diagnostics.
    """
    G = network.graph
    forward_trans = network.forward_transform
    inverse_trans = network.inverse_transform

    connectors: list[ActivityConnector] = []
    connectivity_statuses: list[LocationConnectivityStatus] = []

    if G.number_of_edges() == 0:
        for loc in locations:
            connectivity_statuses.append(
                LocationConnectivityStatus(
                    location_id=loc.id,
                    location_name=loc.name,
                    status="unmatched",
                    reason="Pedestrian network graph is empty (no mapped paths within campus).",
                )
            )
        return G, connectors, connectivity_statuses

    # 1. Evaluate candidate snaps for each location
    # Map edge -> list of snaps: [(t, snap_point_m, loc, access_point_m)]
    edge_snaps: dict[tuple[str, str], list[dict[str, Any]]] = {}
    unmatched_locs: list[LocationRouteRequest] = []

    for loc in locations:
        loc_shape_wgs84 = shape(loc.geometry)
        loc_shape_m = project_geometry_to_metric(loc_shape_wgs84, forward_trans)

        access_point_m = determine_candidate_access_point(loc_shape_m, G)
        access_lon, access_lat = inverse_trans.transform(access_point_m.x, access_point_m.y)

        # Add activity node in graph
        activity_node_id = f"activity_{loc.id}"
        G.add_node(
            activity_node_id,
            x=access_point_m.x,
            y=access_point_m.y,
            longitude=round(float(access_lon), 7),
            latitude=round(float(access_lat), 7),
            location_id=loc.id,
            location_name=loc.name,
            is_activity=True,
        )

        # Find closest mapped edge in G
        best_edge: Optional[tuple[str, str]] = None
        best_dist = float("inf")
        best_snap_point_m: Optional[Point] = None
        best_edge_geom: Optional[LineString] = None

        for u, v, data in G.edges(data=True):
            if data.get("provenance") != "osm_mapped":
                continue
            edge_geom: Optional[LineString] = data.get("geometry_m")
            if edge_geom is None:
                continue

            dist = edge_geom.distance(access_point_m)
            if dist < best_dist:
                best_dist = dist
                best_edge = (u, v)
                best_edge_geom = edge_geom
                # Snap point on edge
                proj_dist = edge_geom.project(access_point_m)
                best_snap_point_m = edge_geom.interpolate(proj_dist)

        if best_edge is None or best_dist > max_snap_distance_m or best_snap_point_m is None:
            reason = f"Distance to nearest pedestrian path ({best_dist:.1f}m) exceeds threshold ({max_snap_distance_m:.1f}m)."
            logger.info("Location '%s' unmatched: %s", loc.name, reason)
            connectivity_statuses.append(
                LocationConnectivityStatus(
                    location_id=loc.id,
                    location_name=loc.name,
                    status="unmatched",
                    snap_distance_m=round(best_dist, 2) if math.isfinite(best_dist) else None,
                    reason=reason,
                )
            )
            continue

        # Check edge key order
        u, v = best_edge
        norm_key = (u, v) if u < v else (v, u)
        if norm_key not in edge_snaps:
            edge_snaps[norm_key] = []

        proj_t = best_edge_geom.project(best_snap_point_m)
        edge_snaps[norm_key].append({
            "t": proj_t,
            "snap_point_m": best_snap_point_m,
            "loc": loc,
            "loc_shape_m": loc_shape_m,
            "access_point_m": access_point_m,
            "distance_m": best_dist,
        })

    # 2. Process edge splitting for edges with snaps
    junction_counter = 0

    for (u, v), snaps in edge_snaps.items():
        if not G.has_edge(u, v):
            continue

        edge_data = dict(G[u][v])
        orig_geom: LineString = edge_data["geometry_m"]
        osm_way_id = edge_data.get("osm_way_id", 0)
        highway = edge_data.get("highway", "path")
        layer = edge_data.get("layer", 0)
        bridge = edge_data.get("bridge", False)
        tunnel = edge_data.get("tunnel", False)

        # Sort snaps by distance along original edge line
        snaps.sort(key=lambda s: s["t"])

        # Deduplicate snap points that are within 0.15m of each other (reuse junction node!)
        grouped_junctions: list[dict[str, Any]] = []
        for snap_info in snaps:
            sp = snap_info["snap_point_m"]
            found = False
            for gj in grouped_junctions:
                if sp.distance(gj["point_m"]) < 0.15:
                    gj["snaps"].append(snap_info)
                    found = True
                    break
            if not found:
                junction_counter += 1
                j_node_id = f"junction_{osm_way_id}_{junction_counter}"
                grouped_junctions.append({
                    "node_id": j_node_id,
                    "t": snap_info["t"],
                    "point_m": sp,
                    "snaps": [snap_info],
                })

        # Sort grouped junctions along edge
        grouped_junctions.sort(key=lambda j: j["t"])

        # Remove original edge before inserting split segments
        G.remove_edge(u, v)

        # Add junction nodes to graph
        for gj in grouped_junctions:
            jn_id = gj["node_id"]
            jx, jy = gj["point_m"].x, gj["point_m"].y
            j_lon, j_lat = inverse_trans.transform(jx, jy)
            G.add_node(
                jn_id,
                x=jx,
                y=jy,
                longitude=round(float(j_lon), 7),
                latitude=round(float(j_lat), 7),
                is_junction=True,
            )

        # Chain of nodes along the edge: u -> j_1 -> j_2 -> ... -> v
        ordered_nodes = [u] + [gj["node_id"] for gj in grouped_junctions] + [v]

        # Extract coordinates of original line and split cleanly
        for i in range(len(ordered_nodes) - 1):
            n_start = ordered_nodes[i]
            n_end = ordered_nodes[i + 1]

            # Interpolate segment line between n_start and n_end
            t_start = 0.0 if i == 0 else grouped_junctions[i - 1]["t"]
            t_end = orig_geom.length if i == len(ordered_nodes) - 2 else grouped_junctions[i]["t"]

            if t_end - t_start < 0.05:
                # Very close; direct line
                p1 = (G.nodes[n_start]["x"], G.nodes[n_start]["y"])
                p2 = (G.nodes[n_end]["x"], G.nodes[n_end]["y"])
                sub_line_m = LineString([p1, p2])
            else:
                # Cut original line between t_start and t_end
                # Use shapely interpolation
                pts = [(G.nodes[n_start]["x"], G.nodes[n_start]["y"])]
                # Add intermediate vertices of orig_geom if any lie between t_start and t_end
                for coord in orig_geom.coords:
                    pt = Point(coord)
                    pt_t = orig_geom.project(pt)
                    if t_start + 0.05 < pt_t < t_end - 0.05:
                        pts.append(coord)
                pts.append((G.nodes[n_end]["x"], G.nodes[n_end]["y"]))
                sub_line_m = LineString(pts)

            sub_wgs84 = []
            for x, y in sub_line_m.coords:
                lon, lat = inverse_trans.transform(x, y)
                sub_wgs84.append([round(float(lon), 7), round(float(lat), 7)])

            sub_length_m = round(float(sub_line_m.length), 3)
            sub_edge_id = f"way_{osm_way_id}_{n_start}_{n_end}"

            G.add_edge(
                n_start,
                n_end,
                id=sub_edge_id,
                length_m=max(0.1, sub_length_m),
                osm_way_id=osm_way_id,
                highway=highway,
                geometry_m=sub_line_m,
                geometry_wgs84=sub_wgs84,
                layer=layer,
                bridge=bridge,
                tunnel=tunnel,
                provenance="osm_mapped",
            )

        # Now connect each location to its assigned junction node
        for gj in grouped_junctions:
            jn_id = gj["node_id"]
            jp_m = gj["point_m"]
            j_lon, j_lat = inverse_trans.transform(jp_m.x, jp_m.y)

            for snap_info in gj["snaps"]:
                loc = snap_info["loc"]
                loc_shape_m = snap_info["loc_shape_m"]
                acc_m = snap_info["access_point_m"]
                dist = snap_info["distance_m"]

                conn_line_m = LineString([(acc_m.x, acc_m.y), (jp_m.x, jp_m.y)])
                conn_wgs84 = []
                for x, y in conn_line_m.coords:
                    lon, lat = inverse_trans.transform(x, y)
                    conn_wgs84.append([round(float(lon), 7), round(float(lat), 7)])

                # Validate obstacles
                status = "connected"
                reason = None
                if check_barriers:
                    obstacle_issue = check_obstacle_crossings(
                        conn_line_m,
                        loc_shape_m,
                        network.building_polygons_m,
                        network.barrier_lines_m,
                    )
                    if obstacle_issue:
                        status = "flagged"
                        reason = obstacle_issue

                # Add connector edge to graph
                activity_node_id = f"activity_{loc.id}"
                conn_edge_id = f"connector_{loc.id}_{jn_id}"

                G.add_edge(
                    activity_node_id,
                    jn_id,
                    id=conn_edge_id,
                    length_m=round(float(conn_line_m.length), 3),
                    snap_distance_m=round(dist, 2),
                    location_id=loc.id,
                    status=status,
                    reason=reason,
                    geometry_m=conn_line_m,
                    geometry_wgs84=conn_wgs84,
                    provenance="connector",
                )

                connector_obj = ActivityConnector(
                    location_id=loc.id,
                    location_name=loc.name,
                    activity_node_id=activity_node_id,
                    junction_node_id=jn_id,
                    snap_point_m=(jp_m.x, jp_m.y),
                    snap_point_wgs84=[round(float(j_lon), 7), round(float(j_lat), 7)],
                    connector_line_m=conn_line_m,
                    connector_line_wgs84=conn_wgs84,
                    snap_distance_m=round(dist, 2),
                    status=status,
                    reason=reason,
                )
                connectors.append(connector_obj)

                connectivity_statuses.append(
                    LocationConnectivityStatus(
                        location_id=loc.id,
                        location_name=loc.name,
                        status=status,  # type: ignore[arg-type]
                        snap_distance_m=round(dist, 2),
                        snap_point=[round(float(j_lon), 7), round(float(j_lat), 7)],
                        reason=reason,
                    )
                )

    logger.info(
        "Connector summary: %d connected/flagged connectors created, %d locations processed",
        len(connectors),
        len(locations),
    )

    return G, connectors, connectivity_statuses
