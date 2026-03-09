import Foundation
import ARKit
import RealityKit
import CoreGraphics
import simd

struct CargoDimensions {
    let length: Float
    let width: Float
    let height: Float
    let confidence: Double

    var cbm: Float {
        (length * width * height) / 1_000_000
    }
}

struct PlaneEquation {
    let normal: simd_float3
    let d: Float

    init?(normal: simd_float3, point: simd_float3) {
        let len = simd_length(normal)
        guard len > 1e-5 else { return nil }
        let n = normal / len
        self.normal = n
        self.d = -simd_dot(n, point)
    }

    func signedDistance(to point: simd_float3) -> Float {
        simd_dot(normal, point) + d
    }

    func absoluteDistance(to point: simd_float3) -> Float {
        abs(signedDistance(to: point))
    }

    func flippedIfNeeded(toAlignWith target: simd_float3) -> PlaneEquation {
        if simd_dot(normal, target) >= 0 {
            return self
        }
        return PlaneEquation(normal: -normal, d: -d)
    }

    private init(normal: simd_float3, d: Float) {
        self.normal = normal
        self.d = d
    }
}

struct EdgeLine {
    let point: simd_float3
    let direction: simd_float3
}

struct GeometricScanConfig {
    let minClusterPoints: Int
    let clusterDistanceThreshold: Float
    let minClusterSurfaceArea: Float
    let maxPointCount: Int
    let ransacIterations: Int
    let ransacDistanceThreshold: Float
    let minPlaneInlierCount: Int
    let minTopCorners: Int

    static let `default` = GeometricScanConfig(
        minClusterPoints: 120,
        clusterDistanceThreshold: 0.08,
        minClusterSurfaceArea: 0.25,
        maxPointCount: 1800,
        ransacIterations: 150,
        ransacDistanceThreshold: 0.018,
        minPlaneInlierCount: 110,
        minTopCorners: 4
    )
}

enum GeometricValidationError: Error {
    case objectClusterTooSmall
    case insufficientPlaneDetection
    case cornerDetectionIncomplete
    case missingFloorPlane
}

struct GeometricFrameMeasurement {
    let dimensions: CargoDimensions
    let topCorners: [simd_float3]
    let topPlane: PlaneEquation
    let floorPlane: PlaneEquation
    let lengthAxis: simd_float3
    let widthAxis: simd_float3
    let heightAxis: simd_float3
}

final class MeshProcessor {

    static func measureCargoGeometry(
        from frame: ARFrame,
        floorPlane: PlaneEquation?,
        config: GeometricScanConfig = .default
    ) throws -> GeometricFrameMeasurement {
        guard let floorPlane else {
            throw GeometricValidationError.missingFloorPlane
        }

        let rawPoints = extractPointCloud(from: frame)
        let points = downsample(points: rawPoints, maxPoints: config.maxPointCount)

        guard let dominantCluster = dominantObjectCluster(from: points, config: config) else {
            throw GeometricValidationError.objectClusterTooSmall
        }

        let planes = detectDominantPlanes(
            in: dominantCluster,
            upAxis: simd_float3(0, 1, 0),
            config: config
        )

        guard let topPlane = planes.top, planes.sides.count >= 2 else {
            throw GeometricValidationError.insufficientPlaneDetection
        }

        let edges = planes.sides.compactMap { intersect(planeA: topPlane, planeB: $0) }
        guard edges.count >= 2 else {
            throw GeometricValidationError.insufficientPlaneDetection
        }

        let topCorners = detectTopCorners(topPlane: topPlane, sidePlanes: planes.sides)
        guard topCorners.count >= config.minTopCorners else {
            throw GeometricValidationError.cornerDetectionIncomplete
        }

        let (lengthAxis, widthAxis) = determineHorizontalAxes(edges: edges)
        let heightAxis = simd_float3(0, 1, 0)

        let length = projectedExtent(of: topCorners, axis: lengthAxis)
        let width = projectedExtent(of: topCorners, axis: widthAxis)
        let height = planeSeparation(topPlane: topPlane, floorPlane: floorPlane)

        let confidence = computeFrameConfidence(
            cornersCount: topCorners.count,
            sidePlaneCount: planes.sides.count,
            length: length,
            width: width,
            height: height
        )

        return GeometricFrameMeasurement(
            dimensions: CargoDimensions(length: length * 100, width: width * 100, height: height * 100, confidence: confidence),
            topCorners: topCorners,
            topPlane: topPlane,
            floorPlane: floorPlane,
            lengthAxis: lengthAxis,
            widthAxis: widthAxis,
            heightAxis: heightAxis
        )
    }

    static func averageDimensions(from buffer: [CargoDimensions]) -> CargoDimensions {
        guard !buffer.isEmpty else {
            return CargoDimensions(length: 0, width: 0, height: 0, confidence: 0)
        }

        let avgLength = buffer.map(\.length).reduce(0, +) / Float(buffer.count)
        let avgWidth = buffer.map(\.width).reduce(0, +) / Float(buffer.count)
        let avgHeight = buffer.map(\.height).reduce(0, +) / Float(buffer.count)
        let avgConfidence = buffer.map(\.confidence).reduce(0, +) / Double(buffer.count)

        return CargoDimensions(
            length: avgLength,
            width: avgWidth,
            height: avgHeight,
            confidence: avgConfidence
        )
    }

    static func confidenceScore(from buffer: [CargoDimensions]) -> Double {
        guard !buffer.isEmpty else { return 0 }

        let stableScore = stabilityScore(from: buffer)
        let meanConfidence = buffer.map(\.confidence).reduce(0, +) / Double(buffer.count)
        return min(1.0, max(0.0, (stableScore * 0.45) + (meanConfidence * 0.55)))
    }

    static func calculateCost(cbm: Float, rate: Double) -> Double {
        Double(cbm) * rate
    }

    static func projectTopOutline(_ points: [simd_float3], in arView: ARView?) -> [CGPoint] {
        guard let arView else { return [] }
        let projected = points.compactMap { point -> CGPoint? in
            arView.project(point)
        }
        return sortPolygon(points: projected)
    }

    private static func extractPointCloud(from frame: ARFrame) -> [simd_float3] {
        frame.anchors.compactMap { $0 as? ARMeshAnchor }.flatMap { anchor in
            (0..<anchor.geometry.vertices.count).compactMap { i in
                let local = anchor.geometry.vertex(at: UInt32(i))
                let world = anchor.transform * simd_float4(local.x, local.y, local.z, 1)
                return simd_float3(world.x, world.y, world.z)
            }
        }
    }

    private static func downsample(points: [simd_float3], maxPoints: Int) -> [simd_float3] {
        guard points.count > maxPoints, maxPoints > 0 else { return points }
        let stride = max(1, points.count / maxPoints)
        return stride(from: 0, to: points.count, by: stride).map { points[$0] }
    }

    private static func dominantObjectCluster(
        from points: [simd_float3],
        config: GeometricScanConfig
    ) -> [simd_float3]? {
        let clusters = segmentClusters(points: points, distanceThreshold: config.clusterDistanceThreshold)
            .filter { $0.count >= config.minClusterPoints }

        let scored = clusters.map { cluster -> (points: [simd_float3], area: Float) in
            let area = Float(cluster.count) * config.clusterDistanceThreshold * config.clusterDistanceThreshold
            return (cluster, area)
        }

        return scored
            .filter { $0.area >= config.minClusterSurfaceArea }
            .max(by: { $0.area < $1.area })?
            .points
    }

    private static func segmentClusters(points: [simd_float3], distanceThreshold: Float) -> [[simd_float3]] {
        guard !points.isEmpty else { return [] }

        struct Cell: Hashable {
            let x: Int
            let y: Int
            let z: Int
        }

        func cell(for p: simd_float3, size: Float) -> Cell {
            Cell(
                x: Int(floor(p.x / size)),
                y: Int(floor(p.y / size)),
                z: Int(floor(p.z / size))
            )
        }

        var buckets: [Cell: [Int]] = [:]
        for (i, point) in points.enumerated() {
            buckets[cell(for: point, size: distanceThreshold), default: []].append(i)
        }

        var visited = Array(repeating: false, count: points.count)
        var clusters: [[simd_float3]] = []

        for i in points.indices where !visited[i] {
            var queue = [i]
            visited[i] = true
            var head = 0
            var clusterIndices: [Int] = []

            while head < queue.count {
                let idx = queue[head]
                head += 1
                clusterIndices.append(idx)

                let p = points[idx]
                let c = cell(for: p, size: distanceThreshold)

                for dx in -1...1 {
                    for dy in -1...1 {
                        for dz in -1...1 {
                            let neighborCell = Cell(x: c.x + dx, y: c.y + dy, z: c.z + dz)
                            guard let candidates = buckets[neighborCell] else { continue }

                            for candidate in candidates where !visited[candidate] {
                                if simd_distance(points[candidate], p) <= distanceThreshold {
                                    visited[candidate] = true
                                    queue.append(candidate)
                                }
                            }
                        }
                    }
                }
            }

            clusters.append(clusterIndices.map { points[$0] })
        }

        return clusters
    }

    private static func detectDominantPlanes(
        in points: [simd_float3],
        upAxis: simd_float3,
        config: GeometricScanConfig
    ) -> (top: PlaneEquation?, sides: [PlaneEquation]) {
        var remaining = points
        var detected: [PlaneEquation] = []
        var iterations = 0

        while remaining.count >= config.minPlaneInlierCount && iterations < 7 {
            guard
                let (plane, inliers) = fitPlaneRANSAC(
                    points: remaining,
                    iterations: config.ransacIterations,
                    threshold: config.ransacDistanceThreshold,
                    minInliers: config.minPlaneInlierCount
                )
            else {
                break
            }

            detected.append(plane)
            remaining = remaining.enumerated().compactMap { inliers.contains($0.offset) ? nil : $0.element }
            iterations += 1
        }

        let topCandidates = detected.filter { abs(simd_dot($0.normal, upAxis)) > 0.85 }
        let sideCandidates = detected.filter { abs(simd_dot($0.normal, upAxis)) < 0.35 }

        let topPlane = topCandidates.max { a, b in
            let ay = -a.d * a.normal.y
            let by = -b.d * b.normal.y
            return ay < by
        }

        let sidePlanes = Array(sideCandidates.prefix(4))
        return (topPlane, sidePlanes)
    }

    private static func fitPlaneRANSAC(
        points: [simd_float3],
        iterations: Int,
        threshold: Float,
        minInliers: Int
    ) -> (PlaneEquation, Set<Int>)? {
        guard points.count >= 3 else { return nil }

        var bestPlane: PlaneEquation?
        var bestInliers = Set<Int>()

        for _ in 0..<iterations {
            let a = Int.random(in: 0..<points.count)
            let b = Int.random(in: 0..<points.count)
            let c = Int.random(in: 0..<points.count)
            if a == b || b == c || a == c { continue }

            let p1 = points[a]
            let p2 = points[b]
            let p3 = points[c]
            let normal = simd_cross(p2 - p1, p3 - p1)

            guard let plane = PlaneEquation(normal: normal, point: p1) else { continue }

            var inliers = Set<Int>()
            for (i, point) in points.enumerated() {
                if plane.absoluteDistance(to: point) <= threshold {
                    inliers.insert(i)
                }
            }

            if inliers.count > bestInliers.count {
                bestInliers = inliers
                bestPlane = plane
            }
        }

        guard let bestPlane, bestInliers.count >= minInliers else {
            return nil
        }

        return (bestPlane, bestInliers)
    }

    private static func intersect(planeA: PlaneEquation, planeB: PlaneEquation) -> EdgeLine? {
        let direction = simd_cross(planeA.normal, planeB.normal)
        let denom = simd_length_squared(direction)
        guard denom > 1e-8 else { return nil }

        let a11 = simd_dot(planeA.normal, planeA.normal)
        let a12 = simd_dot(planeA.normal, planeB.normal)
        let a21 = a12
        let a22 = simd_dot(planeB.normal, planeB.normal)

        let det = (a11 * a22) - (a12 * a21)
        guard abs(det) > 1e-8 else { return nil }

        let b1 = -planeA.d
        let b2 = -planeB.d

        let lambda1 = ((a22 * b1) - (a12 * b2)) / det
        let lambda2 = ((a11 * b2) - (a21 * b1)) / det
        let point = (lambda1 * planeA.normal) + (lambda2 * planeB.normal)

        return EdgeLine(point: point, direction: simd_normalize(direction))
    }

    private static func intersect(planeA: PlaneEquation, planeB: PlaneEquation, planeC: PlaneEquation) -> simd_float3? {
        let m = simd_float3x3(rows: [planeA.normal, planeB.normal, planeC.normal])
        let det = simd_determinant(m)
        guard abs(det) > 1e-6 else { return nil }

        let rhs = simd_float3(-planeA.d, -planeB.d, -planeC.d)
        return simd_inverse(m) * rhs
    }

    private static func detectTopCorners(topPlane: PlaneEquation, sidePlanes: [PlaneEquation]) -> [simd_float3] {
        var corners: [simd_float3] = []

        for i in 0..<sidePlanes.count {
            for j in (i + 1)..<sidePlanes.count {
                if let p = intersect(planeA: topPlane, planeB: sidePlanes[i], planeC: sidePlanes[j]) {
                    corners.append(p)
                }
            }
        }

        return dedupe(points: corners, epsilon: 0.03)
    }

    private static func determineHorizontalAxes(edges: [EdgeLine]) -> (simd_float3, simd_float3) {
        var horizontalEdges = edges
            .map { simd_normalize(simd_float3($0.direction.x, 0, $0.direction.z)) }
            .filter { simd_length($0) > 0.1 }

        if horizontalEdges.isEmpty {
            return (simd_float3(1, 0, 0), simd_float3(0, 0, 1))
        }

        let primary = horizontalEdges.removeFirst()
        let secondary = horizontalEdges.min(by: { abs(simd_dot($0, primary)) < abs(simd_dot($1, primary)) })
            ?? simd_normalize(simd_cross(simd_float3(0, 1, 0), primary))

        return (simd_normalize(primary), simd_normalize(secondary))
    }

    private static func projectedExtent(of points: [simd_float3], axis: simd_float3) -> Float {
        let normalizedAxis = simd_normalize(axis)
        let projections = points.map { simd_dot($0, normalizedAxis) }
        guard let minP = projections.min(), let maxP = projections.max() else { return 0 }
        return max(0, maxP - minP)
    }

    private static func planeSeparation(topPlane: PlaneEquation, floorPlane: PlaneEquation) -> Float {
        let alignedFloor = floorPlane.flippedIfNeeded(toAlignWith: topPlane.normal)
        return abs(topPlane.d - alignedFloor.d)
    }

    private static func computeFrameConfidence(
        cornersCount: Int,
        sidePlaneCount: Int,
        length: Float,
        width: Float,
        height: Float
    ) -> Double {
        let planeScore = min(1.0, Double(sidePlaneCount) / 4.0)
        let cornerScore = min(1.0, Double(cornersCount) / 4.0)
        let geometryValid = length > 0.05 && width > 0.05 && height > 0.05
        let geometryScore = geometryValid ? 1.0 : 0.2

        return min(1.0, (planeScore * 0.35) + (cornerScore * 0.45) + (geometryScore * 0.2))
    }

    private static func stabilityScore(from buffer: [CargoDimensions]) -> Double {
        guard buffer.count > 1 else { return buffer.first?.confidence ?? 0 }

        func score(for values: [Float]) -> Double {
            let mean = values.reduce(0, +) / Float(values.count)
            if mean <= 0.001 { return 0 }

            let variance = values.reduce(0) { partial, value in
                let delta = value - mean
                return partial + (delta * delta)
            } / Float(values.count)

            let cv = sqrt(variance) / mean
            return max(0, min(1, Double(1 - min(cv, 1))))
        }

        let l = score(for: buffer.map(\.length))
        let w = score(for: buffer.map(\.width))
        let h = score(for: buffer.map(\.height))
        return (l + w + h) / 3
    }

    private static func dedupe(points: [simd_float3], epsilon: Float) -> [simd_float3] {
        var result: [simd_float3] = []

        for point in points {
            let exists = result.contains { simd_distance($0, point) <= epsilon }
            if !exists {
                result.append(point)
            }
        }

        return result
    }

    private static func sortPolygon(points: [CGPoint]) -> [CGPoint] {
        guard points.count >= 3 else { return points }
        let center = CGPoint(
            x: points.map(\.x).reduce(0, +) / CGFloat(points.count),
            y: points.map(\.y).reduce(0, +) / CGFloat(points.count)
        )

        return points.sorted { a, b in
            atan2(a.y - center.y, a.x - center.x) < atan2(b.y - center.y, b.x - center.x)
        }
    }
}

private extension ARMeshGeometry {
    func vertex(at index: UInt32) -> simd_float3 {
        let vertexPointer = vertices.buffer.contents().advanced(by: vertices.offset + (vertices.stride * Int(index)))
        let vertex = vertexPointer.assumingMemoryBound(to: simd_float3.self).pointee
        return vertex
    }
}
